import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim, KNOWN_KEYS } from './index';
import { resolveSeedKey, mirrorKeyFor } from './chromeShim';

// The shim models BOTH storage areas, because `labels` lives in
// `chrome.storage.sync` (see utils/storageAreas) while everything else stays
// local. A seeded localStorage key lands in whichever area owns it, so existing
// scenarios seed unchanged — and the `sync::` / `local::` prefixes exist to make
// the cross-area states (sync populated + local wiped, and the reverse) seedable
// at all.
const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const getSync = (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve));

describe('chromeShim', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    delete globalThis.chrome;
    window.localStorage.clear();
  });

  // seeded localStorage hydrates the in-memory store on install, routing each
  // key to the area that owns it
  it('hydrates each seeded key into the area that owns it', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ work: { name: 'Work' } }));
    window.localStorage.setItem('activeTabs', JSON.stringify([{ id: 1 }]));
    installChromeShim();
    expect(await getSync('labels')).toEqual({ labels: { work: { name: 'Work' } } });
    expect(await getLocal('activeTabs')).toEqual({ activeTabs: [{ id: 1 }] });
    // labels is NOT in local — the areas are genuinely separate stores
    expect(await getLocal('labels')).toEqual({});
  });

  // dynamic per-URL keys (not in KNOWN_KEYS) hydrate too — without this, every
  // tab would render blank because the url-_url_ objects would never load
  it('hydrates dynamic url-_url_ keys that are not in KNOWN_KEYS', async () => {
    const urlKey = 'url-https://x.com';
    window.localStorage.setItem(urlKey, JSON.stringify({ title: 'X', favicon: '' }));
    installChromeShim();
    expect(await getLocal(urlKey)).toEqual({ [urlKey]: { title: 'X', favicon: '' } });
  });

  // the sync__ prefix seeds the uninstall-survival state: groups in sync with
  // the whole local area wiped
  it('seeds the sync area from a sync-prefixed key', async () => {
    window.localStorage.setItem('sync::labels', JSON.stringify({ a: 1 }));
    installChromeShim();
    expect(await getSync('labels')).toEqual({ labels: { a: 1 } });
    expect(await getLocal('labels')).toEqual({});
  });

  // the local__ prefix seeds the pre-migration state: groups only in the old
  // local area, sync still empty
  it('seeds the local area from a local-prefixed key', async () => {
    window.localStorage.setItem('local::labels', JSON.stringify({ a: 1 }));
    installChromeShim();
    expect(await getLocal('labels')).toEqual({ labels: { a: 1 } });
    expect(await getSync('labels')).toEqual({});
  });

  // both prefixes at once is the "sync wins over stale local" state
  it('seeds both areas independently when both prefixes are present', async () => {
    window.localStorage.setItem('sync::labels', JSON.stringify({ fresh: 1 }));
    window.localStorage.setItem('local::labels', JSON.stringify({ stale: 1 }));
    installChromeShim();
    expect(await getSync('labels')).toEqual({ labels: { fresh: 1 } });
    expect(await getLocal('labels')).toEqual({ labels: { stale: 1 } });
  });

  // get accepts the string, array, and null (all) key forms
  it('get supports string, array, and all forms', async () => {
    window.localStorage.setItem('activeTabs', JSON.stringify([1]));
    window.localStorage.setItem('allUrls', JSON.stringify(['url-a']));
    installChromeShim();
    expect(await getLocal('activeTabs')).toEqual({ activeTabs: [1] });
    expect(await getLocal(['activeTabs', 'allUrls'])).toEqual({ activeTabs: [1], allUrls: ['url-a'] });
    expect(await getLocal(null)).toEqual({ activeTabs: [1], allUrls: ['url-a'] });
  });

  // a null read of one area must not leak the other area's keys
  it('a full read of an area returns only that area', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ a: 1 }));
    window.localStorage.setItem('activeTabs', JSON.stringify([1]));
    installChromeShim();
    expect(await getSync(null)).toEqual({ labels: { a: 1 } });
    expect(await getLocal(null)).toEqual({ activeTabs: [1] });
  });

  // a malformed seed value is ignored rather than crashing the boot
  it('ignores malformed seed values', async () => {
    window.localStorage.setItem('labels', '{not json');
    installChromeShim();
    expect(await getSync('labels')).toEqual({});
  });

  // a labels write mirrors to localStorage and reports the SYNC area, which is
  // what the worker onChanged listener now gates on
  it('set mirrors to localStorage and fires onChanged with areaName sync for labels', async () => {
    installChromeShim();
    const changes = [];
    chrome.storage.onChanged.addListener((c, area) => changes.push([c, area]));
    await new Promise((resolve) => chrome.storage.sync.set({ labels: { a: 1 } }, resolve));
    expect(JSON.parse(window.localStorage.getItem('labels'))).toEqual({ a: 1 });
    expect(await getSync('labels')).toEqual({ labels: { a: 1 } });
    expect(changes).toHaveLength(1);
    expect(changes[0][1]).toBe('sync');
    expect(changes[0][0].labels.newValue).toEqual({ a: 1 });
  });

  // a local write still reports areaName local
  it('fires onChanged with areaName local for a local write', async () => {
    installChromeShim();
    const changes = [];
    chrome.storage.onChanged.addListener((c, area) => changes.push([c, area]));
    await new Promise((resolve) => chrome.storage.local.set({ activeTabs: [1] }, resolve));
    expect(changes[0][1]).toBe('local');
  });

  // a value written to the area that does NOT own it (the labels local fallback
  // after a quota rejection) mirrors under its prefixed key, so the next boot
  // does not hydrate it as if it were the synced copy
  it('mirrors an off-area write under its prefixed key', async () => {
    installChromeShim();
    await new Promise((resolve) => chrome.storage.local.set({ labels: { a: 1 } }, resolve));
    expect(window.localStorage.getItem('labels')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('local::labels'))).toEqual({ a: 1 });
  });

  // remove clears the key from both the store and localStorage and fires onChanged
  it('remove clears the key and fires onChanged with the old value', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ a: 1 }));
    installChromeShim();
    const changes = [];
    chrome.storage.onChanged.addListener((c, area) => changes.push([c, area]));
    await new Promise((resolve) => chrome.storage.sync.remove('labels', resolve));
    expect(window.localStorage.getItem('labels')).toBeNull();
    expect(await getSync('labels')).toEqual({});
    expect(changes[0][0].labels.oldValue).toEqual({ a: 1 });
  });

  // removeListener detaches a previously-added listener
  it('removeListener stops delivering change events', async () => {
    installChromeShim();
    let count = 0;
    const fn = () => { count += 1; };
    chrome.storage.onChanged.addListener(fn);
    chrome.storage.onChanged.removeListener(fn);
    await new Promise((resolve) => chrome.storage.local.set({ activeTabs: [] }, resolve));
    expect(count).toBe(0);
  });

  // action stubs are callable and no-op (resolve callbacks / empty queries)
  it('exposes callable no-op action stubs', async () => {
    installChromeShim();
    expect(() => chrome.tabs.update(1, { pinned: true })).not.toThrow();
    expect(() => chrome.tabs.remove(1)).not.toThrow();
    expect(await new Promise((r) => chrome.tabs.create({}, r))).toEqual({});
    expect(await new Promise((r) => chrome.tabs.query({}, r))).toEqual([]);
    expect(await new Promise((r) => chrome.tabGroups.query({}, r))).toEqual([]);
    expect(() => chrome.processes.onUpdatedWithMemory.addListener(() => {})).not.toThrow();
    expect(chrome.runtime.getURL('index.html')).toBe('index.html');
  });

  // the sync-write guard reads chrome.runtime.lastError; the shim never fails a
  // write, so it must be present and undefined rather than missing
  it('exposes an undefined runtime lastError', () => {
    installChromeShim();
    expect('lastError' in chrome.runtime).toBe(true);
    expect(chrome.runtime.lastError).toBeUndefined();
  });

  // a seeded `processes` snapshot is delivered once to a processes listener, so
  // the Load page's raw per-process table can render in the preview
  it('emits a seeded processes snapshot to onUpdatedWithMemory listeners', async () => {
    const snapshot = { p1: { tasks: [{ title: 'Gmail', tabId: 206 }], cpu: 48, privateMemory: 1, jsMemoryUsed: 1 } };
    window.localStorage.setItem('processes', JSON.stringify(snapshot));
    installChromeShim();
    const received = await new Promise((resolve) =>
      chrome.processes.onUpdatedWithMemory.addListener(resolve)
    );
    expect(received).toEqual(snapshot);
  });

  // with no seeded processes the listener stays a no-op (table renders empty)
  it('does not emit to processes listeners when nothing is seeded', async () => {
    installChromeShim();
    let called = false;
    chrome.processes.onUpdatedWithMemory.addListener(() => { called = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(called).toBe(false);
  });

  // install is inert when a real extension chrome.storage.local already exists
  it('is inert when a real chrome.storage.local is present', () => {
    const realChrome = { storage: { local: { get() {}, set() {} } } };
    globalThis.chrome = realChrome;
    expect(installChromeShim()).toBe(false);
    expect(globalThis.chrome).toBe(realChrome);
  });

  // an unprefixed key routes through the storage-areas table; a prefixed one
  // overrides it
  it('resolveSeedKey routes unprefixed keys by area and honors prefixes', () => {
    expect(resolveSeedKey('labels')).toEqual({ area: 'sync', key: 'labels' });
    expect(resolveSeedKey('activeTabs')).toEqual({ area: 'local', key: 'activeTabs' });
    expect(resolveSeedKey('sync::labels')).toEqual({ area: 'sync', key: 'labels' });
    expect(resolveSeedKey('local::labels')).toEqual({ area: 'local', key: 'labels' });
  });

  // the mirror key is the inverse of resolveSeedKey, so a value round-trips into
  // the same area it was written to
  it('mirrorKeyFor is the inverse of resolveSeedKey', () => {
    expect(mirrorKeyFor('sync', 'labels')).toBe('labels');
    expect(mirrorKeyFor('local', 'activeTabs')).toBe('activeTabs');
    expect(mirrorKeyFor('local', 'labels')).toBe('local::labels');
    for (const raw of ['labels', 'activeTabs', 'local::labels', 'sync::labels']) {
      const { area, key } = resolveSeedKey(raw);
      expect(resolveSeedKey(mirrorKeyFor(area, key))).toEqual({ area, key });
    }
  });

  // the known-keys list is the shared TabCommand storage contract, derived from
  // the routing table so a key can never be known without being routed
  it('shares the known TabCommand storage keys', () => {
    expect(KNOWN_KEYS).toEqual([
      'labels',
      'uxSettings',
      'autoClosed',
      'activeTabs',
      'allUrls',
      'previousLabels',
      'theme',
      'settings',
      'syncStatus',
    ]);
  });
});
