import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from './chromeShim';
import openUrlKey from './openUrlKey';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
const settle = () => new Promise((r) => setTimeout(r, 0));

const ACTIVE = [
  { urlKey: 'url-https://react.dev/learn', tabKey: 'tab-304', pinned: false },
];

describe('openUrlKey', () => {
  let created;
  let updated;

  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    created = [];
    updated = [];
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  const spy = () => {
    chrome.tabs.create = (opts, cb) => { created.push(opts); if (cb) cb(); };
    chrome.tabs.update = (id, opts, cb) => { updated.push({ id, ...opts }); if (cb) cb(); };
  };

  // THE RULE: a url the user already has open is focused, never duplicated
  it('focuses the existing tab when the url is already open', async () => {
    seed('activeTabs', ACTIVE);
    installChromeShim();
    spy();

    openUrlKey('url-https://react.dev/learn', 'https://react.dev/learn');
    await settle();

    expect(updated).toEqual([{ id: 304, active: true }]);
    expect(created).toEqual([]);
  });

  // the tab id is parsed out of the 'tab-<id>' key, so a focus targets the real tab
  it('parses the numeric tab id out of the tabKey', async () => {
    seed('activeTabs', [{ urlKey: 'url-https://x.com', tabKey: 'tab-9182' }]);
    installChromeShim();
    spy();

    openUrlKey('url-https://x.com', 'https://x.com');
    await settle();

    expect(updated[0].id).toBe(9182);
  });

  // an ordinary click on a result the user does not have open takes them there
  it('opens a new foreground tab when the url is not open', async () => {
    seed('activeTabs', ACTIVE);
    installChromeShim();
    spy();

    openUrlKey('url-https://overreacted.io', 'https://overreacted.io');
    await settle();

    expect(created).toEqual([{ url: 'https://overreacted.io', active: true }]);
    expect(updated).toEqual([]);
  });

  // meta-click is the platform convention for "open it, but don't take me there"
  it('opens a background tab when newTab is set', async () => {
    seed('activeTabs', []);
    installChromeShim();
    spy();

    openUrlKey('url-https://overreacted.io', 'https://overreacted.io', { newTab: true });
    await settle();

    expect(created).toEqual([{ url: 'https://overreacted.io', active: false }]);
  });

  // a deliberate no-op carried over from the overlay: meta-clicking a url that is
  // already open must not hand the user a second copy of the same tab
  it('does nothing when the url is already open and newTab is set', async () => {
    seed('activeTabs', ACTIVE);
    installChromeShim();
    spy();

    openUrlKey('url-https://react.dev/learn', 'https://react.dev/learn', { newTab: true });
    await settle();

    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  // an unseeded store must open the url rather than throw on the absent key
  it('opens the url when there are no active tabs at all', async () => {
    installChromeShim();
    spy();

    openUrlKey('url-https://overreacted.io', 'https://overreacted.io');
    await settle();

    expect(created).toHaveLength(1);
  });
});
