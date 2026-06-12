import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim, KNOWN_KEYS } from './index';

const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

describe('chromeShim', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    delete globalThis.chrome;
    window.localStorage.clear();
  });

  // seeded localStorage hydrates the in-memory store on install
  it('hydrates the store from seeded localStorage', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ work: { name: 'Work' } }));
    window.localStorage.setItem('activeTabs', JSON.stringify([{ id: 1 }]));
    installChromeShim();
    expect(await get(['labels', 'activeTabs'])).toEqual({
      labels: { work: { name: 'Work' } },
      activeTabs: [{ id: 1 }],
    });
  });

  // dynamic per-URL keys (not in KNOWN_KEYS) hydrate too — without this, every
  // tab would render blank because the url-_url_ objects would never load
  it('hydrates dynamic url-_url_ keys that are not in KNOWN_KEYS', async () => {
    const urlKey = 'url-https://x.com';
    window.localStorage.setItem(urlKey, JSON.stringify({ title: 'X', favicon: '' }));
    installChromeShim();
    expect(await get(urlKey)).toEqual({ [urlKey]: { title: 'X', favicon: '' } });
  });

  // get accepts the string, array, and null (all) key forms
  it('get supports string, array, and all forms', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ a: 1 }));
    window.localStorage.setItem('activeTabs', JSON.stringify([1]));
    installChromeShim();
    expect(await get('labels')).toEqual({ labels: { a: 1 } });
    expect(await get(['labels', 'activeTabs'])).toEqual({ labels: { a: 1 }, activeTabs: [1] });
    expect(await get(null)).toEqual({ labels: { a: 1 }, activeTabs: [1] });
  });

  // a malformed seed value is ignored rather than crashing the boot
  it('ignores malformed seed values', async () => {
    window.localStorage.setItem('labels', '{not json');
    installChromeShim();
    expect(await get('labels')).toEqual({});
  });

  // set merges into the store, mirrors to localStorage, and fires onChanged
  it('set mirrors to localStorage and fires onChanged with areaName local', async () => {
    installChromeShim();
    const changes = [];
    chrome.storage.onChanged.addListener((c, area) => changes.push([c, area]));
    await new Promise((resolve) => chrome.storage.local.set({ labels: { a: 1 } }, resolve));
    expect(JSON.parse(window.localStorage.getItem('labels'))).toEqual({ a: 1 });
    expect(await get('labels')).toEqual({ labels: { a: 1 } });
    expect(changes).toHaveLength(1);
    expect(changes[0][1]).toBe('local');
    expect(changes[0][0].labels.newValue).toEqual({ a: 1 });
  });

  // remove clears the key from both the store and localStorage and fires onChanged
  it('remove clears the key and fires onChanged with the old value', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ a: 1 }));
    installChromeShim();
    const changes = [];
    chrome.storage.onChanged.addListener((c, area) => changes.push([c, area]));
    await new Promise((resolve) => chrome.storage.local.remove('labels', resolve));
    expect(window.localStorage.getItem('labels')).toBeNull();
    expect(await get('labels')).toEqual({});
    expect(changes[0][0].labels.oldValue).toEqual({ a: 1 });
  });

  // removeListener detaches a previously-added listener
  it('removeListener stops delivering change events', async () => {
    installChromeShim();
    let count = 0;
    const fn = () => { count += 1; };
    chrome.storage.onChanged.addListener(fn);
    chrome.storage.onChanged.removeListener(fn);
    await new Promise((resolve) => chrome.storage.local.set({ labels: {} }, resolve));
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

  // the known-keys list is the shared TabCommand storage contract
  it('shares the known TabCommand storage keys', () => {
    expect(KNOWN_KEYS).toEqual([
      'labels',
      'uxSettings',
      'autoClosed',
      'activeTabs',
      'allUrls',
      'previousLabels',
    ]);
  });
});
