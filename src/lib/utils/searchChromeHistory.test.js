import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from './chromeShim';
import searchChromeHistory from './searchChromeHistory';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const HISTORY = [
  { url: 'https://developer.chrome.com/docs/extensions/reference/tabs/',
    title: 'chrome.tabs | Chrome Extensions', lastVisitTime: 3 },
  { url: 'https://superuser.com/questions/1042/how-to-stop-hoarding-tabs',
    title: 'How do I stop keeping 200 tabs open?', lastVisitTime: 2 },
  { url: 'https://news.ycombinator.com', title: 'Hacker News', lastVisitTime: 1 },
];

describe('searchChromeHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // hits are shaped like url results so the page renders them through one row
  it('shapes chrome history entries like url search hits', async () => {
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const hits = await searchChromeHistory('chrome.tabs', []);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({
      id: 'chrome-history-https://developer.chrome.com/docs/extensions/reference/tabs/',
      urlTitle: 'chrome.tabs | Chrome Extensions',
      url: 'https://developer.chrome.com/docs/extensions/reference/tabs/',
      lastVisitTime: 3,
    });
  });

  // ids are namespaced so they can never collide with a tracked 'url-<url>' id
  it('namespaces every id under chrome-history-', async () => {
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const hits = await searchChromeHistory('tab', []);
    expect(hits.every((h) => h.id.startsWith('chrome-history-'))).toBe(true);
  });

  // THE DEDUPE: the tracked record carries the group, the notes and the open-tab
  // state a raw history entry has none of, so the tracked one wins outright
  it('drops entries for urls TabCommand already tracks', async () => {
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const hits = await searchChromeHistory('tab', [
      'url-https://developer.chrome.com/docs/extensions/reference/tabs/',
    ]);
    expect(hits.map((h) => h.url)).toEqual([
      'https://superuser.com/questions/1042/how-to-stop-hoarding-tabs',
    ]);
  });

  // an entry with no title still has to be identifiable in the list
  it('falls back to the url when an entry has no title', async () => {
    seed('chromeHistory', [{ url: 'https://example.com/a', lastVisitTime: 1 }]);
    installChromeShim();

    const hits = await searchChromeHistory('example', []);
    expect(hits[0].urlTitle).toBe('https://example.com/a');
  });

  // an empty query must not pull the user's entire browsing history
  it('resolves empty for an empty query', async () => {
    seed('chromeHistory', HISTORY);
    installChromeShim();

    expect(await searchChromeHistory('', [])).toEqual([]);
    expect(await searchChromeHistory(undefined, [])).toEqual([]);
  });

  // without the optional permission — or outside a packaged extension — the API
  // is simply absent, and the section must vanish rather than the page crash
  it('resolves empty when chrome.history is unavailable', async () => {
    installChromeShim();
    delete chrome.history;
    expect(await searchChromeHistory('tab', [])).toEqual([]);
  });

  // unit tests and SSR-ish contexts have no chrome global whatsoever
  it('resolves empty when there is no chrome at all', async () => {
    expect(await searchChromeHistory('tab', [])).toEqual([]);
  });

  // a malformed entry must not take the whole section down with it
  it('skips entries with no url', async () => {
    seed('chromeHistory', [{ title: 'tab thing' }, { url: 'https://ok.com/tab', title: 'ok' }]);
    installChromeShim();

    const hits = await searchChromeHistory('tab', []);
    expect(hits.map((h) => h.url)).toEqual(['https://ok.com/tab']);
  });
});
