import deriveSystemTotals from './src/lib/utils/deriveSystemTotals.js';
import isTrackableUrl from './src/lib/utils/isTrackableUrl.js';
import samePageKey from './src/lib/utils/samePageKey.js';
import appendGroupingLog from './src/lib/utils/groupingLog.js';

let defaultWindowId;
let listening = true;
let removing;
// Tab ids whose `chrome.tabs.ungroup` is in flight. A navigated tab leaving a
// named group is added here before the async ungroup and removed in its
// callback; while present, the capture paths (`groupTabs` /
// `handleActiveTabsGroupChanges`) must refuse to record the tab into the group
// it is on its way out of, otherwise the new URL is permanently pushed into the
// old group's label during the async gap.
const pendingUngroups = new Set();

// Tab ids that Chrome placed into a group at creation time (native "a tab opened
// from a grouped tab inherits that group" behavior). Detected in onCreated when a
// brand-new tab is already in a group. These memberships are NOT user intent, so
// `groupTabs` must never record their URLs into a label (which would make them
// permanently sticky); instead it ungroups them once their real URL has loaded,
// unless that URL is already a deliberate member of the label.
const autoGroupedTabs = new Set();

// Diagnostic logging for the tab-grouping decision points. The prototype proved
// the auto-group stickiness bug with unconditional `[TC-GROUP]` console noise;
// keep that instrumentation behind a flag so it can be flipped on for future
// diagnosis without shipping console spam. Flip to `true` to trace to console.
const DEBUG_GROUPING = false;
// Cap for the persisted `groupingLog` ring buffer (see debugGroup).
const GROUPING_LOG_CAP = 200;
// Records a grouping decision breadcrumb. In addition to the compile-time
// console trace (`DEBUG_GROUPING`), it persists the breadcrumb to a capped ring
// buffer in `chrome.storage.local` when the runtime `debugGrouping` flag is set
// — MV3 recycles the worker constantly, so a bug that spans a restart (a doc
// recorded under one `?tab=` key, ejected after the worker died) is invisible to
// `console.log` alone. The persisted trail is inspectable after the fact via
// `chrome.storage.local.get('groupingLog')`, and enabled with no reload/source
// edit via `chrome.storage.local.set({ debugGrouping: true })`. Fire-and-forget:
// the async storage round-trip never blocks the caller.
function debugGroup(event, details) {
  if (DEBUG_GROUPING) console.log(`[TC-GROUP] ${event}`, details);
  getLocalStorage(['debugGrouping', 'groupingLog'], (result) => {
    if (!DEBUG_GROUPING && !result.debugGrouping) return;
    const groupingLog = appendGroupingLog(
      result.groupingLog,
      { t: Date.now(), event, details },
      GROUPING_LOG_CAP
    );
    update({ groupingLog });
  });
}

// Whether `urlKey` is a deliberate, recorded member of `label`. Centralizes the
// "is this URL bound to this label" check used across the grouping paths so the
// auto-group ejection logic and the recording logic share one definition.
function urlKeyIsMember(label, urlKey) {
  return !!(label && label.urlKeys.indexOf(urlKey) > -1);
}

// The LoadMeter gauge's scale, mirrored from src/lib/components/LoadMeter so the
// system fallback normalizes to the same 0→max range the gauge already renders.
// (The two runtimes — classic web app vs. service worker — can't share a module
// of plain constants, so this small duplication is intentional and commented.)
const GAUGE = {
  max: { cpu: 150, memory: 5 * 1024 * 1024 * 1024 },
  base: { cpu: 0, memory: 500 * 1024 * 1024 }
};

const SYSTEM_POLL_INTERVAL_MS = 5000;
let systemPollTimer = null;
let previousCpuSample = null;

// Auto-close ("Closer") engine tunables, mirrored from src/Constants.jsx
// (`AutoCloseMinutes` / `MaxAutoClosedTime`) for the same reason GAUGE is
// duplicated above: the service-worker runtime can't share the ES module of
// plain constants. AUTO_CLOSE_MINUTES is the default inactivity threshold used
// when the user hasn't set `settings.autoCloseMinutes`; MAX_AUTO_CLOSED_TIME is
// how long a closed entry lingers in the "Automatically Closed" list before the
// sweep prunes it (the UI filters by the same window).
const AUTO_CLOSE_MINUTES = 120;
const MAX_AUTO_CLOSED_TIME = 1000 * 60 * 60 * 24 * 5;
const AUTO_CLOSE_ALARM = 'auto-close-sweep';

// Per-visit history tunables, mirrored from src/lib/utils/visitDecay.js (the
// service-worker runtime can't import that ES module, same as the GAUGE /
// AUTO_CLOSE constants above). VISIT_RETENTION_MS: drop visit timestamps older
// than this on write; MAX_VISITS: cap retained timestamps per site. Retention is
// sized to the longest usage view the Favorites page draws (the 7-week
// sparkline) plus a week of margin — 8 weeks; old visits contribute negligible
// decayed weight to the rank but back the weekly usage-over-time view.
const VISIT_RETENTION_MS = 1000 * 60 * 60 * 24 * 56;
const MAX_VISITS = 50;

