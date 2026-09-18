import htmlToText from './htmlToText';
import matchPageText from './matchPageText';
import devPageText from './devPageText';
import isThinPageText from './isThinPageText';

// The three ways a page's text can reach the scan, in the order they are tried.
// The tier travels with every result and is rendered as a badge, because it is
// the honest answer to "why did this page not match?" — a FETCHED miss on a
// client-rendered app means the text was never there to search, which is a very
// different statement from LIVE finding nothing.
export const TIER_LIVE = 'live';
export const TIER_FETCHED = 'fetched';
export const TIER_DEEP = 'deep';

// Hard ceiling on pages per scan, and per-page time budget. Both exist so a scan
// cannot become an unbounded crawl of the user's browsing: the scope already
// caps what is offered, and these cap what any scope can cost.
export const MAX_PAGES = 100;
export const PAGE_TIMEOUT = 8000;
export const CONCURRENCY = 4;

const aborted = (signal) => !!(signal && signal.aborted);

// `document.body.innerText` evaluated inside the target page. Defined at module
// scope rather than inline so it is obvious that this — and nothing else — is
// the code injected into a user's pages.
function readVisibleText() {
  return document.body ? document.body.innerText : '';
}

// Read an open tab as the user currently sees it. This is the only tier that
// sees JavaScript-rendered content, and it loads nothing: the page is already
// there.
const readFromTab = (tabId) => new Promise((resolve) => {
  if (typeof chrome === 'undefined' || !chrome.scripting || !chrome.scripting.executeScript) {
    resolve('');
    return;
  }
  try {
    chrome.scripting.executeScript(
      { target: { tabId }, func: readVisibleText },
      (frames) => {
        // A tab that has since closed, or a page the extension may not script
        // (the Chrome Web Store, a chrome:// page), surfaces as lastError. It is
        // an expected outcome for one page in a scan of a hundred, not a fault.
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve('');
          return;
        }
        const first = (frames || [])[0];
        resolve((first && first.result) || '');
      }
    );
  } catch {
    resolve('');
  }
});

// Read a closed URL by fetching it from the extension page and parsing the
// response. Cheap — no tab, no render — but it sees only what the server sent.
const readFromFetch = async (url, signal) => {
  // On the dev server the network is not reachable from this origin at all; the
  // seeded corpus stands in for it. Null means this is the real extension.
  const seeded = devPageText(url);
  if (seeded !== null) return seeded;

  const timer = new AbortController();
  const stop = setTimeout(() => timer.abort(), PAGE_TIMEOUT);

  // The caller's cancel and this page's timeout both have to reach one fetch.
  const onAbort = () => timer.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, { signal: timer.signal, credentials: 'omit', redirect: 'follow' });
    if (!response.ok) return '';

    // A PDF or an image would otherwise be parsed as HTML and yield binary noise
    // that can match a query by accident.
    const type = response.headers.get('content-type') || '';
    if (type && !/text\/html|application\/xhtml|text\/plain/.test(type)) return '';

    const body = await response.text();
    return /text\/plain/.test(type) ? body.replace(/\s+/g, ' ').trim() : htmlToText(body);
  } catch {
    // A cross-origin refusal, an offline machine, a timeout: all end the same
    // way for one page, and none of them should end the scan.
    return '';
  } finally {
    clearTimeout(stop);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
};

// Last resort for a closed URL whose fetched text came back empty: open it in a
// background tab so its own JavaScript runs, read it, and close the tab again.
//
// This is the one tier that actually loads a page, which is why it is behind an
// off-by-default checkbox. The tab is created inactive and is closed in a
// `finally` so a thrown read cannot strand it.
const readFromDeepTab = async (url, signal) => {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.create) return '';

  const tab = await new Promise((resolve) => {
    try {
      chrome.tabs.create({ url, active: false }, resolve);
    } catch {
      resolve(null);
    }
  });

  const tabId = tab && tab.id;
  if (!tabId) return '';

  try {
    if (aborted(signal)) return '';
    // No load event is available to await from here, so the page gets a fixed
    // slice of its budget to render before it is read.
    await new Promise((resolve) => setTimeout(resolve, Math.min(PAGE_TIMEOUT, 3000)));
    if (aborted(signal)) return '';
    return await readFromTab(tabId);
  } finally {
    try {
      chrome.tabs.remove(tabId);
    } catch {
      // A tab the user closed themselves mid-scan is already gone.
    }
  }
};

// Read one target's text, choosing the tier by what the target is and what the
// earlier tier produced. Returns `{ text, tier }`.
export const readTargetText = async (target, { deep, signal } = {}) => {
  if (target.tabId != null) {
    return { text: await readFromTab(target.tabId), tier: TIER_LIVE };
  }

  const fetched = await readFromFetch(target.url, signal);
  if (!isThinPageText(fetched) || !deep || aborted(signal)) {
    return { text: fetched, tier: TIER_FETCHED };
  }

  const deepText = await readFromDeepTab(target.url, signal);
  // Falling back to the fetched text when the deep read also came up empty keeps
  // the better of the two rather than discarding a thin-but-real result.
  return deepText
    ? { text: deepText, tier: TIER_DEEP }
    : { text: fetched, tier: TIER_FETCHED };
};

// Scan a list of pages for a query, streaming each hit out as it lands.
//
// Results are streamed rather than returned in a batch because the slowest page
// in a scan of sixty sets how long a batched version would show nothing at all.
// A user who searched for a phrase they read this morning gets the first hit in
// under a second and can stop there; `onProgress` is what makes the wait legible
// while the rest finish.
//
// Concurrency is a fixed small pool rather than `Promise.all` over the whole
// list: a hundred simultaneous fetches is a burst the browser will queue anyway
// and the remote hosts will read as abuse.
//
// Nothing here persists and nothing leaves the device — the text is read,
// matched, and dropped, and only the snippet survives into a result.
const pageContentScan = async ({
  targets = [],
  query,
  concurrency = CONCURRENCY,
  deep = false,
  limit = MAX_PAGES,
  signal,
  onResult,
  onProgress,
} = {}) => {
  const queue = targets.slice(0, limit);
  const total = queue.length;
  const results = [];
  let scanned = 0;
  let next = 0;

  if (!query || !total) {
    if (onProgress) onProgress({ scanned: 0, total: 0 });
    return results;
  }

  if (onProgress) onProgress({ scanned: 0, total });

  const worker = async () => {
    while (!aborted(signal)) {
      const i = next;
      next += 1;
      if (i >= total) return;

      const target = queue[i];
      const { text, tier } = await readTargetText(target, { deep, signal });
      if (aborted(signal)) return;

      const snippet = matchPageText(text, query);
      if (snippet) {
        const result = { ...target, tier, snippet };
        results.push(result);
        if (onResult) onResult(result);
      }

      scanned += 1;
      if (onProgress) onProgress({ scanned, total });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, worker)
  );

  return results;
};

export default pageContentScan;
