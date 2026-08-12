import deriveSystemTotals from './src/lib/utils/deriveSystemTotals.js';
import isTrackableUrl from './src/lib/utils/isTrackableUrl.js';
import samePageKey from './src/lib/utils/samePageKey.js';
import pruneDeletedUrls from './src/lib/utils/pruneDeletedUrls.js';
import appendGroupingLog from './src/lib/utils/groupingLog.js';
import healDriftedLabelSlot from './src/lib/utils/healDriftedLabelSlot.js';
import navigatedAwayFromRecordedSlot from './src/lib/utils/navigatedAwayFromRecordedSlot.js';
import { buildGroupRemovalEntry, GROUP_REMOVAL_LOG_KEY, GROUP_REMOVAL_LOG_CAP, RemovalSource } from './src/lib/utils/groupRemovalLog.js';
import { buildGroupAdditionEntry, GROUP_ADDITION_LOG_KEY, GROUP_ADDITION_LOG_CAP, AdditionSource } from './src/lib/utils/groupAdditionLog.js';
import { buildGroupMoveEntry, GROUP_MOVE_LOG_KEY, GROUP_MOVE_LOG_CAP, MoveSource } from './src/lib/utils/groupMoveLog.js';
import { needsGroupCall, needsUngroupCall, bucketTabsByWindow } from './src/lib/utils/tabPlacement.js';
import findLabelForUrlKey from './src/lib/utils/findLabelForUrlKey.js';
import deletedLabelTitles from './src/lib/utils/deletedLabelTitles.js';
import { areaForKey } from './src/lib/utils/storageAreas.js';
import { readByArea, writeByArea } from './src/lib/utils/storageAccess.js';
import { migrateLabelsToSync } from './src/lib/utils/migrateLabelsToSync.js';

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

// Label titles the user has deleted during this worker's lifetime. Deleting a
// group dissolves its Chrome tab group (see `dissolveDeletedLabelGroups`), but
// that is async and unreliable in the tail cases — a second window's group
// queried later, an ungroup that fails — and any tab still sitting in a titled
// Chrome group with no matching label reaches `recordInGroupTab`, which
// helpfully re-creates the label the user just deleted. This is the belt to that
// suspenders: while a title is in here, the record path refuses to seed it.
//
// Keyed by TITLE rather than tab id (unlike the two Sets above) because that is
// what a deletion actually identifies. A title is removed again the moment it
// reappears in `labels`, so deliberately re-creating a group with the same name
// works immediately. Startup sync of a genuinely pre-existing Chrome group is
// untouched: its title was never deleted here, so it was never added.
const userDeletedLabels = new Set();

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
  getStorage(['debugGrouping', 'groupingLog'], (result) => {
    if (!DEBUG_GROUPING && !result.debugGrouping) return;
    const groupingLog = appendGroupingLog(
      result.groupingLog,
      { t: Date.now(), event, details },
      GROUPING_LOG_CAP
    );
    update({ groupingLog });
  });
}

// Records a group-membership removal to an always-on audit trail. Unlike
// `debugGroup`, this is NOT gated by `DEBUG_GROUPING`/`debugGrouping` — member
// removals are rare and low-volume, and the whole reason the CodeYam Fleet drop
// was undiagnosable is that the only trail was behind a default-off flag. The
// trail persists to a dedicated `groupRemovalLog` key (never buried by, or
// trimmed with, the noisy auto-group breadcrumbs in `groupingLog`) and is
// inspectable after the fact with no flag and no reload:
//   chrome.storage.local.get('groupRemovalLog', console.log)
// Fire-and-forget: the async storage round-trip never blocks the caller, and it
// only records removals — it never changes removal behavior.
function recordRemoval(source, details) {
  getStorage([GROUP_REMOVAL_LOG_KEY], (result) => {
    update({
      [GROUP_REMOVAL_LOG_KEY]: appendGroupingLog(
        result[GROUP_REMOVAL_LOG_KEY],
        buildGroupRemovalEntry(source, { ...details, t: Date.now() }),
        GROUP_REMOVAL_LOG_CAP
      )
    });
  });
}

// Records a group-membership ADDITION to an always-on audit trail — the mirror
// image of `recordRemoval`, and unconditional for the same reason. The phantom
// "App Store Connect" members that kept appearing in the CodeYam group could
// only be diagnosed by reading the code, because nothing recorded which path
// appended them; this trail names the exact source on every add. Persists to its
// own `groupAdditionLog` key so it is never buried by, or trimmed with, the
// noisy auto-group breadcrumbs in `groupingLog`:
//   chrome.storage.local.get('groupAdditionLog', console.log)
// Fire-and-forget: the async storage round-trip never blocks the caller, and it
// only records additions — it never changes grouping behavior.
function recordAddition(source, details) {
  getStorage([GROUP_ADDITION_LOG_KEY], (result) => {
    update({
      [GROUP_ADDITION_LOG_KEY]: appendGroupingLog(
        result[GROUP_ADDITION_LOG_KEY],
        buildGroupAdditionEntry(source, { ...details, t: Date.now() }),
        GROUP_ADDITION_LOG_CAP
      )
    });
  });
}

// Records an issued tab MOVE to an always-on audit trail — the third sibling of
// `recordRemoval` / `recordAddition`, and unconditional for the same reason.
// Those two trail label MEMBERSHIP; neither sees the thing the user actually
// notices, which is the tab jumping position in the strip. `chrome.tabs.group`
// and `chrome.tabs.ungroup` reposition a tab on every call, so "TabCommand keeps
// moving my tabs" is a report about issued calls — and it was undiagnosable
// without a trail of them.
//
// Called ONLY after the `needsGroupCall` / `needsUngroupCall` guards pass, i.e.
// only where a real move is about to happen. A suppressed no-op leaves no entry,
// so a quiet steady state reads as an empty trail rather than a guess. Persists
// to its own `groupMoveLog` key so it is never buried by, or trimmed with, the
// noisy auto-group breadcrumbs in `groupingLog`:
//   chrome.storage.local.get('groupMoveLog', console.log)
// Fire-and-forget: the async storage round-trip never blocks the caller, and it
// only records moves — it never changes placement behavior. The write cannot
// re-enter the grouping loop: `storage.onChanged` bails unless `labels` or
// `activeTabs` changed, and this touches neither.
function recordMove(source, details) {
  getStorage([GROUP_MOVE_LOG_KEY], (result) => {
    update({
      [GROUP_MOVE_LOG_KEY]: appendGroupingLog(
        result[GROUP_MOVE_LOG_KEY],
        buildGroupMoveEntry(source, { ...details, t: Date.now() }),
        GROUP_MOVE_LOG_CAP
      )
    });
  });
}

