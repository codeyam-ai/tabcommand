import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import deriveSystemTotals from './src/lib/utils/deriveSystemTotals.js';

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
    `${code}
    ;return {
      fns: { trackGroup, listenToProcesses, updateActiveTabs, update,
             newUrl, closeUrl, processProcesses, updateTotals, associateProcess,
             tabUpdates, urlUpdates, getUrlKey, validTab, getTabGroup, mapColors,
             getLocalStorage, parseTabId, handleActiveTabsGroupChanges, groupTabs,
             initLoadSource, processesApiAvailable, systemApiAvailable,
             startSystemLoadPolling, stopSystemLoadPolling, pollSystemLoad,
             autoCloseSweep, isAutoCloseEligible, pruneAutoClosed,
             autoCloseThresholdMinutes },
      state: {
        get groups() { return groups; },
        get samples() { return samples; },
        get processesIndex() { return processesIndex; },
        get pendingUngroups() { return pendingUngroups; },
      }
    };`
  );
  return factory(chrome, { log: vi.fn(), error: vi.fn() }, deriveSystemTotals);
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
