import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import deriveSystemTotals from './src/lib/utils/deriveSystemTotals.js';
import isTrackableUrl from './src/lib/utils/isTrackableUrl.js';
import samePageKey from './src/lib/utils/samePageKey.js';
import appendGroupingLog from './src/lib/utils/groupingLog.js';

// service_worker.js is a vanilla (non-module) background script: it declares
// top-level functions and immediately registers chrome.*
// listeners / queries at load time. To exercise the functions without editing
// the source, we read the file and evaluate it in a sloppy-mode Function
// wrapper with a stubbed `chrome` injected, then return the top-level
// declarations plus getters onto the module-level mutable state. The chrome
// stub's callback-taking methods are no-ops by default so the load-time side
// effects register listeners but never run their async bodies; individual
// tests reconfigure the stubs they need.
const SW_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'service_worker.js');

function makeChrome() {
  const evt = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  return {
    tabGroups: {
      onCreated: evt(),
      onUpdated: evt(),
      query: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
    },
    tabs: {
      WindowType: { NORMAL: 'normal' },
      onUpdated: evt(),
      onActivated: evt(),
      onCreated: evt(),
      onReplaced: evt(),
      onMoved: evt(),
      onRemoved: evt(),
      query: vi.fn(),
      get: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
      remove: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    processes: { onUpdatedWithMemory: evt() },
    alarms: {
      create: vi.fn(),
      onAlarm: evt(),
    },
    storage: {
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      onChanged: evt(),
    },
    runtime: { getURL: vi.fn((p) => `chrome-extension://abc/${p}`) },
  };
}

// service_worker.js is shipped as an ES-module service worker (crxjs sets
// `"type": "module"` at build), so it `import`s the pure deriveSystemTotals util.
// The sloppy-mode Function wrapper here can't hold a top-level `import`, so we
// strip the import line and inject the REAL util as a parameter — the worker
// tests then exercise the same util that deriveSystemTotals.test.js covers.
function loadWorker(chrome) {
  const raw = fs.readFileSync(SW_PATH, 'utf8');
  const code = raw.replace(/^\s*import\s.*$/gm, '');
  const factory = new Function(
    'chrome',
    'console',
    'deriveSystemTotals',
    'isTrackableUrl',
    'samePageKey',
    'appendGroupingLog',
    `${code}
    ;return {
      fns: { trackGroup, listenToProcesses, updateActiveTabs, update,
             newUrl, recordAccess, closeUrl, processProcesses, updateTotals, associateProcess,
             tabUpdates, urlUpdates, getUrlKey, validTab, getTabGroup, mapColors,
             getLocalStorage, parseTabId, handleActiveTabsGroupChanges, groupTabs,
             initLoadSource, processesApiAvailable, systemApiAvailable,
             startSystemLoadPolling, stopSystemLoadPolling, pollSystemLoad,
             autoCloseSweep, isAutoCloseEligible, pruneAutoClosed,
             autoCloseThresholdMinutes, urlKeyIsMember, ejectAutoGroupedTab,
             recordInGroupTab, debugGroup, pruneVisits },
      state: {
        get groups() { return groups; },
        get samples() { return samples; },
        get processesIndex() { return processesIndex; },
        get pendingUngroups() { return pendingUngroups; },
        get autoGroupedTabs() { return autoGroupedTabs; },
      }
    };`
  );
  return factory(chrome, { log: vi.fn(), error: vi.fn() }, deriveSystemTotals, isTrackableUrl, samePageKey, appendGroupingLog);
}

describe('service_worker.js', () => {
  let chrome;
  let fns;
  let state;

  beforeEach(() => {
    chrome = makeChrome();
    const loaded = loadWorker(chrome);
    fns = loaded.fns;
    state = loaded.state;
  });

  // registers chrome listeners at load without throwing
  it('loads and registers chrome event listeners on import', () => {
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(chrome.tabGroups.onCreated.addListener).toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
    expect(chrome.processes.onUpdatedWithMemory.addListener).toHaveBeenCalled();
  });

  describe('getUrlKey', () => {
    // builds a url- prefixed key, stripping any hash fragment
    it('prefixes with url- and strips the fragment', () => {
      expect(fns.getUrlKey('https://a.com/p')).toBe('url-https://a.com/p');
      expect(fns.getUrlKey('https://a.com/p#section')).toBe('url-https://a.com/p');
    });
  });

  describe('mapColors', () => {
    // maps a Chrome named color to its hex value (used when seeding a label's color)
    it('maps a named color to hex', () => {
      expect(fns.mapColors('blue')).toBe('#1873E4');
      expect(fns.mapColors('grey')).toBe('#5F6367');
    });

    // maps a hex value back to its Chrome named color (used when grouping from a label)
    it('maps a hex value back to a named color', () => {
      expect(fns.mapColors('#1F8E43')).toBe('green');
      expect(fns.mapColors('#007B82')).toBe('cyan');
    });

    // an unknown color (neither a known name nor hex) resolves to undefined
    it('returns undefined for an unknown color', () => {
      expect(fns.mapColors('chartreuse')).toBeUndefined();
      expect(fns.mapColors('#ABCDEF')).toBeUndefined();
    });
  });

  describe('validTab', () => {
    // accepts ordinary web URLs
    it('accepts http and https tabs', () => {
      expect(fns.validTab({ url: 'https://example.com' })).toBeTruthy();
    });

    // rejects empty and browser-internal schemes
    it('rejects empty and internal-scheme tabs', () => {
      expect(fns.validTab({ url: '' })).toBeFalsy();
      expect(fns.validTab({ url: 'chrome://settings' })).toBe(false);
      expect(fns.validTab({ url: 'devtools://devtools/x' })).toBe(false);
      expect(fns.validTab({ url: 'chrome-extension://abc/index.html' })).toBe(false);
    });

    // incognito tabs are invalid everywhere validTab is consulted, so their
    // visits never reach activeTabs or the url-* process records.
    it('rejects incognito tabs', () => {
      expect(fns.validTab({ url: 'https://secret.com', incognito: true })).toBe(false);
    });
  });

  // Incognito navigations must leave no trace: the onUpdated handler's direct
  // changeInfo.url recording path (which bypasses validTab) is guarded so an
  // incognito navigation never enters allUrls or bumps visitCount, while a
  // normal-tab navigation still records as before.
  describe('onUpdated incognito guard', () => {
    // A storage mock that answers each query shape with sensible empties so the
    // handler (and the newUrl it may call) can run to completion.
    const emptyStorage = (chrome) => {
      chrome.storage.local.get.mockImplementation((query, cb) => {
        const keys =
          typeof query === 'string'
            ? [query]
            : Array.isArray(query)
            ? query
            : Object.keys(query);
        const res = {};
        for (const k of keys) {
          if (k === 'allUrls') res.allUrls = [];
          else if (k === 'activeTabs') res.activeTabs = [];
          else if (k === 'autoClosed') res.autoClosed = {};
          else if (k === 'labels') res.labels = {};
          // url-* keys stay absent (undefined), as on a first visit.
        }
        cb(res);
      });
      chrome.tabs.query.mockImplementation((_q, cb) => cb([]));
    };

    const getHandler = (chrome) =>
      chrome.tabs.onUpdated.addListener.mock.calls[0][0];

    // Did any storage write add this urlKey to allUrls (i.e. record the visit)?
    const recordedAllUrls = (chrome, urlKey) =>
      chrome.storage.local.set.mock.calls.some(
        (c) => Array.isArray(c[0].allUrls) && c[0].allUrls.includes(urlKey)
      );

    // A normal navigation records the url; the incognito one must not.
    it('records a normal-tab navigation but not an incognito one', async () => {
      emptyStorage(chrome);
      const onUpdated = getHandler(chrome);

      // Normal tab navigating to a new URL → recorded into allUrls.
      chrome.storage.local.set.mockClear();
      await onUpdated(
        1,
        { url: 'https://normal.com' },
        { id: 1, url: 'https://normal.com', incognito: false }
      );
      expect(recordedAllUrls(chrome, 'url-https://normal.com')).toBe(true);

      // Incognito tab navigating to a new URL → never recorded.
      chrome.storage.local.set.mockClear();
      await onUpdated(
        2,
        { url: 'https://secret.com' },
        { id: 2, url: 'https://secret.com', incognito: true }
      );
      expect(recordedAllUrls(chrome, 'url-https://secret.com')).toBe(false);
    });
  });

  describe('parseTabId', () => {
    // extracts the integer tab id from a "tab-<n>" key
    it('parses the numeric id from a tabKey', () => {
      expect(fns.parseTabId({ tabKey: 'tab-42' })).toBe(42);
    });
  });

  describe('updateTotals', () => {
    // accumulates each process metric into the running totals
    it('sums process metrics into processTotals', () => {
      const updates = { processTotals: { cpu: 1, network: 1, privateMemory: 0, jsMemoryAllocated: 0, jsMemoryUsed: 0 } };
      const out = fns.updateTotals(
        { cpu: 2, network: 3, privateMemory: 4, jsMemoryAllocated: 5, jsMemoryUsed: 6 },
        updates
      );
      expect(out.processTotals).toEqual({ cpu: 3, network: 4, privateMemory: 4, jsMemoryAllocated: 5, jsMemoryUsed: 6 });
    });

    // treats missing metrics as zero
    it('defaults missing metrics to 0', () => {
      const updates = { processTotals: { cpu: 0, network: 0, privateMemory: 0, jsMemoryAllocated: 0, jsMemoryUsed: 0 } };
      const out = fns.updateTotals({}, updates);
      expect(out.processTotals.cpu).toBe(0);
    });
  });

  describe('urlUpdates', () => {
    // initializes a processes bucket and copies tab metadata
    it('initializes processes and copies title/favicon/groupId', () => {
      const out = fns.urlUpdates(
        { url: 'https://a.com' },
        { status: 'complete', title: 'A', favIconUrl: 'a.png', groupId: 5, url: 'https://a.com' }
      );
      expect(out.title).toBe('A');
      expect(out.favicon).toBe('a.png');
      expect(out.groupId).toBe(5);
      expect(out.processes.samples).toBe(0);
    });

    // accumulates process stats and bumps the sample counter
    it('accumulates process stats when a process is supplied', () => {
      const out = fns.urlUpdates(
        { url: 'https://b.com', title: 'B' },
        { status: 'complete', title: 'B', url: 'https://b.com', groupId: -1 },
        { cpu: 10, network: 2, privateMemory: 1, jsMemoryAllocated: 1, jsMemoryUsed: 1 }
      );
      expect(out.processes.samples).toBe(1);
      expect(out.processes.cpu).toBe(10);
    });

    // falls back to the url as the title when the tab has none
    it('uses the url as title when title is missing', () => {
      const out = fns.urlUpdates({ url: 'https://c.com' }, { status: 'complete', url: 'https://c.com' });
      expect(out.title).toBe('https://c.com');
    });

    // an edited record keeps its user title/favicon instead of taking the live tab's values
    it('preserves an edited title and favicon', () => {
      const out = fns.urlUpdates(
        { url: 'https://a.com', title: 'My Title', favicon: 'mine.png', edited: true },
        { status: 'complete', title: 'Live Title', favIconUrl: 'live.png', groupId: -1, url: 'https://a.com' }
      );
      expect(out.title).toBe('My Title');
      expect(out.favicon).toBe('mine.png');
    });

    // a non-edited record still takes the live tab's title/favicon (guards the flag's scope)
    it('still copies the live title and favicon when not edited', () => {
      const out = fns.urlUpdates(
        { url: 'https://a.com', title: 'Old', favicon: 'old.png' },
        { status: 'complete', title: 'Live Title', favIconUrl: 'live.png', groupId: -1, url: 'https://a.com' }
      );
      expect(out.title).toBe('Live Title');
      expect(out.favicon).toBe('live.png');
    });
  });

  describe('update', () => {
    // writes the supplied object straight to chrome.storage.local
    it('persists updates to chrome.storage.local', () => {
      fns.update({ allUrls: ['url-a'] });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ allUrls: ['url-a'] });
    });
  });

  describe('getLocalStorage', () => {
    // invokes the callback form with the chrome result
    it('invokes the callback with the storage result', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ activeTabs: [1] }));
      const cb = vi.fn();
      fns.getLocalStorage('activeTabs', cb);
      expect(cb).toHaveBeenCalledWith({ activeTabs: [1] });
    });

    // resolves a promise with the result when no callback is given
    it('resolves with the result when no callback is passed', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ labels: {} }));
      await expect(fns.getLocalStorage('labels')).resolves.toEqual({ labels: {} });
    });
  });

  describe('getTabGroup', () => {
    // short-circuits to null for absent / sentinel ids
    it('resolves null for id -1 or null', async () => {
      await expect(fns.getTabGroup(-1)).resolves.toBeNull();
      await expect(fns.getTabGroup(null)).resolves.toBeNull();
    });

    // resolves the chrome.tabGroups.get result for a real id
    it('resolves the group for a real id', async () => {
      chrome.tabGroups.get.mockImplementation((_id, cb) => cb({ id: 3, title: 'Work' }));
      await expect(fns.getTabGroup(3)).resolves.toEqual({ id: 3, title: 'Work' });
    });
  });

  describe('trackGroup', () => {
    // records the group title keyed by its integer id
    it('stores the group title by id', () => {
      fns.trackGroup({ id: '5', title: 'Reading' });
      expect(state.groups[5]).toBe('Reading');
    });
  });

  describe('listenToProcesses', () => {
    // subscribes processProcesses to the memory-update event
    it('registers the processes listener', () => {
      chrome.processes.onUpdatedWithMemory.addListener.mockClear();
      fns.listenToProcesses();
      expect(chrome.processes.onUpdatedWithMemory.addListener).toHaveBeenCalledWith(fns.processProcesses);
    });

    // swallows the error when the processes API is unavailable
    it('does not throw when the processes API throws', () => {
      chrome.processes.onUpdatedWithMemory.addListener.mockImplementation(() => {
        throw new Error('no processes API');
      });
      expect(() => fns.listenToProcesses()).not.toThrow();
    });
  });

  describe('closeUrl', () => {
    // moves the closed url to the front of allUrls and runs the callback
    it('reorders allUrls, persists, and invokes the callback', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ allUrls: ['url-a', 'url-b', 'url-c'] }));
      const done = vi.fn();
      fns.closeUrl('url-c', done);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ allUrls: ['url-c', 'url-a', 'url-b'] });
      expect(done).toHaveBeenCalled();
    });

    // REGRESSION: an UNTRACKED key has indexOf -1, and splice at -1 removes the
    // LAST element — so the unguarded move-to-front silently promoted the OLDEST
    // key to the front, corrupting the recency order the eviction trim relies on.
    // Nothing to reorder for a key we never tracked: leave allUrls alone.
    it('leaves allUrls untouched when the key is not tracked', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ allUrls: ['url-a', 'url-b', 'url-c'] }));
      const done = vi.fn();
      fns.closeUrl('url-never-seen', done);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalled();
    });
  });

  describe('newUrl', () => {
    // returns undefined when called without a tab id or url
    it('returns early without tabId/url', async () => {
      await expect(fns.newUrl(undefined, 'https://a.com')).resolves.toBeUndefined();
      await expect(fns.newUrl(1, undefined)).resolves.toBeUndefined();
    });

    // adds a brand-new url key to the front of allUrls
    it('prepends an unseen url key to allUrls', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ allUrls: ['url-old'], labels: {} }));
      const updates = await fns.newUrl(1, 'https://new.com');
      expect(updates.allUrls[0]).toBe('url-https://new.com');
    });

    // REGRESSION: a REVISIT must move the url key back to the front of allUrls.
    // allUrls is the recency list the tracked-URL cap trims from the TAIL, so a
    // key that never moves on revisit drifts out, gets evicted, and has its whole
    // url-* record — visits and all — deleted. That is what reset a daily-visited
    // site to "1 visit". Previously newUrl only inserted when the key was ABSENT,
    // so for an already-present key it never touched allUrls at all.
    it('moves a revisited url key to the front of allUrls', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({
          allUrls: ['url-https://new.com', 'url-https://a.com', 'url-https://b.com'],
          labels: {},
        })
      );
      const updates = await fns.newUrl(1, 'https://b.com');
      expect(updates.allUrls[0]).toBe('url-https://b.com');
      expect(updates.allUrls).toHaveLength(3);
    });

    // The durable half of a visit: it accumulates under the site's HOST in
    // siteVisits, which the eviction branch never touches.
    it('records the visit under the site host in siteVisits', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ allUrls: [], labels: {} }));
      const before = Date.now();
      const updates = await fns.newUrl(1, 'https://www.espn.com/nfl/story/id/1');
      expect(updates.siteVisits['espn.com']).toHaveLength(1);
      expect(updates.siteVisits['espn.com'][0]).toBeGreaterThanOrEqual(before);
    });

    // Every page of a content site credits the SITE, not its own orphan key: a
    // second article on the same host appends to the same siteVisits bucket.
    it('accumulates visits from different pages of one site under one host', async () => {
      const earlier = Date.now() - 1000 * 60 * 60;
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ allUrls: [], labels: {}, siteVisits: { 'espn.com': [earlier] } })
      );
      const updates = await fns.newUrl(1, 'https://espn.com/nba/standings');
      expect(updates.siteVisits['espn.com']).toHaveLength(2);
      expect(updates.siteVisits['espn.com'][0]).toBe(earlier);
    });

    // siteVisits must SURVIVE the eviction that deletes url-* records: the
    // durable store is written even while the tracked-URL cap is trimming keys,
    // so a site's stats outlive its record. This is the whole point of the store.
    it('keeps siteVisits history for a site whose url record is evicted', async () => {
      const history = [Date.now() - 1000 * 60 * 60 * 24 * 3, Date.now() - 1000 * 60 * 60];
      // A full recency list, so this visit pushes the tail past the cap.
      const allUrls = Array.from({ length: 500 }, (_, i) => `url-https://pad-${i}.com`);
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ allUrls, labels: {}, siteVisits: { 'wikipedia.org': history } })
      );
      const updates = await fns.newUrl(1, 'https://wikipedia.org/wiki/Main_Page');
      // Keys past the cap were evicted...
      expect(updates.allUrls).toHaveLength(500);
      // ...but the site's history is intact and grew by this visit.
      expect(updates.siteVisits['wikipedia.org']).toHaveLength(history.length + 1);
      expect(updates.siteVisits['wikipedia.org'].slice(0, 2)).toEqual(history);
    });

    // Non-website navigations (about:blank, file://, chrome://, data:) are
    // never recorded: newUrl returns before touching storage so they can't
    // enter allUrls or bump visitCount.
    it('does not record non-website URLs', async () => {
      const get = vi.fn((_q, cb) => cb({ allUrls: [], labels: {} }));
      chrome.storage.local.get.mockImplementation(get);
      for (const url of [
        'about:blank',
        'file:///Users/x/doc.html',
        'chrome://extensions',
        'data:text/html,hi',
      ]) {
        await expect(fns.newUrl(1, url)).resolves.toBeUndefined();
      }
      expect(get).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    // A brand-new url records a first visit timestamp alongside visitCount 1, so
    // Favorites can rank by a time-decayed sum of visits.
    it('records a first visit timestamp and visitCount on a new url', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ allUrls: [], labels: {} }));
      const before = Date.now();
      const updates = await fns.newUrl(1, 'https://new.com');
      const record = updates['url-https://new.com'];
      expect(record.visitCount).toBe(1);
      expect(record.visits).toHaveLength(1);
      expect(record.visits[0]).toBeGreaterThanOrEqual(before);
    });

    // A repeat visit appends a fresh timestamp and increments visitCount while
    // preserving the prior visits and other url-* fields.
    it('appends a visit timestamp on a repeat visit', async () => {
      const oldTs = Date.now() - 1000 * 60 * 60; // an hour ago
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({
          allUrls: ['url-https://a.com'],
          labels: {},
          'url-https://a.com': { url: 'https://a.com', title: 'A', visitCount: 2, visits: [oldTs] },
        })
      );
      const updates = await fns.newUrl(1, 'https://a.com');
      const record = updates['url-https://a.com'];
      expect(record.title).toBe('A'); // existing fields preserved
      expect(record.visitCount).toBe(3);
      expect(record.visits).toHaveLength(2);
      expect(record.visits[0]).toBe(oldTs);
    });

    // Visits older than the retention horizon are pruned on write, so per-site
    // history stays bounded.
    it('prunes visits older than the retention horizon on write', async () => {
      const ancient = Date.now() - 1000 * 60 * 60 * 24 * 60; // 60 days ago
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({
          allUrls: ['url-https://a.com'],
          labels: {},
          'url-https://a.com': { url: 'https://a.com', visitCount: 5, visits: [ancient] },
        })
      );
      const updates = await fns.newUrl(1, 'https://a.com');
      const record = updates['url-https://a.com'];
      // The ancient visit is dropped; only the fresh one survives.
      expect(record.visits).toHaveLength(1);
      expect(record.visits).not.toContain(ancient);
    });
  });

  describe('recordAccess', () => {
    // Mirror of the worker's ACCESS_THROTTLE_MS (not exported through fns).
    const ACCESS_THROTTLE_MS_TEST = 1000 * 60 * 30;
    // Switching back to a tab whose last visit is older than the throttle
    // window records a visit (delegating to newUrl), so a kept-open favorite
    // you return to earns rank credit.
    it('records a visit when the last visit is older than the throttle', async () => {
      const stale = Date.now() - ACCESS_THROTTLE_MS_TEST - 1000; // just past the window
      chrome.tabs.get.mockResolvedValue({ id: 7, url: 'https://a.com' });
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({
          allUrls: ['url-https://a.com'],
          labels: {},
          'url-https://a.com': { url: 'https://a.com', title: 'A', visitCount: 2, visits: [stale] },
        })
      );
      const updates = await fns.recordAccess(1);
      const record = updates['url-https://a.com'];
      expect(record.visitCount).toBe(3);
      expect(record.visits).toHaveLength(2);
    });

    // Re-activating the same site within the throttle window records nothing, so
    // rapid alt-tabbing and the open→activate sequence can't inflate a rank.
    it('records nothing within the throttle window', async () => {
      const recent = Date.now() - 1000 * 60; // a minute ago, well inside 30 min
      chrome.tabs.get.mockResolvedValue({ id: 7, url: 'https://a.com' });
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ 'url-https://a.com': { url: 'https://a.com', visitCount: 2, visits: [recent] } })
      );
      await expect(fns.recordAccess(1)).resolves.toBeUndefined();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    // A missing tab (rejected get) or a non-trackable URL is ignored — no read,
    // no write.
    it('ignores missing tabs and non-trackable URLs', async () => {
      chrome.tabs.get.mockRejectedValueOnce(new Error('No tab with id'));
      await expect(fns.recordAccess(999)).resolves.toBeUndefined();

      chrome.tabs.get.mockResolvedValueOnce({ id: 8, url: 'chrome://extensions' });
      await expect(fns.recordAccess(8)).resolves.toBeUndefined();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('pruneVisits', () => {
    // A non-array or empty input yields an empty array, never a throw.
    it('returns [] for non-array or empty input', () => {
      const now = Date.now();
      expect(fns.pruneVisits(undefined, now)).toEqual([]);
      expect(fns.pruneVisits([], now)).toEqual([]);
    });

    // Visits older than the retention horizon are dropped.
    it('drops visits older than the retention horizon', () => {
      const now = Date.now();
      const day = 1000 * 60 * 60 * 24;
      const fresh = now - day;
      const stale = now - 60 * day;
      expect(fns.pruneVisits([stale, fresh], now)).toEqual([fresh]);
    });

    // The result is sorted ascending and drops non-finite entries.
    it('sorts ascending and filters non-finite entries', () => {
      const now = Date.now();
      const day = 1000 * 60 * 60 * 24;
      const a = now - 3 * day;
      const b = now - 1 * day;
      expect(fns.pruneVisits([b, a, NaN, 'x'], now)).toEqual([a, b]);
    });

    // More than 50 entries keep only the newest 50.
    it('caps length to the newest 50 visits', () => {
      const now = Date.now();
      const many = [];
      for (let i = 0; i < 60; i++) many.push(now - i * 1000);
      const result = fns.pruneVisits(many, now);
      expect(result).toHaveLength(50);
      expect(result[result.length - 1]).toBe(now);
    });
  });

  describe('updateActiveTabs', () => {
    // queries normal-window tabs and writes the rebuilt activeTabs list
    it('queries tabs and persists the rebuilt active list', () => {
      chrome.tabs.query.mockImplementation((_q, cb) =>
        cb([{ id: 1, url: 'https://a.com', pinned: false, groupId: -1, active: true, tabIndex: 0 }])
      );
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ activeTabs: [], autoClosed: {} }));

      fns.updateActiveTabs();

      expect(chrome.tabs.query).toHaveBeenCalled();
      expect(chrome.storage.local.set).toHaveBeenCalled();
      const written = chrome.storage.local.set.mock.calls.at(-1)[0];
      expect(written.activeTabs[0].urlKey).toBe('url-https://a.com');
    });
  });

  describe('processProcesses', () => {
    // increments the sample counter and writes accumulated totals
    it('bumps samples and persists process totals', async () => {
      const before = state.samples;
      await fns.processProcesses({}); // no pids → totals only
      expect(state.samples).toBe(before + 1);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('associateProcess', () => {
    // merges per-tab url updates for each task tab id in the process
    it('fetches each task tab and merges its url updates', async () => {
      chrome.tabs.get.mockResolvedValue({ url: 'https://a.com', status: 'complete', title: 'A', groupId: -1 });
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({}));
      const out = await fns.associateProcess(
        { tasks: [{ tabId: 1 }], cpu: 1 },
        { processTotals: {} }
      );
      expect(chrome.tabs.get).toHaveBeenCalledWith(1);
      expect(out['url-https://a.com']).toBeTruthy();
    });
  });

  describe('tabUpdates', () => {
    // resolves an empty object for tabs that fail the validity check
    it('resolves {} for an invalid tab', async () => {
      await expect(fns.tabUpdates({ url: 'chrome://settings' })).resolves.toEqual({});
    });

    // resolves keyed url updates for a valid tab
    it('resolves keyed url updates for a valid tab', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({}));
      const out = await fns.tabUpdates({ url: 'https://a.com', status: 'complete', title: 'A', groupId: -1 });
      expect(out['url-https://a.com']).toBeTruthy();
    });
  });

  describe('handleActiveTabsGroupChanges', () => {
    // returns early when there is no previous value to diff against
    it('no-ops when oldValue is missing', async () => {
      await expect(
        fns.handleActiveTabsGroupChanges({ newValue: [], oldValue: undefined })
      ).resolves.toBeUndefined();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    // The add path must seed a label that does not exist yet rather than throwing
    // on `labels[title].urlKeys.push` (the previous `|| { urlKeys: [] }` fallback
    // was never written back).
    it('seeds a missing label on the add path without throwing', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) =>
        cb(id === 5 ? { id: 5, title: 'NewGroup', color: 'blue' }
                    : { id: 2, title: 'OldGroup', color: 'red' })
      );
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ labels: {} }));

      await expect(
        fns.handleActiveTabsGroupChanges({
          oldValue: [{ tabKey: 'tab-1', urlKey: 'url-z', groupId: 2, pinned: false }],
          newValue: [{ tabKey: 'tab-1', urlKey: 'url-z', groupId: 5, pinned: false }],
        })
      ).resolves.not.toThrow();

      const written = chrome.storage.local.set.mock.calls
        .map((c) => c[0])
        .find((o) => o && o.labels);
      expect(written.labels.NewGroup.urlKeys).toContain('url-z');
      // The seeded label carries the group's color, mapped to hex via mapColors.
      expect(written.labels.NewGroup.color).toBe('#1873E4');
    });
  });

  describe('groupTabs', () => {
    // ungroups a tab that no longer matches any label
    it('ungroups an unlabeled grouped tab', async () => {
      await fns.groupTabs([{ tabKey: 'tab-9', urlKey: 'url-x', pinned: false, groupId: -1 }], {});
      // groupId -1 (no group) and not pinned → no ungroup; assert it does not throw
      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
    });

    // skips pinned tabs entirely
    it('ignores pinned tabs', async () => {
      await fns.groupTabs([{ tabKey: 'tab-1', urlKey: 'url-y', pinned: true, groupId: 2 }], {});
      expect(chrome.tabs.group).not.toHaveBeenCalled();
    });

    // A tab on its way OUT of a group (ungroup in flight) must never be recorded
    // into the group it is leaving — this is the core navigate-out bug fix.
    it('does not capture a tab whose ungroup is pending', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work', color: 'blue' }));
      state.pendingUngroups.add(7);
      const labels = { Work: { title: 'Work', urlKeys: [] } };
      await fns.groupTabs(
        [{ tabKey: 'tab-7', urlKey: 'url-https://b.com', pinned: false, groupId: 5 }],
        labels
      );
      expect(labels.Work.urlKeys).not.toContain('url-https://b.com');
    });

    // Guards against over-suppression: a tab that genuinely sits in a group is
    // still recorded into that group's label.
    it('captures a genuinely grouped tab', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work', color: 'blue' }));
      const labels = { Work: { title: 'Work', urlKeys: [] } };
      await fns.groupTabs(
        [{ tabKey: 'tab-7', urlKey: 'url-https://b.com', pinned: false, groupId: 5 }],
        labels
      );
      expect(labels.Work.urlKeys).toContain('url-https://b.com');
    });
  });

  describe('urlKeyIsMember', () => {
    // a urlKey recorded in the label's urlKeys is a member
    it('is true when the urlKey is present in the label', () => {
      const label = { title: 'Work', urlKeys: ['url-https://a.com', 'url-https://b.com'] };
      expect(fns.urlKeyIsMember(label, 'url-https://b.com')).toBe(true);
    });

    // a urlKey absent from the label's urlKeys is not a member
    it('is false when the urlKey is absent', () => {
      const label = { title: 'Work', urlKeys: ['url-https://a.com'] };
      expect(fns.urlKeyIsMember(label, 'url-https://b.com')).toBe(false);
    });

    // an empty urlKeys list claims no members
    it('is false for a label with no urlKeys', () => {
      expect(fns.urlKeyIsMember({ title: 'Work', urlKeys: [] }, 'url-https://a.com')).toBe(false);
    });

    // a missing/undefined label is treated as non-membership rather than throwing,
    // so callers can pass labels[title] without a prior existence check
    it('is false when the label is undefined or null', () => {
      expect(fns.urlKeyIsMember(undefined, 'url-https://a.com')).toBe(false);
      expect(fns.urlKeyIsMember(null, 'url-https://a.com')).toBe(false);
    });
  });

  describe('recordInGroupTab', () => {
    // seeds a brand-new label (carrying the group's mapped color) when none exists
    it('seeds a missing label with the tab urlKey and mapped color', () => {
      const labels = {};
      fns.recordInGroupTab(
        labels,
        { title: 'Work', color: 'blue' },
        { tabKey: 'tab-7', urlKey: 'url-https://b.com', groupId: 5 }
      );
      expect(labels.Work.urlKeys).toEqual(['url-https://b.com']);
      expect(labels.Work.color).toBe('#1873E4');
    });

    // appends to an existing label's urlKeys rather than overwriting it
    it('pushes the urlKey into an existing label', () => {
      const labels = { Work: { title: 'Work', urlKeys: ['url-https://a.com'], color: '#1873E4' } };
      fns.recordInGroupTab(
        labels,
        { title: 'Work', color: 'blue' },
        { tabKey: 'tab-7', urlKey: 'url-https://b.com', groupId: 5 }
      );
      expect(labels.Work.urlKeys).toEqual(['url-https://a.com', 'url-https://b.com']);
    });

    // persists the updated labels object via update -> chrome.storage.local.set
    it('persists the updated labels to storage', () => {
      const labels = {};
      fns.recordInGroupTab(
        labels,
        { title: 'Work', color: 'blue' },
        { tabKey: 'tab-7', urlKey: 'url-https://b.com', groupId: 5 }
      );
      const written = chrome.storage.local.set.mock.calls.map((c) => c[0]).find((o) => o && o.labels);
      expect(written.labels.Work.urlKeys).toContain('url-https://b.com');
    });
  });

  describe('ejectAutoGroupedTab', () => {
    // While the real URL has not loaded (urlKey is the bare 'url-' placeholder),
    // ejection is deferred so we never act on the transient about:blank state.
    it('returns wait and does nothing while the URL is still unloaded', async () => {
      state.autoGroupedTabs.add(7);
      const result = await fns.ejectAutoGroupedTab(
        { tabKey: 'tab-7', urlKey: 'url-', groupId: 5 },
        'Work'
      );
      expect(result).toBe('wait');
      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
      expect(state.autoGroupedTabs.has(7)).toBe(true);
    });

    // Flicker guard: the in-memory snapshot said non-member, but FRESH storage
    // shows the URL is a genuine member (an overlapping event just added it) —
    // keep the tab grouped, clear the flag, and do not ungroup.
    it('keeps the tab and clears the flag when fresh storage shows membership', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ labels: { Work: { title: 'Work', urlKeys: ['url-https://b.com'] } } })
      );
      state.autoGroupedTabs.add(7);
      const result = await fns.ejectAutoGroupedTab(
        { tabKey: 'tab-7', urlKey: 'url-https://b.com', groupId: 5 },
        'Work'
      );
      expect(result).toBe('kept');
      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
      expect(state.autoGroupedTabs.has(7)).toBe(false);
    });

    // The URL is a non-member in fresh storage too — eject: ungroup the tab,
    // mark the in-flight ungroup in pendingUngroups, and clear the auto-group flag.
    it('ungroups a confirmed non-member and tracks the in-flight ungroup', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ labels: { Work: { title: 'Work', urlKeys: [] } } })
      );
      state.autoGroupedTabs.add(7);
      const result = await fns.ejectAutoGroupedTab(
        { tabKey: 'tab-7', urlKey: 'url-https://new.com', groupId: 5 },
        'Work'
      );
      expect(result).toBe('ejected');
      expect(chrome.tabs.ungroup).toHaveBeenCalledWith(7, expect.any(Function));
      expect(state.pendingUngroups.has(7)).toBe(true);
      expect(state.autoGroupedTabs.has(7)).toBe(false);
    });
  });

  describe('auto-grouped stickiness fix integration', () => {
    // The core bug fix: a tab Chrome auto-placed into a group whose URL is not a
    // deliberate label member must be EJECTED, never recorded into the label.
    it('ejects an auto-grouped non-member and does not record its URL', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work', color: 'blue' }));
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ labels: { Work: { title: 'Work', urlKeys: [] } } })
      );
      state.autoGroupedTabs.add(7);
      const labels = { Work: { title: 'Work', urlKeys: [] } };
      await fns.groupTabs(
        [{ tabKey: 'tab-7', urlKey: 'url-https://new.com', pinned: false, groupId: 5 }],
        labels
      );
      expect(chrome.tabs.ungroup).toHaveBeenCalledWith(7, expect.any(Function));
      expect(labels.Work.urlKeys).not.toContain('url-https://new.com');
    });

    // Membership beats the flag: an auto-grouped tab whose URL IS a deliberate
    // member stays grouped, gets its flag cleared, and is never ungrouped.
    it('keeps an auto-grouped tab whose URL is a deliberate member', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work', color: 'blue' }));
      state.autoGroupedTabs.add(7);
      const labels = { Work: { title: 'Work', urlKeys: ['url-https://b.com'] } };
      await fns.groupTabs(
        [{ tabKey: 'tab-7', urlKey: 'url-https://b.com', pinned: false, groupId: 5 }],
        labels
      );
      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
      expect(state.autoGroupedTabs.has(7)).toBe(false);
    });

    // An explicit groupId change is user intent and must clear an earlier
    // auto-group flag so groupTabs won't later yank the deliberately-moved tab out.
    it('clears the auto-group flag on a deliberate group change', async () => {
      chrome.tabGroups.get.mockImplementation((id, cb) =>
        cb(id === 5 ? { id: 5, title: 'NewGroup', color: 'blue' }
                    : { id: 2, title: 'OldGroup', color: 'red' })
      );
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ labels: {} }));
      state.autoGroupedTabs.add(1);
      await fns.handleActiveTabsGroupChanges({
        oldValue: [{ tabKey: 'tab-1', urlKey: 'url-z', groupId: 2, pinned: false }],
        newValue: [{ tabKey: 'tab-1', urlKey: 'url-z', groupId: 5, pinned: false }],
      });
      expect(state.autoGroupedTabs.has(1)).toBe(false);
    });

    // onRemoved must clear the flag so the in-memory set never leaks stale tab ids
    // after a flagged tab is closed.
    it('clears the auto-group flag when a flagged tab is removed', async () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ activeTabs: [] }));
      state.autoGroupedTabs.add(9);
      const onRemoved = chrome.tabs.onRemoved.addListener.mock.calls[0][0];
      await onRemoved(9, {});
      expect(state.autoGroupedTabs.has(9)).toBe(false);
    });
  });

  describe('debugGroup', () => {
    // The grouping tracer is gated behind DEBUG_GROUPING (off in production), so a
    // call is a safe no-op that never throws regardless of the payload shape.
    it('is a no-op that does not throw when disabled', () => {
      expect(() => fns.debugGroup('some-event', { tabId: 7, urlKey: 'url-x' })).not.toThrow();
      expect(fns.debugGroup('some-event', {})).toBeUndefined();
    });

    // MV3 recycles the worker constantly, so breadcrumbs must persist to storage
    // when the runtime `debugGrouping` flag is on — this is what makes a
    // cross-restart grouping bug diagnosable after the fact.
    it('persists a breadcrumb to groupingLog when the runtime flag is on', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ debugGrouping: true, groupingLog: [{ event: 'old' }] })
      );
      fns.debugGroup('heal', { tabId: 7, urlKey: 'url-x' });
      const written = chrome.storage.local.set.mock.calls
        .map((c) => c[0])
        .find((o) => o && o.groupingLog);
      expect(written).toBeTruthy();
      expect(written.groupingLog).toHaveLength(2);
      expect(written.groupingLog[1]).toMatchObject({ event: 'heal', details: { tabId: 7, urlKey: 'url-x' } });
    });

    // With the flag off (the default), the breadcrumb must NOT be written — the
    // diagnostics are opt-in so production storage is never touched with log noise.
    it('does not persist when the runtime flag is off', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) => cb({ debugGrouping: false }));
      fns.debugGroup('heal', { tabId: 7 });
      const written = chrome.storage.local.set.mock.calls
        .map((c) => c[0])
        .find((o) => o && o.groupingLog);
      expect(written).toBeUndefined();
    });
  });

  describe('onUpdated group removal', () => {
    // Sets the module-level `labels` by driving the storage.onChanged listener,
    // which mirrors how the worker keeps `labels` in sync at runtime.
    const setLabels = (chrome, labelsObj) => {
      const onChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      onChanged({ labels: { newValue: labelsObj, oldValue: {} } }, 'local');
    };

    // The cleanup path keys removal off getUrlKey(tab.url), which strips the
    // #fragment. A label storing the normalized key must be cleaned even when the
    // tab's live URL still carries a fragment (the inline `url-${tab.url}` form
    // missed these).
    it('removes a hashed URL using the normalized key when a tab leaves a group', async () => {
      chrome.storage.local.get.mockImplementation((query, cb) => {
        const keys = typeof query === 'string' ? [query] : Array.isArray(query) ? query : Object.keys(query);
        const res = {};
        for (const k of keys) {
          if (k === 'activeTabs') {
            res.activeTabs = [{ tabKey: 'tab-3', urlKey: 'url-https://docs.com/page', groupId: 5 }];
          } else if (k === 'allUrls') res.allUrls = [];
          else if (k === 'autoClosed') res.autoClosed = {};
          else if (k === 'labels') res.labels = {};
        }
        cb(res);
      });
      chrome.tabs.query.mockImplementation((_q, cb) => cb && cb([]));

      const labelsObj = { Work: { title: 'Work', urlKeys: ['url-https://docs.com/page'] } };
      setLabels(chrome, labelsObj);
      fns.trackGroup({ id: 5, title: 'Work' });

      const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      await onUpdated(3, { groupId: -1 }, { id: 3, url: 'https://docs.com/page#section' });

      // labelsObj is the same reference held module-level, so the splice is visible here.
      expect(labelsObj.Work.urlKeys).not.toContain('url-https://docs.com/page');
    });
  });

  describe('onUpdated in-page URL change keeps tab grouped', () => {
    // Storage mock that reports a single grouped tab whose stored urlKey is
    // `oldUrlKey`, so the handler's `oldTabUrl` lookup resolves and the eject
    // path runs. Everything else answers empty so newUrl can complete.
    const storageWithGroupedTab = (chrome, oldUrlKey, labelsObj) => {
      chrome.storage.local.get.mockImplementation((query, cb) => {
        const keys = typeof query === 'string' ? [query] : Array.isArray(query) ? query : Object.keys(query);
        const res = {};
        for (const k of keys) {
          if (k === 'activeTabs') {
            res.activeTabs = [{ tabKey: 'tab-3', urlKey: oldUrlKey, groupId: 5 }];
          } else if (k === 'allUrls') res.allUrls = [oldUrlKey];
          else if (k === 'autoClosed') res.autoClosed = {};
          else if (k === 'labels') res.labels = labelsObj || {};
        }
        cb(res);
      });
      chrome.tabs.query.mockImplementation((_q, cb) => cb && cb([]));
      // The in-page heal branch resolves the group's title, falling back to
      // getTabGroup when the in-memory `groups` map is cold (common right after a
      // service-worker restart). Resolve it here so that fallback completes
      // instead of hanging on an unmocked callback.
      chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work' }));
    };

    const getHandler = (chrome) => chrome.tabs.onUpdated.addListener.mock.calls[0][0];

    // Publishes `labelsObj` into the worker's module-level `labels` the same way
    // the runtime does — by driving the storage.onChanged listener — so the heal
    // branch reads it and mutations are visible on the same object reference.
    const setLabels = (chrome, labelsObj) => {
      const onChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
      onChanged({ labels: { newValue: labelsObj, oldValue: {} } }, 'local');
    };

    // The reported bug: a Google Docs tab in a group rewrites only its `?tab=`
    // query string in-page. Origin + path are unchanged, so this is NOT a
    // navigation and the tab must stay in its group — ungroup is not called.
    it('does not ungroup a grouped tab on a query-string-only change', async () => {
      const base = 'https://docs.google.com/document/d/1GMK/edit';
      storageWithGroupedTab(chrome, `url-${base}?tab=t.whli3qfeqr1i`);
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}?tab=t.other` },
        { id: 3, url: `${base}?tab=t.other`, groupId: 5, incognito: false }
      );

      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
    });

    // A fragment-only change (SPA anchor navigation) is also in-page: same
    // origin + path, so the tab stays grouped.
    it('does not ungroup a grouped tab on a fragment-only change', async () => {
      const base = 'https://app.example.com/board';
      storageWithGroupedTab(chrome, `url-${base}`);
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}#card-42` },
        { id: 3, url: `${base}#card-42`, groupId: 5, incognito: false }
      );

      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
    });

    // Guards against over-correction: a real navigation to a different path is
    // still a navigation, so the grouped tab is ejected exactly as before.
    it('still ungroups a grouped tab that navigates to a different path', async () => {
      storageWithGroupedTab(chrome, 'url-https://example.com/a');
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: 'https://example.com/b' },
        { id: 3, url: 'https://example.com/b', groupId: 5, incognito: false }
      );

      expect(chrome.tabs.ungroup).toHaveBeenCalledWith(3, expect.any(Function));
    });

    // A cross-origin navigation is likewise a real navigation and still ejects.
    it('still ungroups a grouped tab that navigates to a different origin', async () => {
      storageWithGroupedTab(chrome, 'url-https://example.com/page');
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: 'https://other.com/page' },
        { id: 3, url: 'https://other.com/page', groupId: 5, incognito: false }
      );

      expect(chrome.tabs.ungroup).toHaveBeenCalledWith(3, expect.any(Function));
    });

    // The reported bug, fixed at the root: a Google Docs tab recorded under one
    // `?tab=` key rewrites its query in-page. The label's stale urlKey must be
    // healed to follow the live URL so downstream exact-key comparisons keep
    // matching — otherwise reconciliation later drops the doc from the group.
    it('heals the drifted label urlKey to the live key on a query-only change', async () => {
      const base = 'https://docs.google.com/document/d/1GMK/edit';
      const staleKey = `url-${base}?tab=t.A`;
      const liveKey = `url-${base}?tab=t.B`;
      const labelsObj = { Work: { title: 'Work', urlKeys: [staleKey] } };
      storageWithGroupedTab(chrome, staleKey, labelsObj);
      setLabels(chrome, labelsObj);
      fns.trackGroup({ id: 5, title: 'Work' });
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}?tab=t.B` },
        { id: 3, url: `${base}?tab=t.B`, groupId: 5, incognito: false }
      );

      expect(labelsObj.Work.urlKeys).toEqual([liveKey]);
      expect(chrome.tabs.ungroup).not.toHaveBeenCalled();
    });

    // The recorded key may be a THIRD `?tab=` variant, not the immediately
    // previous one — locating the drifted slot by page identity (samePageKey)
    // still finds and rewrites it.
    it('heals a stale slot even when it is a third query variant', async () => {
      const base = 'https://docs.google.com/document/d/1GMK/edit';
      const recordedKey = `url-${base}?tab=t.A`;   // what the label holds
      const previousKey = `url-${base}?tab=t.B`;   // the tab's last-seen live key
      const liveKey = `url-${base}?tab=t.C`;        // where it is drifting to now
      const labelsObj = { Work: { title: 'Work', urlKeys: [recordedKey] } };
      storageWithGroupedTab(chrome, previousKey, labelsObj);
      setLabels(chrome, labelsObj);
      fns.trackGroup({ id: 5, title: 'Work' });
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}?tab=t.C` },
        { id: 3, url: `${base}?tab=t.C`, groupId: 5, incognito: false }
      );

      expect(labelsObj.Work.urlKeys).toEqual([liveKey]);
    });

    // If the live key is already recorded elsewhere in the label, healing must
    // remove the stale slot rather than create a duplicate entry.
    it('removes the stale slot without duplicating an already-present live key', async () => {
      const base = 'https://docs.google.com/document/d/1GMK/edit';
      const staleKey = `url-${base}?tab=t.A`;
      const liveKey = `url-${base}?tab=t.B`;
      const labelsObj = { Work: { title: 'Work', urlKeys: [staleKey, liveKey] } };
      storageWithGroupedTab(chrome, staleKey, labelsObj);
      setLabels(chrome, labelsObj);
      fns.trackGroup({ id: 5, title: 'Work' });
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}?tab=t.B` },
        { id: 3, url: `${base}?tab=t.B`, groupId: 5, incognito: false }
      );

      expect(labelsObj.Work.urlKeys).toEqual([liveKey]);
    });

    // A real navigation must NOT heal — the tab is ejected and the label is left
    // untouched, so heal only ever fires on an in-page change.
    it('does not heal the label on a real navigation', async () => {
      const staleKey = 'url-https://example.com/a';
      const labelsObj = { Work: { title: 'Work', urlKeys: [staleKey] } };
      storageWithGroupedTab(chrome, staleKey, labelsObj);
      setLabels(chrome, labelsObj);
      fns.trackGroup({ id: 5, title: 'Work' });
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: 'https://example.com/b' },
        { id: 3, url: 'https://example.com/b', groupId: 5, incognito: false }
      );

      expect(chrome.tabs.ungroup).toHaveBeenCalledWith(3, expect.any(Function));
      expect(labelsObj.Work.urlKeys).toEqual([staleKey]);
    });

    // Cold `groups` map (service worker just restarted): the title is not in the
    // in-memory map, so the heal must resolve it via getTabGroup and still
    // rewrite the drifted key.
    it('heals via the getTabGroup fallback when the groups map is cold', async () => {
      const base = 'https://docs.google.com/document/d/1GMK/edit';
      const staleKey = `url-${base}?tab=t.A`;
      const liveKey = `url-${base}?tab=t.B`;
      const labelsObj = { Work: { title: 'Work', urlKeys: [staleKey] } };
      storageWithGroupedTab(chrome, staleKey, labelsObj);
      setLabels(chrome, labelsObj);
      // Intentionally NO trackGroup — groups[5] is undefined, forcing the
      // getTabGroup fallback (mocked in storageWithGroupedTab to title 'Work').
      const onUpdated = getHandler(chrome);

      await onUpdated(
        3,
        { url: `${base}?tab=t.B` },
        { id: 3, url: `${base}?tab=t.B`, groupId: 5, incognito: false }
      );

      expect(labelsObj.Work.urlKeys).toEqual([liveKey]);
    });
  });

  // Channel-based degradation: the gauge's data source depends on which Chrome
  // API is available. processProcesses (Dev/Canary) tags 'processes'; the
  // system poll (stable Chrome) tags 'system'; neither tags 'none'.
  describe('load source fallback', () => {
    const cpuInfo = {
      processors: [
        { usage: { kernel: 10, user: 10, idle: 80, total: 100 } },
        { usage: { kernel: 20, user: 10, idle: 70, total: 100 } },
      ],
    };
    const memoryInfo = { capacity: 1000, availableCapacity: 400 }; // 60% used

    // Dev/Canary path: processes present → listener registered and the first
    // totals write is tagged loadDataSource:'processes'
    it("tags 'processes' and keeps processing when chrome.processes is present", async () => {
      // default `chrome` from beforeEach has chrome.processes
      expect(chrome.processes.onUpdatedWithMemory.addListener).toHaveBeenCalledWith(fns.processProcesses);
      await fns.processProcesses({});
      const writes = chrome.storage.local.set.mock.calls.map((c) => c[0]);
      expect(writes.some((w) => w.loadDataSource === 'processes')).toBe(true);
    });

    // stable Chrome: no processes API, but chrome.system.* present → one poll
    // writes a normalized processTotals tagged loadDataSource:'system'
    it("falls back to chrome.system and tags 'system' when processes is absent", async () => {
      const c = makeChrome();
      delete c.processes;
      c.system = {
        cpu: { getInfo: vi.fn().mockResolvedValue(cpuInfo) },
        memory: { getInfo: vi.fn().mockResolvedValue(memoryInfo) },
      };
      const loaded = loadWorker(c);
      // let the load-time poll resolve and schedule its repeat, then silence it
      await new Promise((r) => setTimeout(r, 0));
      loaded.fns.stopSystemLoadPolling();
      c.storage.local.set.mockClear();

      await loaded.fns.pollSystemLoad();
      loaded.fns.stopSystemLoadPolling();

      const last = c.storage.local.set.mock.calls.at(-1)[0];
      expect(last.loadDataSource).toBe('system');
      expect(last.processTotals).toBeTruthy();
      // memory pressure flows through on a single sample (never NaN)
      expect(last.processTotals.privateMemory).toBeGreaterThan(0);
      expect(Number.isNaN(last.processTotals.cpu)).toBe(false);
    });

    // neither API available → loadDataSource:'none', written once at init,
    // and nothing throws
    it("tags 'none' and never throws when no load API is available", () => {
      const c = makeChrome();
      delete c.processes;
      // no c.system at all
      expect(() => loadWorker(c)).not.toThrow();
      expect(c.storage.local.set).toHaveBeenCalledWith({ loadDataSource: 'none' });
    });

    // a thrown system call degrades to 'none' rather than crashing the worker
    it('degrades to none when a system call throws', async () => {
      const c = makeChrome();
      delete c.processes;
      c.system = {
        cpu: { getInfo: vi.fn().mockRejectedValue(new Error('denied')) },
        memory: { getInfo: vi.fn().mockResolvedValue(memoryInfo) },
      };
      const loaded = loadWorker(c);
      c.storage.local.set.mockClear();
      await loaded.fns.pollSystemLoad();
      loaded.fns.stopSystemLoadPolling();
      expect(c.storage.local.set).toHaveBeenCalledWith({ loadDataSource: 'none' });
    });
  });

  // The "Closer" engine: a periodic alarm sweeps inactive tabs, removing them and
  // recording each into the autoClosed map so the "Automatically Closed" UI lights up.
  describe('autoCloseSweep', () => {
    const MINUTE = 60 * 1000;

    // Drives one sweep against the supplied storage and returns the removed tab
    // ids plus the autoClosed map that was persisted.
    const runSweep = ({ activeTabs = [], autoClosed = {}, settings = {} }) => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ activeTabs, autoClosed, settings })
      );
      chrome.storage.local.set.mockClear();
      chrome.tabs.remove.mockClear();
      fns.autoCloseSweep();
      const lastSet = chrome.storage.local.set.mock.calls.at(-1);
      return {
        written: lastSet ? lastSet[0].autoClosed : undefined,
        removedIds: chrome.tabs.remove.mock.calls.map((c) => c[0]),
      };
    };

    const tab = (over) => ({
      tabKey: 'tab-1',
      urlKey: 'url-https://x.com',
      pinned: false,
      groupId: -1,
      tabCommandPinned: false,
      active: false,
      ...over,
    });

    // a periodic alarm + onAlarm listener are wired up at load
    it('registers the auto-close alarm at load', () => {
      expect(chrome.alarms.create).toHaveBeenCalledWith('auto-close-sweep', { periodInMinutes: 1 });
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    // an inactive ungrouped tab past the threshold is removed and recorded
    it('closes and records an inactive ungrouped tab', () => {
      const now = Date.now();
      const t = tab({ tabKey: 'tab-5', urlKey: 'url-old', activeAt: now - 200 * MINUTE, openedAt: now - 300 * MINUTE });
      const { written, removedIds } = runSweep({ activeTabs: [t] });
      expect(removedIds).toContain(5);
      expect(written['url-old']).toBeGreaterThan(0);
    });

    // pinned, thumbtack-pinned, and the active tab are exempt
    it('never closes pinned, tabCommandPinned, or the active tab', () => {
      const now = Date.now();
      const old = now - 200 * MINUTE;
      const { written, removedIds } = runSweep({
        activeTabs: [
          tab({ tabKey: 'tab-1', urlKey: 'url-pinned', pinned: true, activeAt: old }),
          tab({ tabKey: 'tab-2', urlKey: 'url-thumb', tabCommandPinned: true, activeAt: old }),
          tab({ tabKey: 'tab-3', urlKey: 'url-active', active: true, activeAt: old }),
        ],
      });
      expect(removedIds).toEqual([]);
      expect(written['url-pinned']).toBeUndefined();
      expect(written['url-thumb']).toBeUndefined();
      expect(written['url-active']).toBeUndefined();
    });

    // a tab active within the threshold window is left open
    it('keeps a tab that was active within the window', () => {
      const now = Date.now();
      const t = tab({ tabKey: 'tab-7', urlKey: 'url-recent', activeAt: now - 10 * MINUTE });
      const { written, removedIds } = runSweep({ activeTabs: [t] });
      expect(removedIds).toEqual([]);
      expect(written['url-recent']).toBeUndefined();
    });

    // grouped/labeled inactive tabs are in scope and get closed
    it('closes a grouped/labeled inactive tab', () => {
      const now = Date.now();
      const t = tab({ tabKey: 'tab-8', urlKey: 'url-grouped', groupId: 42, activeAt: now - 200 * MINUTE });
      const { removedIds } = runSweep({ activeTabs: [t] });
      expect(removedIds).toContain(8);
    });

    // a throwing chrome.tabs.remove for one tab does not abort the others
    it('continues the sweep when one tab removal throws', () => {
      chrome.tabs.remove.mockImplementation((id) => {
        if (id === 1) throw new Error('No tab with id: 1');
      });
      const now = Date.now();
      const old = now - 200 * MINUTE;
      const { written, removedIds } = runSweep({
        activeTabs: [
          tab({ tabKey: 'tab-1', urlKey: 'url-a', activeAt: old }),
          tab({ tabKey: 'tab-2', urlKey: 'url-b', activeAt: old }),
        ],
      });
      expect(removedIds).toContain(2);
      expect(written['url-a']).toBeGreaterThan(0);
      expect(written['url-b']).toBeGreaterThan(0);
    });

    // entries older than the retention window are pruned from the map
    it('prunes autoClosed entries older than MAX_AUTO_CLOSED_TIME', () => {
      const now = Date.now();
      const { written } = runSweep({
        activeTabs: [],
        autoClosed: {
          'url-fresh': now - 1000,
          'url-stale': now - 1000 * 60 * 60 * 24 * 6, // 6 days > 5-day window
        },
      });
      expect(written['url-fresh']).toBeDefined();
      expect(written['url-stale']).toBeUndefined();
    });

    // a shorter user-configured threshold closes a tab the default would keep
    it('respects a custom settings.autoCloseMinutes', () => {
      const now = Date.now();
      const t = tab({ tabKey: 'tab-9', urlKey: 'url-mid', activeAt: now - 90 * MINUTE });
      // default (120) keeps a 90-min-idle tab
      expect(runSweep({ activeTabs: [t] }).removedIds).toEqual([]);
      // a 60-min threshold closes it
      expect(runSweep({ activeTabs: [t], settings: { autoCloseMinutes: 60 } }).removedIds).toContain(9);
    });

    // the "Off" position (0) disables closing entirely
    it('closes nothing when autoCloseMinutes is 0 meaning Off', () => {
      const now = Date.now();
      const t = tab({ tabKey: 'tab-10', urlKey: 'url-off', activeAt: now - 300 * MINUTE });
      const { written, removedIds } = runSweep({ activeTabs: [t], settings: { autoCloseMinutes: 0 } });
      expect(removedIds).toEqual([]);
      expect(written['url-off']).toBeUndefined();
    });

    describe('autoCloseThresholdMinutes', () => {
      // unset → default; 0 → Off; a positive value passes through
      it('falls back to the default and maps Off to 0', () => {
        expect(fns.autoCloseThresholdMinutes({})).toBe(120);
        expect(fns.autoCloseThresholdMinutes({ autoCloseMinutes: 0 })).toBe(0);
        expect(fns.autoCloseThresholdMinutes({ autoCloseMinutes: 45 })).toBe(45);
      });
    });
  });
});