// A tab you switch back to earns a visit too, not just an open/navigation — so
// Favorites rewards sites you keep open and return to. But debounce it: rapid
// alt-tabbing between the same two tabs, or the open→immediately-activate
// sequence a brand-new tab produces, must not inflate a rank. At most one
// access-driven visit per site per this window.
const ACCESS_THROTTLE_MS = 1000 * 60 * 30;

// Drop visits older than the retention horizon and cap to the newest MAX_VISITS.
// Mirror of pruneVisits() in visitDecay.js; kept pure so it's obviously correct.
function pruneVisits(visits, now) {
  if (!Array.isArray(visits)) return [];
  const cutoff = now - VISIT_RETENTION_MS;
  const kept = visits
    .map(Number)
    .filter((ts) => Number.isFinite(ts) && ts > cutoff)
    .sort((a, b) => a - b);
  return kept.length > MAX_VISITS ? kept.slice(-MAX_VISITS) : kept;
}

let groups = {};
function trackGroup(group) {
  groups[parseInt(group.id)] = group.title;
}

chrome.tabGroups.onCreated.addListener((group) => trackGroup(group))
chrome.tabGroups.onUpdated.addListener((group) => trackGroup(group))
chrome.tabGroups.query({}, (groups) => {
  for (let i=0; i<groups.length; ++i) {
    trackGroup(groups[i]);
  }
});

initLoadSource();

