import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from './chromeShim';
import { deleteUrlFromHistory } from './deleteUrlFromHistory';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const read = (key) =>
  new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(result[key])));

const deleteAndSettle = (urlKey) =>
  new Promise((resolve) => deleteUrlFromHistory(urlKey, resolve));

describe('deleteUrlFromHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  // the core of the delete: the key leaves the recency list History renders from
  it('removes the url key from allUrls', async () => {
    seed('allUrls', ['url-a', 'url-b', 'url-c']);
    installChromeShim();

    await deleteAndSettle('url-b');

    expect(await read('allUrls')).toEqual(['url-a', 'url-c']);
  });

  // the record itself goes too, so no orphan url-* is left behind in storage
  it('removes the url record', async () => {
    seed('allUrls', ['url-a']);
    seed('url-a', { title: 'A page' });
    installChromeShim();

    await deleteAndSettle('url-a');

    expect(await read('url-a')).toBeUndefined();
  });

  // the tombstone is what makes the service worker's closeUrl skip this key when
  // the accompanying tab close fires onRemoved with a pre-delete snapshot
  it('writes a deletedUrls tombstone for the key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 12, 0));
    seed('allUrls', ['url-a']);
    installChromeShim();

    await deleteAndSettle('url-a');

    expect(await read('deletedUrls')).toEqual({ 'url-a': Date.now() });
  });

  // a stale auto-close time must not survive to re-date the page if it returns
  it('drops the key from autoClosed', async () => {
    seed('allUrls', ['url-a']);
    seed('autoClosed', { 'url-a': 123, 'url-b': 456 });
    installChromeShim();

    await deleteAndSettle('url-a');

    expect(await read('autoClosed')).toEqual({ 'url-b': 456 });
  });

  // tombstones accumulate across deletes rather than each write clobbering the last
  it('preserves tombstones from earlier deletes', async () => {
    seed('allUrls', ['url-a', 'url-b']);
    seed('deletedUrls', { 'url-old': 1 });
    installChromeShim();

    await deleteAndSettle('url-a');

    expect(Object.keys(await read('deletedUrls')).sort()).toEqual(['url-a', 'url-old']);
  });

  // REGRESSION: indexOf -1 with an unguarded splice removes the LAST element, so
  // deleting an untracked key would silently evict an unrelated page's history
  it('leaves allUrls untouched when the key is not tracked', async () => {
    seed('allUrls', ['url-a', 'url-b', 'url-c']);
    installChromeShim();

    await deleteAndSettle('url-never-seen');

    expect(await read('allUrls')).toEqual(['url-a', 'url-b', 'url-c']);
  });

  // deleting the only row empties the list rather than leaving a stale entry
  it('empties allUrls when the last row is deleted', async () => {
    seed('allUrls', ['url-only']);
    installChromeShim();

    await deleteAndSettle('url-only');

    expect(await read('allUrls')).toEqual([]);
  });

  // callers pass a continuation (Url closes the tab in it); it must still run
  // when there was nothing to splice out
  it('invokes the callback even for an untracked key', async () => {
    seed('allUrls', []);
    installChromeShim();
    const done = vi.fn();

    await new Promise((resolve) => deleteUrlFromHistory('url-never-seen', () => {
      done();
      resolve();
    }));

    expect(done).toHaveBeenCalledTimes(1);
  });
});
