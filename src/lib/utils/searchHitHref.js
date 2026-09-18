// The URL a Full Search hit points at, and the predicate that tells the two hit
// kinds apart.
//
// A tracked record's storage key IS its url (`url-<url>`, the form `allUrls`
// holds), and the stored record does not always repeat it in a `url` field — so
// the key is the fallback rather than the other way round. Getting this backwards
// renders every row hostless and hands `chrome.tabs.create` an undefined url.
//
// Chrome-history hits carry a real `url` and a namespaced `chrome-history-<url>`
// id, so they resolve on the first branch. The namespace also keeps their ids
// from ever colliding with a tracked `url-<url>` id.
const TRACKED_PREFIX = 'url-';
const CHROME_HISTORY_PREFIX = 'chrome-history-';

const searchHitHref = (hit) => {
  if (hit && hit.url) return hit.url;
  const id = String((hit && hit.id) || '');
  return id.startsWith(TRACKED_PREFIX) ? id.slice(TRACKED_PREFIX.length) : '';
};

// A Chrome-history hit is not a tracked record: there is no `url-*` entry behind
// it, so the URL detail page has nothing to open and its edit affordance is
// withheld.
export const isChromeHistoryHit = (id) =>
  String(id || '').startsWith(CHROME_HISTORY_PREFIX);

export default searchHitHref;