// The Closer: a periodic alarm wakes the (ephemeral MV3) worker once a minute to
// sweep inactive tabs. Guarded because the test harness's chrome stub omits
// chrome.alarms; in the packaged extension the "alarms" permission makes it present.
if (chrome.alarms) {
  chrome.alarms.create(AUTO_CLOSE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === AUTO_CLOSE_ALARM) autoCloseSweep();
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.title === "TabCommand") defaultWindowId = tab.windowId;
  let updates = await tabUpdates(tab);
  
  const checkRemoving = () => {
    if (removing === tabId) {
      removing = null;
      return true;
    }
  };

  const activeTabs = (await getLocalStorage('activeTabs')).activeTabs || [];

  if (changeInfo.url) {
    if (checkRemoving()) return true;

    const oldTabUrl = activeTabs.filter(
      tabUrl => tabUrl.tabKey === `tab-${tabId}`
    )[0];
    if (oldTabUrl) {
      closeUrl(oldTabUrl.urlKey);

      // Only eject a grouped tab on a REAL navigation. A URL change that keeps
      // the same origin + pathname (only the query string or fragment moved) is
      // an in-page rewrite — most visibly Google Docs churning `?tab=t.…` via
      // the History API — and the tab must stay in its group. `oldTabUrl.urlKey`
      // is `url-<old-url-without-fragment>` (see getUrlKey), so strip the `url-`
      // prefix to recover the old URL for the comparison.
      const oldUrl = oldTabUrl.urlKey.replace(/^url-/, '');
      const isNavigation = samePageKey(oldUrl) !== samePageKey(changeInfo.url);

      if (tab.groupId > -1 && isNavigation) {
        debugGroup('onUpdated: eject grouped tab (navigation)', {
          tabId: tab.id,
          oldUrl,
          newUrl: changeInfo.url,
          groupId: tab.groupId
        });
        pendingUngroups.add(tab.id);
        chrome.tabs.ungroup(tab.id, () => {
          void (chrome.runtime && chrome.runtime.lastError);
          pendingUngroups.delete(tab.id);
        });
      } else if (tab.groupId > -1 && !isNavigation) {
        // In-page URL change on a grouped tab (e.g. Google Docs rewriting
        // `?tab=t.…` via the History API). The tab stays grouped, but its live
        // urlKey has now drifted away from the key recorded in the group's
        // label — every downstream exact-key comparison (groupTabs eject,
        // handleActiveTabsGroupChanges, post-restart reconciliation) would then
        // conclude the URL is no longer a member and drop it. Heal by rewriting
        // the drifted label slot to follow the live URL. We LOCATE the drifted
        // slot by page identity (samePageKey) — which also catches the case
        // where the recorded key is a third `?tab=` variant — but the
        // membership/eject paths still compare exact keys, so samePageKey never
        // becomes the membership test.
        let labelTitle = groups[tab.groupId];
        if (!labelTitle) {
          // Cold `groups` map (common right after a service-worker restart):
          // resolve the title straight from Chrome, mirroring the groupId === -1
          // branch below.
          const group = await getTabGroup(tab.groupId);
          labelTitle = group && group.title;
        }
        const label = labels[labelTitle];
        if (label) {
          const newUrlKey = getUrlKey(changeInfo.url);
          const idx = label.urlKeys.findIndex(
            k => samePageKey(k.replace(/^url-/, '')) === samePageKey(changeInfo.url)
          );
          if (idx > -1 && label.urlKeys[idx] !== newUrlKey) {
            const oldUrlKey = label.urlKeys[idx];
            if (label.urlKeys.indexOf(newUrlKey) > -1) {
              // Live key already recorded elsewhere in the label — drop the
              // stale slot instead of duplicating it.
              label.urlKeys.splice(idx, 1);
            } else {
              label.urlKeys[idx] = newUrlKey;
            }
            labels[labelTitle] = label;
            updates = { ...updates, labels: labels };
            debugGroup('onUpdated: heal drifted label urlKey', {
              tabId: tab.id,
              oldUrlKey,
              newUrlKey,
              label: labelTitle,
              groupId: tab.groupId
            });
          }
        }
      }
    }
    // This branch records the navigation directly (it does not pass through
    // validTab), so guard it so an incognito navigation never enters allUrls
    // or bumps visitCount. See validTab for the broader incognito policy.
    if (!tab.incognito) {
      updates = {
        ...updates,
        ...(await newUrl(tabId, changeInfo.url))
      };
    }
  }

  if (changeInfo.groupId === -1) {
    const activeTabIndex = activeTabs.findIndex(
      tabUrl => tabUrl.tabKey === `tab-${tabId}`
    );
    const activeTab = activeTabs[activeTabIndex];

    if (activeTab) {
      const oldGroupId = activeTab.groupId
      if (oldGroupId && oldGroupId > -1) {
        const labelTitle = groups[oldGroupId];
        const label = labels[labelTitle];
        if (label) {
          if (checkRemoving()) return true;
          const urlKeyIndex = label.urlKeys.indexOf(getUrlKey(tab.url));
          if (urlKeyIndex > -1) {
            label.urlKeys.splice(urlKeyIndex, 1)

            labels[labelTitle] = label
            activeTabs[activeTabIndex].groupId = -1;

            updates = {
              ...updates,
              labels: labels,
              activeTabs: activeTabs
            };
          }
        }
      }
    }
  }

  if (checkRemoving()) return true;

  update(updates);

  if (changeInfo.pinned || changeInfo.groupId) {
    updateActiveTabs();
  }
  
  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onActivated.addListener(async (tabInfo) => {
  updateActiveTabs();
  const updates = await recordAccess(tabInfo.tabId);
  if (updates) update(updates);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  // If groupId is already > -1 here, Chrome placed this brand-new tab into a
  // group before our code ran (native "open from group" inheritance). If it's
  // -1, any later grouping of this tab came from us (groupTabs).
  debugGroup('onCreated', {
    tabId: tab.id,
    url: tab.url,
    urlKey: getUrlKey(tab.url || ''),
    groupId: tab.groupId,
    pinned: tab.pinned,
    openerTabId: tab.openerTabId
  });
  // Chrome inherited this brand-new tab into a group on its own. Flag it so
  // groupTabs pulls it back out instead of permanently recording its URL.
  if (!tab.pinned && tab.groupId != null && tab.groupId > -1) {
    autoGroupedTabs.add(tab.id);
  }
  const updates = {
    ...(await tabUpdates(tab)),
    ...(await newUrl(tab.id, tab.url))
  }
  update(updates);

  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {

  updateActiveTabs();

  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  updateActiveTabs();
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  removing = tabId;
  autoGroupedTabs.delete(tabId);
  const activeTabs = (await getLocalStorage('activeTabs')).activeTabs || [];
  const oldTabUrl = activeTabs.filter(
    tabUrl => tabUrl.tabKey === `tab-${tabId}`
  )[0];
  if (oldTabUrl) {
    closeUrl(oldTabUrl.urlKey, updateActiveTabs);
  }
});

let waitingToUpdate = false;
updateActiveTabs();
async function updateActiveTabs() {
  if (waitingToUpdate) return;
  chrome.tabs.query({ windowType: chrome.tabs.WindowType.NORMAL }, async (tabs) => {
    if (!tabs) {
      waitingToUpdate = true;
      setTimeout(() => {
        waitingToUpdate = false;
        updateActiveTabs();
      }, 100);
      return;
    }

    getLocalStorage(['activeTabs', 'autoClosed'], (result) => {
      const activeTabs = result.activeTabs || [];
      const autoClosed = result.autoClosed || {};
      
      const newActiveTabs = tabs.sort(
        (a, b) => a.tabIndex - b.tabIndex
      );

      const updatedActiveTabs = newActiveTabs.filter(validTab).map(
        (tab) => {
          const existingTab = (activeTabs || []).filter(
            (activeTab) => activeTab.tabKey === `tab-${tab.id}`
          )[0];

          return {
            tabKey: `tab-${tab.id}`,
            urlKey: getUrlKey(tab.url),
            pinned: tab.pinned,
            groupId: tab.groupId,
            activeAt: (tab.active ? Date.now() : (existingTab ?? {}).activeAt),
            openedAt: (existingTab ?? { openedAt: Date.now() }).openedAt,
            tabCommandPinned: (existingTab ?? {}).tabCommandPinned,
            autoClosedAt: (autoClosed || {})[getUrlKey(tab.url)],
            active: tab.active
          }
        }
      );

      for (const activeTab of updatedActiveTabs) {
        if (activeTab.active && autoClosed[activeTab.urlKey]) {
          chrome.tabs.ungroup(parseInt(activeTab.tabKey.split('-')[1]));
          delete autoClosed[activeTab.urlKey];
        } else if (activeTab.groupId !== autoClosed.groupId && autoClosed[activeTab.urlKey]) {
          delete autoClosed[activeTab.urlKey];
        }
      }

      const updates = {
        activeTabs: updatedActiveTabs,
        autoClosed: autoClosed
      };

      update(updates);
    });
  });
}

// Resolve the active inactivity threshold (in minutes) from the user's settings,
// falling back to the AUTO_CLOSE_MINUTES default when unset. A value of 0 (the
// "Off" position on the Settings slider) disables auto-closing entirely — return
// 0 so the sweep skips the closing pass but still prunes stale entries.
function autoCloseThresholdMinutes(settings) {
  const configured = settings && settings.autoCloseMinutes;
  if (configured === undefined || configured === null || configured === '') {
    return AUTO_CLOSE_MINUTES;
  }
  const minutes = Number(configured);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

// A tab is eligible for auto-close when it is not Chrome-pinned, not
// thumbtack-pinned (tabCommandPinned), not the currently active tab, and its
// last activity (activeAt, falling back to openedAt) is at or before the cutoff.
// activeTabs entries are already validTab-filtered by updateActiveTabs, so no
// scheme check is needed here.
function isAutoCloseEligible(tab, cutoff) {
  if (!tab) return false;
  if (tab.pinned) return false;
  if (tab.tabCommandPinned) return false;
  if (tab.active) return false;
  const lastActive = tab.activeAt || tab.openedAt;
  if (!lastActive) return false;
  return lastActive <= cutoff;
}

// Drop auto-closed entries older than the retention window so the map (and the
// "Automatically Closed" list it feeds) doesn't grow unbounded. Mutates in place.
function pruneAutoClosed(autoClosed, now) {
  const maxTime = autoClosed.maxTime || MAX_AUTO_CLOSED_TIME;
  for (const urlKey of Object.keys(autoClosed)) {
    if (urlKey === 'maxTime') continue;
    if (now - autoClosed[urlKey] >= maxTime) {
      delete autoClosed[urlKey];
    }
  }
}

// The sweep itself: record + close every eligible inactive tab, then persist the
// updated autoClosed map. Writing autoClosed in this same synchronous pass (before
// the async chrome.tabs.remove callbacks fire onRemoved -> closeUrl -> updateActiveTabs)
// guarantees the downstream reconciliation reads our entries rather than clobbering them.
function autoCloseSweep() {
  getLocalStorage(['activeTabs', 'autoClosed', 'settings'], (result) => {
    const activeTabs = result.activeTabs || [];
    const autoClosed = result.autoClosed || {};
    const settings = result.settings || {};
    const now = Date.now();

    pruneAutoClosed(autoClosed, now);

    const minutes = autoCloseThresholdMinutes(settings);
    if (minutes > 0) {
      const cutoff = now - minutes * 60 * 1000;
      for (const tab of activeTabs) {
        if (!isAutoCloseEligible(tab, cutoff)) continue;
        autoClosed[tab.urlKey] = now;
        try {
          chrome.tabs.remove(parseTabId(tab), () => {
            // Swallow "No tab with id" — a stale tabId must not abort the sweep.
            void (chrome.runtime && chrome.runtime.lastError);
          });
        } catch (e) {
          console.log('Unable to auto-close tab', e);
        }
      }
    }

    update({ autoClosed });
  });
}

function update(updates) {
  chrome.storage.local.set(updates);
}

async function newUrl(tabId, url) {
  updateActiveTabs();
  if (!tabId) return;
  if (!url) return;
  // Only real websites belong in history/Favorites. Gating here (rather than at
  // each call site) means a non-http(s) navigation — about:blank, file://,
  // chrome://, data:, etc. — never enters allUrls, never evicts older keys, and
  // never bumps visitCount. Sits alongside the incognito/validTab policy:
  // about:blank previously slipped through because newUrl never consulted them.
  if (!isTrackableUrl(url)) return;
  return new Promise((resolve, reject) => {
    const updates = {};
    const urlKey = getUrlKey(url);
    getLocalStorage(['allUrls', 'labels', urlKey], (result) => {
      const allUrls = result.allUrls || [];
      if (allUrls.indexOf(urlKey) === -1) {
        allUrls.unshift(urlKey);

        if (allUrls.length >= 250) {
          let allLabelUrlKeys = [];
          for (const label in result.labels) {
            allLabelUrlKeys += result.labels[label].urlKeys;
          }

          const removeUrlKeys = allUrls.slice(250);
          for (const removeUrlKey of removeUrlKeys) {
            if (allLabelUrlKeys.indexOf(removeUrlKey) === -1) {
              chrome.storage.local.remove(removeUrlKey);
            }
          }
        }

        updates.allUrls = allUrls.slice(0, 250);
      }

      // Track WHEN and how often each site is visited so Favorites can rank by a
      // time-decayed sum of visits. Append a fresh timestamp and prune the array
      // (retention horizon + length cap) so per-site history stays bounded.
      // Additive: existing url-* fields are preserved, visitCount keeps
      // incrementing for backward-compat/display, and records without a `visits`
      // array are seeded lazily downstream (see rankFavorites).
      const now = Date.now();
      const urlRecord = result[urlKey] || { url };
      updates[urlKey] = {
        ...urlRecord,
        visitCount: (urlRecord.visitCount || 0) + 1,
        visits: pruneVisits([...(urlRecord.visits || []), now], now),
      };

      resolve(updates)
    });
  });
}

// Record a visit when a tab is ACTIVATED (switched to), throttled per site.
// Resolves the activated tab, ignores untrackable/missing tabs, and only counts
// the access as a visit when the site's most recent visit is older than
// ACCESS_THROTTLE_MS — otherwise the open→activate sequence and alt-tabbing
// would double-count. Delegates the actual write to newUrl so access-visits and
// open-visits stay identical in shape (allUrls maintenance, visits/visitCount,
// pruning). Returns newUrl's updates object, or undefined when throttled/ineligible.
async function recordAccess(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    return; // tab gone / lastError — nothing to record
  }
  if (!tab || !tab.url || !isTrackableUrl(tab.url)) return;

  const urlKey = getUrlKey(tab.url);
  const result = await getLocalStorage(urlKey);
  const record = result[urlKey];
  const visits = (record && record.visits) || [];
  const lastVisit = visits.length ? Math.max(...visits.map(Number)) : 0;

  const now = Date.now();
  if (now - lastVisit < ACCESS_THROTTLE_MS) return; // within throttle window

  return newUrl(tab.id, tab.url);
}

function closeUrl(urlKey, callback) {
  getLocalStorage('allUrls', (result) => {
    const allUrls = result.allUrls || [];
    const oldIndex = allUrls.indexOf(urlKey);
    allUrls.splice(0, 0, allUrls.splice(oldIndex, 1)[0]);
    update({ allUrls: allUrls });
    if (callback) return callback();
  });
}

function processesApiAvailable() {
  return !!(typeof chrome !== 'undefined' && chrome.processes && chrome.processes.onUpdatedWithMemory);
}

function systemApiAvailable() {
  return !!(
    typeof chrome !== 'undefined' &&
    chrome.system && chrome.system.cpu && chrome.system.memory
  );
}

// Channel-based degradation for the Browser Load gauge:
// - Dev/Canary (chrome.processes present): true per-process + per-tab data,
//   loadDataSource written as 'processes' alongside processTotals.
// - Stable Chrome (chrome.system.* present): whole-browser/OS load drives the
//   gauge, loadDataSource 'system'. Per-tab data is unavailable by necessity.
// - Neither (permissions denied): loadDataSource 'none' so the UI can say so.
function initLoadSource() {
  if (processesApiAvailable()) {
    // processProcesses writes loadDataSource:'processes' with the first totals,
    // so there is no storage write at load time on this path.
    listenToProcesses();
    return;
  }
  if (systemApiAvailable()) {
    startSystemLoadPolling();
    return;
  }
  update({ loadDataSource: 'none' });
}

function listenToProcesses() {
  try {
    chrome.processes.onUpdatedWithMemory.addListener(processProcesses);
  } catch (e) {
    console.log("Unable to listen to processes", e);
  }
}

function getSystemCpuInfo() {
  return Promise.resolve().then(() => chrome.system.cpu.getInfo());
}

function getSystemMemoryInfo() {
  return Promise.resolve().then(() => chrome.system.memory.getInfo());
}

function startSystemLoadPolling() {
  if (systemPollTimer) return;
  const poll = async () => {
    // Defensive: if the richer processes API appears mid-session, switch to it.
    if (processesApiAvailable()) {
      stopSystemLoadPolling();
      listenToProcesses();
      return;
    }
    await pollSystemLoad();
    systemPollTimer = setTimeout(poll, SYSTEM_POLL_INTERVAL_MS);
  };
  poll();
}

function stopSystemLoadPolling() {
  if (systemPollTimer) {
    clearTimeout(systemPollTimer);
    systemPollTimer = null;
  }
}

async function pollSystemLoad() {
  try {
    const cpuInfo = await getSystemCpuInfo();
    const memoryInfo = await getSystemMemoryInfo();
    const processTotals = deriveSystemTotals(
      previousCpuSample,
      cpuInfo,
      memoryInfo,
      GAUGE
    );
    previousCpuSample = cpuInfo;
    update({ processTotals, loadDataSource: 'system' });
  } catch (e) {
    console.log("Unable to sample system load", e);
    stopSystemLoadPolling();
    update({ loadDataSource: 'none' });
  }
}

let samples = 0;
let processesIndex = { global: 0 };
async function processProcesses(processes) {
  samples += 1;
  processesIndex.global += 1;

  let updates = {
    loadDataSource: 'processes',
    processTotals: {
      cpu: 0,
      network: 0,
      privateMemory: 0,
      jsMemoryAllocated: 0,
      jsMemoryUsed: 0
    }
  }

  for (const pid in processes) {
    updates = updateTotals(processes[pid], updates);
    updates = await associateProcess(processes[pid], updates);
  }

  update(updates);

  if (samples > 10) {
    samples = 0;
    try {
      chrome.processes.onUpdatedWithMemory.removeListener(processProcesses);
    } catch (e) {
      console.log("Unable to remove processes listener", e);
    }
    
    listening = false;
    setTimeout(() => {
      if (!listening) {
        listenToProcesses();
      }
    }, 15000);
  }
}

function updateTotals(process, updates) {
  updates.processTotals.cpu += process.cpu || 0;
  updates.processTotals.network += process.network || 0;
  updates.processTotals.privateMemory += process.privateMemory || 0;
  updates.processTotals.jsMemoryAllocated += process.jsMemoryAllocated || 0;
  updates.processTotals.jsMemoryUsed += process.jsMemoryUsed || 0;
  return updates;
}

async function associateProcess(process, updates) {
  const tabIds = process.tasks.map(
    (task) => task.tabId
  ).filter(
    (tabId) => tabId !== undefined
  );

  for (tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      updates = {
        ...updates,
        ...(await tabUpdates(tab, process, updates))
      };
    } catch (e) {
    }
  }
  return updates;
}

