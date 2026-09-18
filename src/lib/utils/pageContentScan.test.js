import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pageContentScan, {
  readTargetText,
  TIER_LIVE,
  TIER_FETCHED,
  TIER_DEEP,
  MAX_PAGES,
} from './pageContentScan';

// A target with a tabId is open; one without is closed and must be fetched.
const open = (n, tabId) => ({ urlKey: `url-https://o${n}.com`, url: `https://o${n}.com`, tabId });
const closed = (n) => ({ urlKey: `url-https://c${n}.com`, url: `https://c${n}.com` });

// Stand in for chrome.scripting / chrome.tabs. The shim's dev seam
// (`__shim` + `__pageTexts`) is deliberately absent so the fetch path runs for
// real against the mocked global fetch.
const installChrome = ({ tabText = {}, deepText = null } = {}) => {
  globalThis.chrome = {
    runtime: { lastError: undefined },
    scripting: {
      executeScript: ({ target }, cb) => {
        const text = target.tabId >= 9000 ? deepText : tabText[target.tabId];
        cb([{ result: text || '' }]);
      },
    },
    tabs: {
      create: (_opts, cb) => cb({ id: 9001 }),
      remove: vi.fn(),
    },
  };
};

const htmlBody = (text) => `<html><body><p>${text}</p></body></html>`;

const mockFetch = (byUrl) => vi.fn((url) => {
  const body = byUrl[url];
  if (body === undefined) return Promise.reject(new Error('refused'));
  return Promise.resolve({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve(htmlBody(body)),
  });
});