// Record one move entry per tab actually handed to `chrome.tabs.group`. Both
// grouping branches (create-a-new-group and add-to-an-existing-group) need the
// identical loop, and a batched Chrome call moves every tab in it — so the trail
// records per tab, not per call.
function recordGroupMoves(tabs, toGroupId, labelTitle) {
  for (const tab of tabs) {
    recordMove(MoveSource.WORKER_AUTO_GROUP, {
      action: 'group',
      tabId: parseTabId(tab),
      fromGroupId: tab.groupId,
      toGroupId,
      labelTitle,
      urlKey: tab.urlKey
    });
  }
}

// Resolve a group id to its label title, preferring the in-memory `groups` map
// and falling back to Chrome. The fallback is not an optimization detail: right
// after an MV3 service-worker restart the map is COLD, and both onUpdated
// branches that need a title run in exactly that window.
async function resolveGroupTitle(groupId) {
  const cached = groups[groupId];
  if (cached) return cached;
  const group = await getTabGroup(groupId);
  return group && group.title;
}

// Stamp an `activeTabs` entry with the label slot its URL was just filed under.
// This is what lets a later grouping sync tell "the tab I already recorded has
// navigated" apart from "a genuinely new URL joined the group" — without it,
// every navigation of a grouped tab looked like a brand-new member and got
// appended (the phantom "App Store Connect" rows).
//
// It has to live ON the activeTabs entry rather than in a module-level Map:
// MV3 tears the worker down constantly, and the post-teardown sync is exactly
// the window where the bogus append happens, so an in-memory map would be empty
// precisely when it is needed. `activeTabs` already persists to
// `chrome.storage.local` and its entries vanish when the tab closes, so cleanup
// is free. Returns whether the stamp actually changed, so a caller on a hot path
// does not write `activeTabs` on every pass (see the write-loop note in groupTabs).
function stampLabelMembership(activeTab, labelTitle, urlKey) {
  if (activeTab.labelTitle === labelTitle && activeTab.labelUrlKey === urlKey) return false;
  activeTab.labelTitle = labelTitle;
  activeTab.labelUrlKey = urlKey;
  return true;
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

// How many url-* keys the recency list (`allUrls`) tracks. Keys past this cap are
// evicted from the tail and their records deleted. This is a DISPLAY/storage cap
// for History and Search — it deliberately no longer bounds visit stats, which
// live in the site-keyed `siteVisits` store below and are pruned only by
// VISIT_RETENTION_MS / MAX_VISITS.
const MAX_TRACKED_URLS = 500;

// How long a `deletedUrls` tombstone is honored. A tombstone exists for exactly
// one reason: to outlive an IN-FLIGHT `chrome.tabs.onRemoved` -> `closeUrl` that
// already read a pre-delete `allUrls` snapshot and would otherwise write the
// just-deleted key back at index 0. That window is milliseconds; an hour is
// generous slack for a throttled/suspended service worker. It is NOT a blocklist
// — `newUrl` clears the entry the moment the user deliberately visits the page
// again, and prunes anything past this age so the map cannot grow without bound.
const DELETED_URL_TTL_MS = 60 * 60 * 1000;

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

// The canonical site key (host, lowercased, leading `www.` stripped) a URL's
// visits accumulate under. Mirror of siteKey() in src/lib/utils/siteKey.js —
// THAT FILE IS THE SOURCE OF TRUTH; this duplicate exists only because the
// service-worker runtime can't import the ES module, same as pruneVisits above
// and the GAUGE / AUTO_CLOSE constants. Keep the two in step.
function siteKey(url) {
  if (typeof url !== 'string') return '';
  const raw = url.trim();
  if (raw.length === 0) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  return parsed.host.toLowerCase().replace(/^www\./, '');
}

// Mirror of isSearchEngineUrl() in src/lib/utils/isSearchEngineUrl.js — THAT FILE
// IS THE SOURCE OF TRUTH; this duplicate exists only because the service-worker
// runtime can't import the ES module, same as siteKey / pruneVisits above. Keep
// SEARCH_ENGINE_HOSTS byte-identical (alphabetized) to the canonical set so the
// two don't drift. Used by newUrl to stop accumulating Favorites scoring signal
// (per-record `visits` + the durable `siteVisits[host]`) for search engines,
// which rankFavorites discards anyway.
const SEARCH_ENGINE_HOSTS = new Set([
  'ask.com',
  'baidu.com',
  'bing.com',
  'duckduckgo.com',
  'ecosia.org',
  'kagi.com',
  'qwant.com',
  'search.brave.com',
  'search.yahoo.com',
  'startpage.com',
  'yandex.com',
  'yandex.ru',
]);
const GOOGLE_SEARCH_HOST = /^google\.[a-z.]+$/;
function isSearchEngineUrl(url) {
  const host = siteKey(url);
  if (!host) return false;
  return SEARCH_ENGINE_HOSTS.has(host) || GOOGLE_SEARCH_HOST.test(host);
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
  let updates = await tabUpdates(tab);
  
  const checkRemoving = () => {
    if (removing === tabId) {
      removing = null;
      return true;
    }
  };

  const activeTabs = (await getStorage('activeTabs')).activeTabs || [];

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
        // A real navigation ejects the tab from its group — but not when the tab
        // simply moved to ANOTHER URL the same label already claims. Sites that
        // rewrite their own path with no user input (auth bounces, redirect
        // chains, chat/doc apps) hit this constantly, and ejecting there is
        // pure churn: groupTabs pulls the tab straight back in on the next pass,
        // so the user watches it pop out and snap back. Resolve the label title
        // the same way the in-page branch below does.
        const currentLabelTitle = await resolveGroupTitle(tab.groupId);
        const stillAMember = urlKeyIsMember(
          labels[currentLabelTitle],
          getUrlKey(changeInfo.url)
        );

        if (stillAMember) {
          debugGroup('onUpdated: keep grouped tab (navigated to another member URL)', {
            tabId: tab.id,
            oldUrl,
            newUrl: changeInfo.url,
            label: currentLabelTitle,
            groupId: tab.groupId
          });
        } else if (needsUngroupCall(tab)) {
          debugGroup('onUpdated: eject grouped tab (navigation)', {
            tabId: tab.id,
            oldUrl,
            newUrl: changeInfo.url,
            groupId: tab.groupId
          });
          recordMove(MoveSource.WORKER_NAVIGATION_EJECT, {
            action: 'ungroup',
            tabId: tab.id,
            fromGroupId: tab.groupId,
            toGroupId: -1,
            labelTitle: currentLabelTitle,
            urlKey: getUrlKey(changeInfo.url)
          });
          pendingUngroups.add(tab.id);
          chrome.tabs.ungroup(tab.id, () => {
            void (chrome.runtime && chrome.runtime.lastError);
            pendingUngroups.delete(tab.id);
          });
        }
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
        const labelTitle = await resolveGroupTitle(tab.groupId);
        const label = labels[labelTitle];
        if (label) {
          const newUrlKey = getUrlKey(changeInfo.url);
          const { mutated, previousKey, removed } = healDriftedLabelSlot(
            label,
            newUrlKey,
            changeInfo.url
          );
          if (mutated) {
            labels[labelTitle] = label;
            updates = { ...updates, labels: labels };
            debugGroup('onUpdated: heal drifted label urlKey', {
              tabId: tab.id,
              oldUrlKey: previousKey,
              newUrlKey,
              label: labelTitle,
              groupId: tab.groupId
            });
            // A drift-heal dedup is a splice (a duplicate slot collapsed), not a
            // loss — but it removes a member slot, so it belongs in the trail.
            if (removed) {
              recordRemoval(RemovalSource.WORKER_DRIFT_HEAL_DEDUP, {
                labelTitle,
                urlKeys: [previousKey],
                tabId: tab.id,
                remaining: label.urlKeys.length
              });
            } else {
              // The position-preserving rewrite put a key into a slot that did
              // not hold it before — an add-in-place. Record both keys so the
              // rewrite chain behind a surprising member is readable.
              recordAddition(AdditionSource.WORKER_DRIFT_HEAL, {
                labelTitle,
                urlKeys: [newUrlKey],
                previousKey,
                tabId: tab.id,
                total: label.urlKeys.length
              });
            }
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
        // A tab leaving all groups — Chrome's native ungroup gesture, a
        // navigation-eject (chrome.tabs.ungroup on a mismatched navigation), or
        // MV3 restart flicker — ungroups the *tab* visually but must NOT delete
        // the recorded member. Membership is sticky: a urlKey leaves a label
        // only through an explicit user action (the remove-URL button, chip
        // drag-out, delete-group) or a genuine re-home (see
        // handleActiveTabsGroupChanges). This is consistent with groupTabs,
        // which already treats members as sticky by auto-regrouping a matching
        // tab back into its label. So we mark the tab ungrouped in activeTabs
        // and leave `labels` untouched; reopening the URL auto-regroups it.
        activeTabs[activeTabIndex].groupId = -1;

        updates = {
          ...updates,
          activeTabs: activeTabs
        };
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
  const activeTabs = (await getStorage('activeTabs')).activeTabs || [];
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

    getStorage(['activeTabs', 'autoClosed', 'labels'], (result) => {
      const activeTabs = result.activeTabs || [];
      const autoClosed = result.autoClosed || {};
      // Read straight from storage rather than the module-level `labels`: this
      // callback can run before that binding is initialized, and the membership
      // test below only needs a fresh snapshot.
      const storedLabels = result.labels || {};

      // A Chrome `Tab` has `index`, not `tabIndex` — the old comparator returned
      // NaN for every pair, so the sort was a silent no-op.
      const newActiveTabs = tabs.sort(
        (a, b) => a.index - b.index
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
            // Which window the tab lives in. groupTabs needs it to scope its
            // `chrome.tabGroups.query` — an unscoped query can return a group in
            // ANOTHER window, and grouping into it physically drags the tab
            // across windows.
            windowId: tab.windowId,
            activeAt: (tab.active ? Date.now() : (existingTab ?? {}).activeAt),
            openedAt: (existingTab ?? { openedAt: Date.now() }).openedAt,
            tabCommandPinned: (existingTab ?? {}).tabCommandPinned,
            autoClosedAt: (autoClosed || {})[getUrlKey(tab.url)],
            active: tab.active,
            // Carry the group-membership stamp forward. This rebuild constructs
            // a fresh object per tab, so any field it does not name is erased —
            // and this one is erased on the very NEXT tab update, long before the
            // sync that needs it, leaving the append guard blind.
            labelTitle: (existingTab ?? {}).labelTitle,
            labelUrlKey: (existingTab ?? {}).labelUrlKey
          }
        }
      );

      for (const activeTab of updatedActiveTabs) {
        if (activeTab.active && autoClosed[activeTab.urlKey]) {
          // Returning to a page the Closer had closed. Clearing the autoClosed
          // entry is the point; the ungroup is not. If this URL is a label
          // member, ejecting it only has groupTabs pull it straight back in on
          // the next pass — the visible out-and-back jump users report every
          // time they revisit a closed page. Only eject a non-member.
          const isMember = !!findLabelForUrlKey(storedLabels, activeTab.urlKey);
          if (!isMember && needsUngroupCall(activeTab)) {
            recordMove(MoveSource.WORKER_AUTO_CLOSE_REVISIT, {
              action: 'ungroup',
              tabId: parseTabId(activeTab),
              fromGroupId: activeTab.groupId,
              toGroupId: -1,
              urlKey: activeTab.urlKey
            });
            chrome.tabs.ungroup(parseTabId(activeTab));
          }
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
  getStorage(['activeTabs', 'autoClosed', 'settings'], (result) => {
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

// The last `labels` value this worker persisted, serialized. `labels` now lives
// in `chrome.storage.sync`, which enforces MAX_WRITE_OPERATIONS_PER_MINUTE = 120
// and MAX_WRITE_OPERATIONS_PER_HOUR = 1800 — ceilings the local area never had.
// `recordInGroupTab` runs per tab from `groupTabs`, which the `storage.onChanged`
// listener invokes on every `activeTabs` change, and `updateActiveTabs()` fires
// from eight different tab events. Writing `labels` unchanged on every tab event
// would breach the per-minute quota within a minute of normal browsing.
//
// So a write whose `labels` is byte-identical to the last one persisted is
// dropped. Dropping it is safe by construction: identical content means storage
// already holds exactly this value. It also breaks the self-sustaining
// write -> onChanged -> groupTabs -> write loop that made the churn quadratic.
let lastPersistedLabels = null;

function update(updates) {
  const outgoing = { ...updates };

  if (Object.prototype.hasOwnProperty.call(outgoing, 'labels')) {
    const serialized = JSON.stringify(outgoing.labels);
    if (serialized === lastPersistedLabels) {
      delete outgoing.labels;
    } else {
      lastPersistedLabels = serialized;
    }
  }

  if (Object.keys(outgoing).length === 0) return;

  writeByArea(outgoing);
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
    getStorage(['allUrls', 'labels', 'siteVisits', 'deletedUrls', urlKey], (result) => {
      const allUrls = result.allUrls || [];

      // A real visit UN-FORGETS the page. Deleting from History means "forget
      // this", not "block this" — a deliberate return to the page is the user
      // asking for it back, so the tombstone is cleared before the move-to-front
      // below re-adds the key. Prune on the same pass (mirroring the allUrls
      // eviction) so the map stays bounded by DELETED_URL_TTL_MS rather than
      // accumulating one entry per page ever deleted.
      const deletedUrls = pruneDeletedUrls(result.deletedUrls, Date.now(), DELETED_URL_TTL_MS);
      delete deletedUrls[urlKey];
      updates.deletedUrls = deletedUrls;
      // MOVE-TO-FRONT on every visit, not just the first. `allUrls` is the
      // recency list every consumer already treats it as — and the list the
      // eviction below trims from the TAIL. Inserting only when absent ordered it
      // by first-seen instead, so a site visited daily still drifted toward the
      // tail as new URLs arrived, got evicted, and had its whole url-* record
      // (visits and all) deleted — resurfacing later as "1 visit".
      const existingIndex = allUrls.indexOf(urlKey);
      if (existingIndex > -1) allUrls.splice(existingIndex, 1);
      allUrls.unshift(urlKey);

      if (allUrls.length >= MAX_TRACKED_URLS) {
        let allLabelUrlKeys = [];
        for (const label in result.labels) {
          allLabelUrlKeys += result.labels[label].urlKeys;
        }

        const removeUrlKeys = allUrls.slice(MAX_TRACKED_URLS);
        for (const removeUrlKey of removeUrlKeys) {
          if (allLabelUrlKeys.indexOf(removeUrlKey) === -1) {
            chrome.storage.local.remove(removeUrlKey);
          }
        }
      }

      updates.allUrls = allUrls.slice(0, MAX_TRACKED_URLS);

      // Track WHEN and how often each site is visited so Favorites can rank by a
      // time-decayed sum of visits. Append a fresh timestamp and prune the array
      // (retention horizon + length cap) so per-site history stays bounded.
      // Additive: existing url-* fields are preserved, visitCount keeps
      // incrementing for backward-compat/display, and records without a `visits`
      // array are seeded lazily downstream (see rankFavorites).
      const now = Date.now();
      // Search engines stay in history (allUrls + visitCount) but stop
      // accumulating the Favorites scoring signal — the per-record `visits` and
      // the durable `siteVisits[host]` below — since rankFavorites now discards
      // search-engine hosts anyway. Gating here keeps those stores from growing
      // wasteful (but now-invisible) entries going forward.
      const isSearchEngine = isSearchEngineUrl(url);
      const urlRecord = result[urlKey] || { url };
      updates[urlKey] = {
        ...urlRecord,
        visitCount: (urlRecord.visitCount || 0) + 1,
        // Display-recency only, and deliberately OUTSIDE the isSearchEngine
        // gate below: the History page needs a date for every visited URL,
        // including search engines, whose `visits` array stays empty by design.
        // Nothing in rankFavorites reads `lastVisit` and nothing should start —
        // scoring runs off `visits`/`siteVisits`, which is what keeps search
        // engines out of Favorites.
        lastVisit: now,
        visits: isSearchEngine
          ? urlRecord.visits || []
          : pruneVisits([...(urlRecord.visits || []), now], now),
      };

      // The DURABLE half of the same visit: accumulate it under the site's host
      // in `siteVisits`, which the eviction branch above never touches. Evicting
      // a url-* key can therefore no longer destroy a site's stats — the advertised
      // 56-day window is bounded only by retention, not by how many other URLs the
      // user happened to browse. Keying by host also means every article on a
      // content site credits the SITE rather than minting its own orphan record.
      // Written into the same `updates` object, so the visit lands atomically with
      // the url-* record in one chrome.storage.local.set.
      const host = siteKey(url);
      if (host && !isSearchEngine) {
        const siteVisits = result.siteVisits || {};
        siteVisits[host] = pruneVisits([...(siteVisits[host] || []), now], now);
        updates.siteVisits = siteVisits;
      }

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
  const result = await getStorage(urlKey);
  const record = result[urlKey];
  const visits = (record && record.visits) || [];
  const lastVisit = visits.length ? Math.max(...visits.map(Number)) : 0;

  const now = Date.now();
  if (now - lastVisit < ACCESS_THROTTLE_MS) return; // within throttle window

  return newUrl(tab.id, tab.url);
}

function closeUrl(urlKey, callback) {
  getStorage(['allUrls', 'deletedUrls'], (result) => {
    const allUrls = result.allUrls || [];
    const deletedUrls = result.deletedUrls || {};
    // The page was JUST deleted from History in the popup process, but this
    // handler is running off `chrome.tabs.onRemoved` in the service worker with
    // a pre-delete snapshot in hand. Without this check the move-to-front below
    // writes the key straight back at index 0 — and since the delete already
    // removed the `url-*` record, the resurrected row renders as a bare URL.
    // Skipping costs nothing: closeUrl only ever REORDERS an existing key.
    if (deletedUrls[urlKey]) {
      if (callback) return callback();
      return;
    }
    const oldIndex = allUrls.indexOf(urlKey);
    // An untracked key has oldIndex -1, and `splice(-1, 1)` removes the LAST
    // element — so the unguarded move-to-front below would silently promote the
    // OLDEST key to the front, corrupting the recency order the eviction trim in
    // `newUrl` depends on. Nothing to reorder for a key we never tracked.
    if (oldIndex === -1) {
      if (callback) return callback();
      return;
    }
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

    getStorage(urlKey, (result) => {
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
// Resolve `labels` through the migration FIRST — it is the only place that reads
// both areas and decides which copy wins (sync when populated, local otherwise,
// copying local -> sync when sync is empty). Running it ahead of the bootstrap
// read means the session always starts from the durable copy, and a first boot
// after the upgrade backs up the user's existing groups before anything can
// touch them. `activeTabs` is local and unaffected, so it still comes from the
// ordinary read.
migrateLabelsToSync((migration) => {
  labels = migration.labels || {};
  // Seed the coalescing memo with what storage now holds, so the first ordinary
  // tab event after boot doesn't re-persist an identical `labels`.
  lastPersistedLabels = JSON.stringify(labels);
  debugGroup('boot: labels migration resolved', {
    outcome: migration.outcome,
    groupCount: Object.keys(labels).length
  });
});
getStorage(['activeTabs'], (result) => {
  activeTabs = result.activeTabs || [];
  // Deliberately does NOT call groupTabs here. `activeTabs` is a PERSISTED
  // snapshot, and Chrome tab ids are unique only within a browser session — after
  // a restart those ids refer to different tabs entirely. MV3 wakes this worker
  // constantly, so grouping from the snapshot means `chrome.tabs.group` /
  // `chrome.tabs.ungroup` firing at unrelated tabs on the first wake, moving them
  // with the user doing nothing at all.
  //
  // Nothing is lost by dropping it: the module-level `updateActiveTabs()` call
  // re-reads LIVE tabs and writes `activeTabs`, and that write re-enters
  // `storage.onChanged` -> `groupTabs` with live tab ids and live group ids. The
  // only cost is one storage round-trip of latency on the first grouping pass
  // after a worker wake.
});

chrome.storage.onChanged.addListener(
  (changes, areaName) => {
    // The two keys now live in different areas, so a single change event carries
    // only one of them. Gate each against ITS OWN area rather than against a
    // single hardcoded `'local'` — that check would have dropped every `labels`
    // event once labels moved to sync, leaving the in-memory copy stale.
    const labelsChanged = areaName === areaForKey('labels') && !!changes.labels;
    const activeTabsChanged = areaName === areaForKey('activeTabs') && !!changes.activeTabs;
    if (!labelsChanged && !activeTabsChanged) return;

    if (labelsChanged) {
      // Coerce a removal to `{}`. `changes.labels.newValue` is undefined when the
      // key is removed, and while `findLabelForUrlKey` is null-tolerant by
      // contract, the bare `labels[group.title]` dereferences in `groupTabs` and
      // `recordInGroupTab` are not. Cross-area transitions — a sync area that is
      // unavailable, garbage-collected, or simply not yet populated — make an
      // absent `labels` materially more likely than it was when everything was
      // local.
      const priorLabels = changes.labels.oldValue || {};
      labels = changes.labels.newValue || {};

      // Titles present before this change and absent after it are exactly the
      // groups the user just deleted. Both bookkeeping steps run BEFORE the
      // `groupTabs` call below, because groupTabs on THIS pass is the thing that
      // would otherwise re-record a deleted label — `dissolveDeletedLabelGroups`
      // is async and its `pendingUngroups` marks cannot land in time to stop it.
      const deletedTitles = deletedLabelTitles(priorLabels, labels);
      for (const title of deletedTitles) userDeletedLabels.add(title);
      // A title back in `labels` is no longer deleted, however it got there —
      // re-created by hand, or pushed in by sync from another device.
      for (const title of Object.keys(labels)) userDeletedLabels.delete(title);

      if (deletedTitles.length > 0) dissolveDeletedLabelGroups(deletedTitles);
    }

    if (activeTabsChanged) {
      activeTabs = changes.activeTabs.newValue;
      handleActiveTabsGroupChanges(changes.activeTabs);
    }

    groupTabs(activeTabs, labels);

    if (labelsChanged) {
      const previous = changes.labels.oldValue;
      getStorage('previousLabels', (result) => {
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

// Read across both storage areas and hand back ONE merged result. No longer
// local-only — `labels` comes from `chrome.storage.sync` while everything
// alongside it in the same query (`activeTabs`, `allUrls`, the `url-*` records)
// comes from local — hence `getStorage`, not `getLocalStorage`.
function getStorage(query, callback) {
  return new Promise(
    (resolve, reject) =>
      readByArea(query, (result) => {
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

      const { labels } = await getStorage('labels') || {};

      let changed = false;
      let stamped = false;
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
        // The navigated-away guard closes the ungroup-then-regroup race that
        // `pendingUngroups` cannot: that Set is module-level, so an MV3 teardown
        // empties it exactly when the bogus append happens. A tab already filed
        // under this label that merely navigated is not a new member.
        if (
          label.urlKeys.indexOf(newTab.urlKey) === -1 &&
          !pendingUngroups.has(parseTabId(newTab)) &&
          !navigatedAwayFromRecordedSlot(label, newGroup.title, newTab)
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
          // Stamp the tab with the label/key it was just filed under, so a later
          // grouping sync can tell "this tab navigated" apart from "a new URL
          // joined the group" (see the guard in recordInGroupTab).
          stamped = stampLabelMembership(newTab, newGroup.title, newTab.urlKey);
          recordAddition(AdditionSource.WORKER_GROUP_CHANGED, {
            labelTitle: newGroup.title,
            urlKeys: [newTab.urlKey],
            tabId: parseTabId(newTab),
            total: label.urlKeys.length
          });
          changed = true;
        } else if (
          label.urlKeys.indexOf(newTab.urlKey) === -1 &&
          navigatedAwayFromRecordedSlot(label, newGroup.title, newTab)
        ) {
          debugGroup('handleActiveTabsGroupChanges: refuse append for tab navigating away from its recorded slot', {
            tabId: parseTabId(newTab),
            recordedUrlKey: newTab.labelUrlKey,
            liveUrlKey: newTab.urlKey,
            label: newGroup.title,
            oldGroupId: oldTab.groupId,
            newGroupId: newTab.groupId
          });
        }
      }

      if (oldGroup && labels[oldGroup.title]) {
        // Genuine re-home only: this block is reached only when `newGroup` is
        // present (guarded above), i.e. a tab moved directly from group A into
        // group B. That is unambiguous intent to re-parent, so we remove the
        // member from the old group here. An ungroup-to-nothing (newGroup falsy)
        // never reaches this point — its membership stays sticky.
        const index = labels[oldGroup.title].urlKeys.indexOf(newTab.urlKey);
        if (index > -1) {
          labels[oldGroup.title].urlKeys.splice(index, 1);
          changed = true;
          // A tab's groupId changed, dropping its URL from the old group's label.
          recordRemoval(RemovalSource.WORKER_GROUP_CHANGED, {
            labelTitle: oldGroup.title,
            urlKeys: [newTab.urlKey],
            tabId: parseTabId(newTab),
            remaining: labels[oldGroup.title].urlKeys.length
          });
        }
      }

      // The stamp lives on the `activeTabs` entry (see stampLabelMembership), so
      // it only survives if this same write persists the mutated array. `newValue`
      // IS the array storage currently holds, and the re-entrant onChanged this
      // write triggers no-ops because no groupId moved.
      if (changed) update({ labels: labels, ...(stamped ? { activeTabs: newValue } : {}) });
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

  const freshLabels = (await getStorage('labels')).labels || {};
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
  if (!needsUngroupCall(activeTab)) return 'ejected';

  recordMove(MoveSource.WORKER_AUTO_GROUP_EJECT, {
    action: 'ungroup',
    tabId,
    fromGroupId: activeTab.groupId,
    toGroupId: -1,
    labelTitle: groupTitle,
    urlKey: activeTab.urlKey
  });
  pendingUngroups.add(tabId);
  chrome.tabs.ungroup(tabId, () => {
    void (chrome.runtime && chrome.runtime.lastError);
    pendingUngroups.delete(tabId);
  });
  return 'ejected';
}

// Dissolve the Chrome tab groups belonging to labels the user just deleted, so
// nothing survives to re-record the label that was removed. Every tab stays open
// and stays where it is: `chrome.tabs.ungroup` only clears group membership, it
// never reorders tabs or moves them between windows, so the tab-strip guarantee
// `stop-tabcommand-moving-tabs-in-the-tab-strip` established is preserved. That
// plan stopped the worker from grouping tabs AUTONOMOUSLY; this is the direct,
// confirmed consequence of a user action whose entire meaning is "remove this
// group", which is why it is a deliberate exception rather than a regression.
//
// A deleted label with no live Chrome group is the COMMON case — deleting a
// group whose tabs are all closed — and must be a silent no-op, never an error.
function dissolveDeletedLabelGroups(titles) {
  for (const title of titles) {
    // Deliberately NOT window-scoped. A label legitimately has one Chrome group
    // per window and the deletion removes all of them, so every returned group
    // is handled — never `groups[0]`, the multi-window bug `groupLabeledTab`
    // already had to be fixed for.
    chrome.tabGroups.query({ title }, (groups) => {
      void (chrome.runtime && chrome.runtime.lastError);
      if (!groups || groups.length === 0) return;

      for (const group of groups) {
        chrome.tabs.query({ groupId: group.id }, (tabs) => {
          void (chrome.runtime && chrome.runtime.lastError);
          if (!tabs || tabs.length === 0) return;

          const tabIds = tabs.map((tab) => tab.id);
          debugGroup('dissolveDeletedLabelGroups: ungroup tabs of deleted label', {
            label: title,
            groupId: group.id,
            tabIds
          });

          for (const tabId of tabIds) {
            recordMove(MoveSource.WORKER_LABEL_DELETED, {
              action: 'ungroup',
              tabId,
              fromGroupId: group.id,
              toGroupId: -1,
              labelTitle: title
            });
            // Mark BEFORE issuing the call, exactly as `ejectAutoGroupedTab`
            // does: the record loop's existing in-flight guard is what stops a
            // concurrent groupTabs pass from re-recording these tabs in the gap
            // between this query and the ungroup landing.
            pendingUngroups.add(tabId);
          }

          chrome.tabs.ungroup(tabIds, () => {
            void (chrome.runtime && chrome.runtime.lastError);
            for (const tabId of tabIds) pendingUngroups.delete(tabId);
          });
        });
      }
    });
  }
}

// Record an in-group tab's URL into its group's label, seeding the label when it
// doesn't exist yet, and persist. This is the "make membership permanent" path —
// it now runs only for non-auto-grouped tabs (e.g. startup sync of pre-existing
// Chrome groups), never for Chrome's per-tab inheritance.
// `activeTabs` is optional and only used to PERSIST the membership stamp — the
// caller (groupTabs) already holds the array `activeTab` came out of, so the
// stamp rides along in this same write instead of costing another storage read.
function recordInGroupTab(labels, group, activeTab, activeTabs) {
  // The resurrection guard. This function's whole job is "a tab is sitting in a
  // titled Chrome group with no matching label, so make that membership real" —
  // which is precisely the shape a just-deleted group presents while its tabs
  // are still grouped. Without this, confirming the delete dialog removed the
  // label and the very next sync pass put it straight back, so the card never
  // disappeared and the action read as broken.
  //
  // Scoped to titles the user actually deleted, so the startup-sync case this
  // function exists to serve (a genuinely pre-existing Chrome group the user
  // made in Chrome, which was never deleted here) still records normally.
  if (userDeletedLabels.has(group.title)) {
    debugGroup('groupTabs: refuse to re-create a label the user deleted', {
      tabId: parseTabId(activeTab),
      urlKey: activeTab.urlKey,
      label: group.title,
      groupId: activeTab.groupId
    });
    return;
  }

  const label = labels[group.title];
  let stamped = false;
  // Whether this pass actually CHANGED `labels`. The write at the end used to be
  // unconditional, so every pass over an already-recorded tab re-persisted an
  // identical map — harmless against the local area, but `labels` is in sync now
  // and sync caps writes at 120/minute. This mirrors the `if (changed)` guard
  // handleActiveTabsGroupChanges already uses.
  let labelsMutated = false;
  const stamp = (urlKey) => { stamped = stampLabelMembership(activeTab, group.title, urlKey); };
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
    stamp(activeTab.urlKey);
    labelsMutated = true;
    recordAddition(AdditionSource.WORKER_IN_GROUP_SYNC, {
      labelTitle: group.title,
      urlKeys: [activeTab.urlKey],
      tabId: parseTabId(activeTab),
      total: 1
    });
  } else {
    // Drift-aware record. When MV3 tears down the service worker, the next sync
    // sees a Google Doc whose live `?tab=t.…` has drifted away from the recorded
    // key as a non-member and would append its live urlKey to the end — dropping
    // the doc to the bottom of the group. Heal a same-page slot in place first
    // (shared with the onUpdated drift-heal) so the doc keeps its recorded
    // position; only a genuinely-new URL falls through to an append.
    const { found, mutated, removed, previousKey } = healDriftedLabelSlot(
      label,
      activeTab.urlKey,
      activeTab.urlKey.replace(/^url-/, '')
    );
    if (found) {
      // A position-preserving rewrite is an add-in-place — the slot now holds a
      // different key than it did — so it belongs in the addition trail too,
      // carrying both keys so a rewrite chain is readable. The dedup SPLICE
      // branch (`removed`) is a drop, not an add; it is audited as a removal below.
      if (mutated) labelsMutated = true;
      if (mutated && !removed) {
        stamp(activeTab.urlKey);
        recordAddition(AdditionSource.WORKER_DRIFT_HEAL, {
          labelTitle: group.title,
          urlKeys: [activeTab.urlKey],
          previousKey,
          tabId: parseTabId(activeTab),
          total: label.urlKeys.length
        });
      }
    } else if (navigatedAwayFromRecordedSlot(label, group.title, activeTab)) {
      // This is the tab we already filed under `labelUrlKey`, and it has simply
      // navigated somewhere else on the site. A path change is not a same-page
      // drift, so healDriftedLabelSlot found nothing and the old code appended
      // the live URL as a SECOND permanent member — one phantom row per
      // navigation the eject path missed (MV3 teardown, ungroup races). Refuse
      // the append and leave the label untouched. Membership for the TAB is
      // already owned by the onUpdated eject path, which ungroups on a real
      // navigation; this only stops the LABEL from growing a member nobody filed.
      debugGroup('groupTabs: refuse append for tab navigating away from its recorded slot', {
        tabId: parseTabId(activeTab),
        recordedUrlKey: activeTab.labelUrlKey,
        liveUrlKey: activeTab.urlKey,
        label: group.title,
        groupId: activeTab.groupId
      });
      return;
    } else {
      label.urlKeys.push(activeTab.urlKey);
      stamp(activeTab.urlKey);
      labelsMutated = true;
      recordAddition(AdditionSource.WORKER_IN_GROUP_SYNC, {
        labelTitle: group.title,
        urlKeys: [activeTab.urlKey],
        tabId: parseTabId(activeTab),
        total: label.urlKeys.length
      });
    }
    // A dedup splice here collapses a drifted duplicate — record it so the trail
    // is complete (same source tag as the onUpdated drift-heal).
    if (removed) {
      recordRemoval(RemovalSource.WORKER_DRIFT_HEAL_DEDUP, {
        labelTitle: group.title,
        urlKeys: [previousKey],
        tabId: parseTabId(activeTab),
        remaining: label.urlKeys.length
      });
    }
  }
  // Write only what actually changed. The membership stamp lives on the
  // `activeTabs` entry and still needs persisting on its own — a stamp with no
  // label mutation is the common "clicked a URL already filed in this group"
  // path — so the two are now independent rather than riding one blanket write.
  const outgoing = {};
  if (labelsMutated) outgoing.labels = labels;
  if (stamped && activeTabs) outgoing.activeTabs = activeTabs;
  if (Object.keys(outgoing).length === 0) return;

  update(outgoing);
}

async function groupTabs(activeTabs, labels) {
  const groupLabeledTab = (tabs, label) => {
    const labelTitle = label.title;

    // Bucket by window before querying. `chrome.tabGroups.query({ title })` is
    // NOT window-scoped, and the old code took `groups[0]` — so with the same
    // label grouped in two windows, `chrome.tabs.group({ groupId })` physically
    // DRAGGED tabs into the other window. A label legitimately has one Chrome
    // group per window; tabs are never pulled across windows.
    const byWindow = bucketTabsByWindow(tabs);

    for (const [windowId, windowTabs] of byWindow) {
      const query = windowId == null
        ? { title: labelTitle }
        : { title: labelTitle, windowId };

      chrome.tabGroups.query(query, (groups) => {
        if (!groups) return;

        if (groups.length === 0) {
          // No Chrome group for this label in this window yet — create one.
          const creating = windowTabs.filter((tab) => needsGroupCall(tab, undefined));
          // Never create an empty group.
          if (creating.length === 0) return;

          const tabIds = creating.map(parseTabId);
          debugGroup('groupTabs: chrome.tabs.group -> NEW group', {
            label: labelTitle,
            windowId,
            tabIds
          });
          chrome.tabs.group({ tabIds }, (groupId) => {
            chrome.tabGroups.update(groupId, {
              title: labelTitle,
              color: mapColors(label.backgroundColor)
            });
            recordGroupMoves(creating, groupId, labelTitle);
          });
        } else {
          const targetGroupId = groups[0].id;
          // The idempotence guard. `chrome.tabs.group` is a REPOSITION, not an
          // assertion: calling it on a tab already in the target group appends it
          // to the end of that group, firing onMoved -> updateActiveTabs ->
          // storage.onChanged -> groupTabs -> group again. Filtering to tabs that
          // are genuinely elsewhere is what lets a steady-state pass issue zero
          // Chrome calls and damps that loop.
          const moving = windowTabs.filter((tab) => needsGroupCall(tab, targetGroupId));
          if (moving.length === 0) return;

          debugGroup('groupTabs: chrome.tabs.group -> EXISTING group', {
            label: labelTitle,
            windowId,
            groupId: targetGroupId,
            tabIds: moving.map(parseTabId)
          });
          chrome.tabs.group({ tabIds: moving.map(parseTabId), groupId: targetGroupId });
          recordGroupMoves(moving, targetGroupId, labelTitle);
        }
      });
    }
  };

  const labelTabIds = {};
  let stampsChanged = false;
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
        // Record WHICH slot this tab occupies, so a later sync can tell this tab
        // navigating apart from a new URL joining the group. Without it the append
        // guard is blind on the most common path of all: clicking a URL that is
        // already filed in a group never appends anything, so the create-time
        // stamps never run and every later navigation looks like a new member.
        stampsChanged = stampLabelMembership(activeTab, group.title, activeTab.urlKey) || stampsChanged;
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
      recordInGroupTab(labels, group, activeTab, activeTabs);

      // Deliberately NOT queued into labelTabIds. Reaching this branch means the
      // tab is ALREADY inside `group`, so handing it to groupLabeledTab could
      // only ever reposition it — never place it somewhere new. And on
      // recordInGroupTab's refuse-append path (the tab merely navigated away from
      // its recorded slot, so nothing is recorded and state is unchanged) that
      // reposition repeats on every single pass: the self-sustaining
      // group -> onMoved -> updateActiveTabs -> storage.onChanged -> groupTabs
      // loop behind "my tabs keep jumping around". Do not reinstate this as a
      // "make sure it's grouped" safety net — it is not one.
    } else {
      // Exactly ONE destination per URL. This used to be a loop that queued the
      // tab into EVERY label claiming its urlKey, so a URL filed under two labels
      // was grouped twice in one pass — into group A, then into group B — and
      // which one won depended on async tabGroups.query ordering, so it could
      // differ pass to pass. That is the literal back-and-forth.
      const labelTitle = findLabelForUrlKey(labels, activeTab.urlKey);

      if (labelTitle) {
        // An ungrouped tab's URL matches a label's sticky urlKeys, so we will
        // auto-add it to that group. If you didn't expect this URL to be a
        // member, the urlKey got recorded earlier (see the record logs above).
        debugGroup('groupTabs: auto-group ungrouped tab (urlKey matched label)', {
          tabId: parseTabId(activeTab),
          urlKey: activeTab.urlKey,
          label: labelTitle
        });
        // Earliest point the binding is known — this fires when the user clicks a
        // group row, before Chrome's `chrome.tabs.group` has even landed — so it
        // closes the window where the confirm-branch stamp above has not run yet.
        stampsChanged = stampLabelMembership(activeTab, labelTitle, activeTab.urlKey) || stampsChanged;
        labelTabIds[labelTitle] ||= [];
        labelTabIds[labelTitle].push(activeTab);
      }

      if (!labelTitle && activeTab.groupId > -1 && needsUngroupCall(activeTab)) {
        // Tab is in a group but no label claims its URL — we ungroup it.
        debugGroup('groupTabs: ungroup tab (no matching label)', {
          tabId: parseTabId(activeTab),
          urlKey: activeTab.urlKey,
          groupId: activeTab.groupId
        });
        recordMove(MoveSource.WORKER_NO_MATCHING_LABEL, {
          action: 'ungroup',
          tabId: parseTabId(activeTab),
          fromGroupId: activeTab.groupId,
          toGroupId: -1,
          urlKey: activeTab.urlKey
        });
        chrome.tabs.ungroup(parseTabId(activeTab));
      }
    }
  }

  // One batched write for every stamp this pass made, instead of an `update()` per
  // tab. It MUST stay conditional: `update` is a bare `chrome.storage.local.set`
  // whose write re-enters `onChanged`, which calls groupTabs again — so an
  // unconditional write here is an infinite write loop. stampLabelMembership's
  // changed-check is what makes this safe, since a pass that stamps nothing new
  // writes nothing. (recordInGroupTab persists the same `activeTabs` array on its
  // own path; both writes carry the same object, so an overlap is redundant at
  // worst, never conflicting.)
  if (stampsChanged) update({ activeTabs });

  for (const labelTitle of Object.keys(labelTabIds)) {
    groupLabeledTab(labelTabIds[labelTitle], labels[labelTitle]);
  }
}