async function tabUpdates(tab, process, updates) {
  return new Promise((resolve, reject) => {
    if (!validTab(tab)) {
      resolve({});
    }

    const urlKey = getUrlKey(tab.url);
    if (updates && updates[urlKey]) {
      resolve({ [urlKey]: urlUpdates(updates[urlKey], tab, process) });
    }

    getLocalStorage(urlKey, (result) => {
      const url = result[urlKey] || { url: tab.url };
      resolve({ [urlKey]: urlUpdates(url, tab, process) });
    });
  });
}

function urlUpdates(url, tab, process) {
  if (!url.processes || !url.processes.samples) {
    url.processes = {
      samples: 0,
      cpu: 0,
      network: 0,
      privateMemory: 0,
      jsMemoryAllocated: 0,
      jsMemoryUsed: 0
    }
  }

  // A user-edited record pins its title/favicon: skip the live-tab reassignment
  // so a curated title/favicon isn't clobbered on the next tracking tick.
  if (!url.edited && tab.status !== "loading" && tab.title && tab.title.length > 0) url.title = tab.title;
  if (!url.title || !url.title.length) url.title = url.url;
  if (!url.edited && tab.favIconUrl) url.favicon = tab.favIconUrl;
  if (tab.groupId !== url.groupId) url.groupId = tab.groupId;

  if (process) {
    if (processesIndex[tab.url] !== processesIndex.global) {
      processesIndex[tab.url] = processesIndex.global;
      url.processes.samples += 1;

      if (url.processes.samples > 100) {
        url.processes.cpu = (url.processes.cpu / url.processes.samples)
        url.processes.network = (url.processes.network / url.processes.samples)
        url.processes.privateMemory = (url.processes.privateMemory / url.processes.samples)
        url.processes.jsMemoryAllocated = (url.processes.jsMemoryAllocated / url.processes.samples)
        url.processes.jsMemoryUsed = (url.processes.jsMemoryUsed / url.processes.samples)
        url.processes.samples = 1;
      }
    }

    url.processes.cpu += process.cpu || 0;
    url.processes.network += process.network || 0;
    url.processes.privateMemory += process.privateMemory || 0;
    url.processes.jsMemoryAllocated += process.jsMemoryAllocated || 0;
    url.processes.jsMemoryUsed += process.jsMemoryUsed || 0;
  }
  return url;
}

