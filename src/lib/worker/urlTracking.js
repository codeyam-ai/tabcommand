import isTrackableUrl from '../utils/isTrackableUrl.js';
import pruneDeletedUrls from '../utils/pruneDeletedUrls.js';
import { siteKey } from '../utils/siteKey.js';
import { isSearchEngineUrl } from '../utils/isSearchEngineUrl.js';
import { pruneVisits } from '../utils/visitDecay.js';
import { isRawUrlTitle, fillDisplayFromLiveTab } from '../utils/urlRecordDisplay.js';

// The url-* record write paths of the service worker: visits (`newUrl`,
// `recordAccess`) and the per-tab title/favicon/process tracking (`tabUpdates`,
// `urlUpdates`). They resolve an `updates` object for the worker to persist and
// never write it themselves. Chrome and worker state arrive through `deps`, so
// they can be exercised without loading the worker:
//
//   getStorage(query, callback?) — the worker's area-aware storage read
//   getTab(tabId)                — chrome.tabs.get
//   removeRecord(urlKey)         — drops an evicted url-* record from local storage
//   validTab(tab)                — the worker's tab policy (incognito, chrome://, …)
//   processesIndex               — the worker's per-sample process index (mutated)
//   onVisit()                    — called first on every newUrl (refreshes activeTabs)

// How many url-* keys the recency list (`allUrls`) tracks. Keys past this cap are
// evicted from the tail and their records deleted. This is a DISPLAY/storage cap
// for History and Search — it deliberately no longer bounds visit stats, which
// live in the site-keyed `siteVisits` store below and are pruned only by
// VISIT_RETENTION_MS / MAX_VISITS (see visitDecay.js).
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
export const ACCESS_THROTTLE_MS = 1000 * 60 * 30;

export function getUrlKey(url) {
  return `url-${url.split('#')[0]}`;
}

export async function newUrl(deps, tabId, url) {
  deps.onVisit();
  if (!tabId) return;
  if (!url) return;
  // Only real websites belong in history/Favorites. Gating here (rather than at
  // each call site) means a non-http(s) navigation — about:blank, file://,
  // chrome://, data:, etc. — never enters allUrls, never evicts older keys, and
  // never bumps visitCount. Sits alongside the incognito/validTab policy:
  // about:blank previously slipped through because newUrl never consulted them.
  if (!isTrackableUrl(url)) return;
  // The url-* record below is rebuilt from a storage snapshot that can predate
  // the title/favicon write, so read the live tab to fill those display fields
  // when the snapshot lacks them. Guarded like recordAccess: a gone tab is fine.
  let liveTab;
  try {
    liveTab = await deps.getTab(tabId);
  } catch {
    liveTab = null;
  }
  return new Promise((resolve) => {
    const updates = {};
    const urlKey = getUrlKey(url);
    deps.getStorage(['allUrls', 'labels', 'siteVisits', 'deletedUrls', urlKey], (result) => {
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
            deps.removeRecord(removeUrlKey);
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
      if (liveTab && liveTab.url && getUrlKey(liveTab.url) === urlKey) {
        fillDisplayFromLiveTab(updates[urlKey], liveTab);
      }

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
export async function recordAccess(deps, tabId) {
  let tab;
  try {
    tab = await deps.getTab(tabId);
  } catch {
    return; // tab gone / lastError — nothing to record
  }
  if (!tab || !tab.url || !isTrackableUrl(tab.url)) return;

  const urlKey = getUrlKey(tab.url);
  const result = await deps.getStorage(urlKey);
  const record = result[urlKey];
  const visits = (record && record.visits) || [];
  const lastVisit = visits.length ? Math.max(...visits.map(Number)) : 0;

  const now = Date.now();
  if (now - lastVisit < ACCESS_THROTTLE_MS) return; // within throttle window

  return newUrl(deps, tab.id, tab.url);
}

export async function tabUpdates(deps, tab, process, updates) {
  return new Promise((resolve) => {
    if (!deps.validTab(tab)) {
      resolve({});
    }

    const urlKey = getUrlKey(tab.url);
    if (updates && updates[urlKey]) {
      resolve({ [urlKey]: urlUpdates(updates[urlKey], tab, process, deps.processesIndex) });
    }

    deps.getStorage(urlKey, (result) => {
      const url = result[urlKey] || { url: tab.url };
      resolve({ [urlKey]: urlUpdates(url, tab, process, deps.processesIndex) });
    });
  });
}

// `processesIndex` is only consulted when a `process` sample is supplied.
export function urlUpdates(url, tab, process, processesIndex) {
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
  // A raw-URL title (Chrome reports the URL as the title before <title> lands,
  // for unloaded tabs, and around group moves) only fills a record that has no
  // real title yet; it never replaces one.
  if (
    !url.edited && tab.status !== "loading" && tab.title && tab.title.length > 0 &&
    (!isRawUrlTitle(tab.title, tab.url) || isRawUrlTitle(url.title, url.url))
  ) url.title = tab.title;
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
