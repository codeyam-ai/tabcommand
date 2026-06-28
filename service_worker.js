import deriveSystemTotals from './src/lib/utils/deriveSystemTotals.js';

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

      if (tab.groupId > -1) {
        pendingUngroups.add(tab.id);
        chrome.tabs.ungroup(tab.id, () => {
          void (chrome.runtime && chrome.runtime.lastError);
          pendingUngroups.delete(tab.id);
        });
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

chrome.tabs.onActivated.addListener((tabInfo) => {
  updateActiveTabs();
});

chrome.tabs.onCreated.addListener(async (tab) => {
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

      // Track how often each site is visited so Favorites can blend frequency
      // with recency. Additive: existing url-* fields are preserved, and records
      // without visitCount are treated as 0 everywhere downstream.
      const urlRecord = result[urlKey] || { url };
      updates[urlKey] = {
        ...urlRecord,
        visitCount: (urlRecord.visitCount || 0) + 1,
      };

      resolve(updates)
    });
  });
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

  if (tab.status !== "loading" && tab.title && tab.title.length > 0) url.title = tab.title;
  if (!url.title || !url.title.length) url.title = url.url;
  if (tab.favIconUrl) url.favicon = tab.favIconUrl;
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

      if (label && label.urlKeys.indexOf(activeTab.urlKey) > -1) continue;

      if (!label) {
        labels[group.title] = {
          title: group.title,
          urlKeys: [activeTab.urlKey],
          color: mapColors(group.color)
        }
      } else {
        labels[group.title].urlKeys.push(activeTab.urlKey);
      }
      update({ labels: labels });

      labelTabIds[group.title] ||= [];
      labelTabIds[group.title].push(activeTab);
    } else {
      let found = false;
      for (const labelTitle of Object.keys(labels)) {
        if (labels[labelTitle].urlKeys.indexOf(activeTab.urlKey) > -1) {
          found = true;
          labelTabIds[labelTitle] ||= [];
          labelTabIds[labelTitle].push(activeTab);
        }
      }

      if (!found && activeTab.groupId > -1) {
        chrome.tabs.ungroup(parseTabId(activeTab));
      }
    }
  }

  for (const labelTitle of Object.keys(labelTabIds)) {
    groupLabeledTab(labelTabIds[labelTitle], labels[labelTitle]);
  }
}