function getUrlKey(url) {
  return `url-${url.split('#')[0]}`;
}

// Bidirectional Chrome group-color <-> hex map. Lifted to module scope so both
// `groupTabs` (group.color -> hex when seeding a label) and
// `handleActiveTabsGroupChanges` (seeding a missing label on the add path) share
// one definition. Passing a hex returns the named color and vice versa.
function mapColors(labelColor) {
  const map = {
    '#5F6367': 'grey',
    '#1873E4': 'blue',
    '#DA2F25': 'red',
    '#E47415': 'yellow',
    '#1F8E43': 'green',
    '#D01882': 'pink',
    '#9334E2': 'purple',
    '#007B82': 'cyan'
  };
  for (const key of Object.keys(map)) map[map[key]] = key;
  return map[labelColor];
}

function validTab(tab) {
  // Incognito visits are intentionally never persisted — they must leave no
  // trace in history/activeTabs, so they can never surface in Search or
  // Favorites. Treat them as invalid everywhere validTab is consulted.
  return tab.url &&
    tab.url.length &&
    !tab.incognito &&
    tab.url.indexOf('chrome://') === -1 &&
    tab.url.indexOf('devtools://') === -1 &&
    tab.url.indexOf('chrome-extension://') === -1
}




let labels = {};
let activeTabs = [];
getLocalStorage(['labels', 'activeTabs'], (result) => {
  labels = result.labels || {};
  activeTabs = result.activeTabs || [];
  groupTabs(activeTabs, labels);
});

