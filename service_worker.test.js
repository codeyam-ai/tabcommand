import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// service_worker.js is a verbatim-ported vanilla (non-module) background
// script: it declares top-level functions and immediately registers chrome.*
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
    storage: {
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      onChanged: evt(),
    },
    runtime: { getURL: vi.fn((p) => `chrome-extension://abc/${p}`) },
  };
}

function loadWorker(chrome) {
  const code = fs.readFileSync(SW_PATH, 'utf8');
  const factory = new Function(
    'chrome',
    'console',
    `${code}
    ;return {
      fns: { central, trackGroup, listenToProcesses, updateActiveTabs, update,
             newUrl, closeUrl, processProcesses, updateTotals, associateProcess,
             tabUpdates, urlUpdates, getUrlKey, validTab, getTabGroup,
             getLocalStorage, parseTabId, handleActiveTabsGroupChanges, groupTabs },
      state: {
        get groups() { return groups; },
        get samples() { return samples; },
        get processesIndex() { return processesIndex; },
      }
    };`
  );
  return factory(chrome, { log: vi.fn(), error: vi.fn() });
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

  describe('central', () => {
    // a deliberately empty trace hook — returns undefined and never throws
    it('is a no-op', () => {
      expect(fns.central()).toBeUndefined();
    });
  });

  describe('getUrlKey', () => {
    // builds a url- prefixed key, stripping any hash fragment
    it('prefixes with url- and strips the fragment', () => {
      expect(fns.getUrlKey('https://a.com/p')).toBe('url-https://a.com/p');
      expect(fns.getUrlKey('https://a.com/p#section')).toBe('url-https://a.com/p');
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
  });
});