describe('pageContentScan', () => {
  beforeEach(() => {
    installChrome();
    globalThis.fetch = mockFetch({});
  });

  afterEach(() => {
    delete globalThis.chrome;
    vi.restoreAllMocks();
  });

  // an open tab is read as the user sees it now, and loads nothing
  it('reads an open tab through the live tier', async () => {
    installChrome({ tabText: { 301: 'the quota is generous' } });
    const result = await readTargetText(open(1, 301), {});
    expect(result).toEqual({ text: 'the quota is generous', tier: TIER_LIVE });
  });

  // a closed URL is fetched and parsed, never opened
  it('reads a closed URL through the fetched tier', async () => {
    globalThis.fetch = mockFetch({ 'https://c1.com': 'a per-origin quota applies' });
    const result = await readTargetText(closed(1), {});
    expect(result.tier).toBe(TIER_FETCHED);
    expect(result.text).toBe('a per-origin quota applies');
  });

  // a cross-origin refusal, an offline machine or a timeout ends one page, not
  // the scan
  it('returns empty text rather than throwing when a fetch is refused', async () => {
    globalThis.fetch = mockFetch({});
    const result = await readTargetText(closed(9), {});
    expect(result).toEqual({ text: '', tier: TIER_FETCHED });
  });

  // a PDF or an image parsed as HTML would yield binary noise that can match a
  // query by accident
  it('ignores a response that is not html or plain text', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      headers: { get: () => 'application/pdf' },
      text: () => Promise.resolve('%PDF quota'),
    }));
    expect((await readTargetText(closed(1), {})).text).toBe('');
  });

  // the deep tier is opt-in, so a thin fetch stays thin unless it is asked for
  it('does not open a background tab when deep scan is off', async () => {
    globalThis.fetch = mockFetch({ 'https://c1.com': 'tiny' });
    const result = await readTargetText(closed(1), { deep: false });
    expect(result.tier).toBe(TIER_FETCHED);
    expect(globalThis.chrome.tabs.remove).not.toHaveBeenCalled();
  });

  // the empty-shell case the deep tier exists for
  it('falls back to a background tab when deep scan is on and the fetch was thin', async () => {
    installChrome({ deepText: 'the rendered page mentions quota' });
    globalThis.fetch = mockFetch({ 'https://c1.com': 'tiny' });
    const result = await readTargetText(closed(1), { deep: true });
    expect(result.tier).toBe(TIER_DEEP);
    expect(result.text).toBe('the rendered page mentions quota');
  });

  // the tab is closed in a `finally`, so a thrown read cannot strand it
  it('closes the background tab it opened', async () => {
    installChrome({ deepText: 'rendered' });
    globalThis.fetch = mockFetch({ 'https://c1.com': '' });
    await readTargetText(closed(1), { deep: true });
    expect(globalThis.chrome.tabs.remove).toHaveBeenCalledWith(9001);
  });

  // keeping the thin-but-real text beats discarding it for nothing
  it('keeps the fetched text when the deep read also came up empty', async () => {
    installChrome({ deepText: '' });
    globalThis.fetch = mockFetch({ 'https://c1.com': 'tiny' });
    const result = await readTargetText(closed(1), { deep: true });
    expect(result).toEqual({ text: 'tiny', tier: TIER_FETCHED });
  });

  // only pages that actually contain the query become results
  it('returns only the targets whose text matched', async () => {
    installChrome({ tabText: { 301: 'about quota limits', 302: 'nothing relevant' } });
    const results = await pageContentScan({
      targets: [open(1, 301), open(2, 302)],
      query: 'quota',
    });
    expect(results).toHaveLength(1);
    expect(results[0].urlKey).toBe('url-https://o1.com');
    expect(results[0].tier).toBe(TIER_LIVE);
    expect(results[0].snippet.match).toBe('quota');
  });

  // the slowest page in a scan of sixty must not set how long the page shows
  // nothing, so hits are streamed as they land
  it('streams each hit through onResult as it lands', async () => {
    installChrome({ tabText: { 301: 'quota one', 302: 'quota two' } });
    const seen = [];
    await pageContentScan({
      targets: [open(1, 301), open(2, 302)],
      query: 'quota',
      onResult: (r) => seen.push(r.urlKey),
    });
    expect(seen).toHaveLength(2);
  });

  // the count is what makes the wait legible, and what answers "did it really
  // look at everything" after a scan that found nothing
  it('reports progress over every target, matched or not', async () => {
    installChrome({ tabText: { 301: 'quota', 302: 'no', 303: 'no' } });
    const progress = [];
    await pageContentScan({
      targets: [open(1, 301), open(2, 302), open(3, 303)],
      query: 'quota',
      onProgress: (p) => progress.push(p),
    });
    expect(progress[0]).toEqual({ scanned: 0, total: 3 });
    expect(progress[progress.length - 1]).toEqual({ scanned: 3, total: 3 });
  });

  // a scan cannot become an unbounded crawl of the user's browsing
  it('caps the scan at the page limit', async () => {
    const targets = Array.from({ length: MAX_PAGES + 25 }, (_, i) => closed(i));
    globalThis.fetch = mockFetch({});
    let last = null;
    await pageContentScan({ targets, query: 'quota', onProgress: (p) => { last = p; } });
    expect(last.total).toBe(MAX_PAGES);
  });

  // an explicit limit narrows it further
  it('honours a caller-supplied limit', async () => {
    const targets = Array.from({ length: 10 }, (_, i) => closed(i));
    let last = null;
    await pageContentScan({ targets, query: 'quota', limit: 3, onProgress: (p) => { last = p; } });
    expect(last.total).toBe(3);
  });

  // Cancel has to actually stop the work, not just hide it
  it('stops scanning once the signal aborts', async () => {
    installChrome({ tabText: { 301: 'quota', 302: 'quota', 303: 'quota' } });
    const controller = new AbortController();
    const seen = [];
    const scan = pageContentScan({
      targets: [open(1, 301), open(2, 302), open(3, 303)],
      query: 'quota',
      concurrency: 1,
      signal: controller.signal,
      onResult: (r) => { seen.push(r); controller.abort(); },
    });
    await scan;
    expect(seen.length).toBeLessThan(3);
  });

  // an empty query or an empty scope is a no-op, not a crash
  it('returns nothing for an empty query or no targets', async () => {
    expect(await pageContentScan({ targets: [open(1, 301)], query: '' })).toEqual([]);
    expect(await pageContentScan({ targets: [], query: 'quota' })).toEqual([]);
    expect(await pageContentScan({})).toEqual([]);
  });

  // a tab that closed mid-scan surfaces as lastError — expected for one page in
  // a hundred, not a fault
  it('treats a scripting lastError as empty text', async () => {
    globalThis.chrome = {
      runtime: { lastError: { message: 'No tab with id' } },
      scripting: { executeScript: (_i, cb) => cb(undefined) },
      tabs: { create: (_o, cb) => cb(null), remove: vi.fn() },
    };
    expect((await readTargetText(open(1, 301), {})).text).toBe('');
  });
});