chrome.storage.onChanged.addListener(
  (changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes.labels && !changes.activeTabs) return;

    if (changes.labels) {
      labels = changes.labels.newValue;
    }

    if (changes.activeTabs) {
      activeTabs = changes.activeTabs.newValue;
      handleActiveTabsGroupChanges(changes.activeTabs);
    }

    groupTabs(activeTabs, labels);

    if (changes.labels) {
      const previous = changes.labels.oldValue;
      getLocalStorage('previousLabels', (result) => {
        const previousLabels = result.previousLabels || [];
        if (previousLabels.length >= 10) {
          previousLabels.pop();
        }
        previousLabels.unshift(previous);
        update({ previousLabels: previousLabels });
      });
    }
  }
);

function getTabGroup(id) {
  return new Promise(
    (resolve, reject) => {
      if (!id || id === -1) {
        resolve(null);
      } else {
        chrome.tabGroups.get(id, (group) => {
          resolve(group);
        });
      }
    }
  );
}

function getLocalStorage(query, callback) {
  return new Promise(
    (resolve, reject) =>
      chrome.storage.local.get(query, (result) => {
        if (callback) {
          callback(result);
          return;
        }
        resolve(result);
      })
  );
}

function parseTabId(tab) {
  return parseInt(tab.tabKey.split('-')[1]);
}

async function handleActiveTabsGroupChanges(changes) {
  const { newValue, oldValue } = changes;

  if (!oldValue) return;

  for (const oldTab of oldValue) {
    const newTab = newValue.filter(
      (tab) => tab.tabKey === oldTab.tabKey
    )[0];

    if (!newTab) continue;
    if (newTab.pinned) continue;

    if (oldTab.groupId !== newTab.groupId) {
      const oldGroup = await (
        getTabGroup(oldTab.groupId).catch(
          () => { }
        )
      );

      const newGroup = await (
        getTabGroup(newTab.groupId).catch(
          () => { }
        )
      );

      if (!oldGroup || !newGroup || newGroup.title === "~~~ CLOSING ~~~") continue;

      const { labels } = await getLocalStorage('labels') || {};

      let changed = false;
      if (newGroup) {
        // Seed the label before pushing — the old `|| { urlKeys: [] }` fallback
        // was never written back, so pushing into `labels[newGroup.title]` threw
        // when the label did not exist yet.
        labels[newGroup.title] ||= {
          title: newGroup.title,
          urlKeys: [],
          color: mapColors(newGroup.color)
        };
        const label = labels[newGroup.title];
        // Skip a tab mid-ungroup for the same reason as in `groupTabs`.
        if (
          label.urlKeys.indexOf(newTab.urlKey) === -1 &&
          !pendingUngroups.has(parseTabId(newTab))
        ) {
          // A tab's groupId changed and we're now recording its URL into the
          // destination label permanently (makes it sticky/auto-group).
          debugGroup('handleActiveTabsGroupChanges: record urlKey into label', {
            tabId: parseTabId(newTab),
            urlKey: newTab.urlKey,
            label: newGroup.title,
            oldGroupId: oldTab.groupId,
            newGroupId: newTab.groupId
          });
          // An explicit groupId change is user intent — this overrides any
          // earlier auto-grouped flag so groupTabs won't later yank the tab out.
          autoGroupedTabs.delete(parseTabId(newTab));
          label.urlKeys.push(newTab.urlKey);
          changed = true;
        }
      }

      if (oldGroup && labels[oldGroup.title]) {
        const index = labels[oldGroup.title].urlKeys.indexOf(newTab.urlKey);
        if (index > -1) {
          labels[oldGroup.title].urlKeys.splice(index, 1);
          changed = true;
        }
      }

      if (changed) update({ labels: labels });
    }
  }
}

// Pull a Chrome-auto-inherited tab back out of the group it was born into.
// Returns one of:
//   'wait'    — the real URL has not loaded yet; act on a later pass
//   'kept'    — fresh storage shows the URL is a genuine member; left grouped
//   'ejected' — ungroup issued
// In every case the caller should `continue` (the tab is fully handled here).
// The fresh-storage re-check guards against an ungroup→regroup flicker: `labels`
// passed to groupTabs is an in-memory snapshot, and an overlapping event (or an
// in-app drag) may have just made this URL a member after the snapshot was taken.
async function ejectAutoGroupedTab(activeTab, groupTitle) {
  const tabId = parseTabId(activeTab);

  if (!activeTab.urlKey || activeTab.urlKey === 'url-') return 'wait';

  const freshLabels = (await getLocalStorage('labels')).labels || {};
  if (urlKeyIsMember(freshLabels[groupTitle], activeTab.urlKey)) {
    autoGroupedTabs.delete(tabId);
    return 'kept';
  }

  debugGroup('groupTabs: ungroup Chrome-auto-grouped tab (not a label member)', {
    tabId,
    urlKey: activeTab.urlKey,
    label: groupTitle,
    groupId: activeTab.groupId
  });

  autoGroupedTabs.delete(tabId);
  pendingUngroups.add(tabId);
  chrome.tabs.ungroup(tabId, () => {
    void (chrome.runtime && chrome.runtime.lastError);
    pendingUngroups.delete(tabId);
  });
  return 'ejected';
}

// Record an in-group tab's URL into its group's label, seeding the label when it
// doesn't exist yet, and persist. This is the "make membership permanent" path —
// it now runs only for non-auto-grouped tabs (e.g. startup sync of pre-existing
// Chrome groups), never for Chrome's per-tab inheritance.
function recordInGroupTab(labels, group, activeTab) {
  const label = labels[group.title];
  debugGroup('groupTabs: record in-group tab urlKey into label', {
    tabId: parseTabId(activeTab),
    urlKey: activeTab.urlKey,
    label: group.title,
    groupId: activeTab.groupId,
    labelExisted: !!label
  });

  if (!label) {
    labels[group.title] = {
      title: group.title,
      urlKeys: [activeTab.urlKey],
      color: mapColors(group.color)
    };
  } else {
    label.urlKeys.push(activeTab.urlKey);
  }
  update({ labels: labels });
}

async function groupTabs(activeTabs, labels) {
  const groupLabeledTab = async (tabs, label) => {
    const unpinnedTabIds = [];
    for (const tab of tabs) {
      if (!tab.pinned) unpinnedTabIds.push(parseTabId(tab));
    }

    const labelTitle = label.title;

    chrome.tabGroups.query({ title: labelTitle }, async (groups) => {
      if (!groups) return;
      
      if (groups.length === 0) {
        // We are creating a NEW Chrome group and putting these tabs in it.
        debugGroup('groupTabs: chrome.tabs.group -> NEW group', {
          label: labelTitle,
          tabIds: unpinnedTabIds
        });
        chrome.tabs.group({ tabIds: unpinnedTabIds }, (groupId) => {
          chrome.tabGroups.update(groupId, {
            title: labelTitle,
            color: mapColors(label.backgroundColor)
          });
        });
      } else {
        if (defaultWindowId && groups[0].windowId !== defaultWindowId) {
          const existingGroupTabs = activeTabs.filter(
            t => t.groupId === groups[0].id
          );

          const existingGroupTabIds = existingGroupTabs.map(
            t => parseInt(t.tabKey.split('-')[1])
          );

          await chrome.tabs.remove(existingGroupTabIds);

          for (const tab of existingGroupTabs) {
            await chrome.tabs.create({ url: tab.urlKey.split('-')[1] });
          }
        } else {
          // We are adding these tabs to an EXISTING Chrome group.
          debugGroup('groupTabs: chrome.tabs.group -> EXISTING group', {
            label: labelTitle,
            groupId: groups[0].id,
            tabIds: unpinnedTabIds
          });
          chrome.tabs.group({ tabIds: unpinnedTabIds, groupId: groups[0].id });
        }
      }
    });
  };

  const labelTabIds = {};
  for (const activeTab of activeTabs) {
    if (activeTab.pinned) continue;
    if (activeTab.groupId && activeTab.groupId > -1) {
      const group = await (
        getTabGroup(activeTab.groupId).catch(
          () => { }
        )
      );

      if (!group || group.title === "~~~ CLOSING ~~~") continue;
      // A tab whose ungroup is in flight is on its way OUT of this group — its
      // stored URL is the destination it navigated to, not a member of the
      // group. Never record it, or the new URL gets stranded in the old label.
      if (pendingUngroups.has(parseTabId(activeTab))) continue;

      const label = labels[group.title];

      if (urlKeyIsMember(label, activeTab.urlKey)) {
        // The URL is a deliberate member of this label — confirmed intent.
        // Whatever put the tab here, it belongs; stop tracking it as auto-grouped.
        autoGroupedTabs.delete(parseTabId(activeTab));
        continue;
      }

      // Chrome auto-inherited this tab into the group (flagged at onCreated) and
      // its URL is NOT a deliberate member. Eject it instead of making it sticky.
      if (autoGroupedTabs.has(parseTabId(activeTab))) {
        await ejectAutoGroupedTab(activeTab, group.title);
        continue;
      }

      // Non-auto-grouped tab sitting in a group with an unrecorded URL — record it
      // (startup-sync path; Chrome's per-tab inheritance is handled above).
      recordInGroupTab(labels, group, activeTab);

      labelTabIds[group.title] ||= [];
      labelTabIds[group.title].push(activeTab);
    } else {
      let found = false;
      for (const labelTitle of Object.keys(labels)) {
        if (labels[labelTitle].urlKeys.indexOf(activeTab.urlKey) > -1) {
          found = true;
          // An ungrouped tab's URL matches a label's sticky urlKeys, so we will
          // auto-add it to that group. If you didn't expect this URL to be a
          // member, the urlKey got recorded earlier (see the record logs above).
          debugGroup('groupTabs: auto-group ungrouped tab (urlKey matched label)', {
            tabId: parseTabId(activeTab),
            urlKey: activeTab.urlKey,
            label: labelTitle
          });
          labelTabIds[labelTitle] ||= [];
          labelTabIds[labelTitle].push(activeTab);
        }
      }

      if (!found && activeTab.groupId > -1) {
        // Tab is in a group but no label claims its URL — we ungroup it.
        debugGroup('groupTabs: ungroup tab (no matching label)', {
          tabId: parseTabId(activeTab),
          urlKey: activeTab.urlKey,
          groupId: activeTab.groupId
        });
        chrome.tabs.ungroup(parseTabId(activeTab));
      }
    }
  }

  for (const labelTitle of Object.keys(labelTabIds)) {
    groupLabeledTab(labelTabIds[labelTitle], labels[labelTitle]);
  }
}