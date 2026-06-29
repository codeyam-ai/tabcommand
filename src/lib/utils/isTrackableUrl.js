// The single source of truth for "is this a real website?" — i.e. a page worth
// recording into history/Favorites. A URL is trackable only when it parses and
// its protocol is exactly `http:` or `https:`. This deliberately excludes every
// non-web scheme with one rule instead of an ever-growing blocklist: `about:*`
// (including `about:blank`), `file://`, `data:`, `view-source:`, `chrome://`,
// `chrome-extension://`, `devtools://`, `blob:`, etc.
//
// Both the service worker (gating what enters `allUrls` via `newUrl`) and the
// renderer (`rankFavorites`, defensively dropping already-stored junk) import
// this so the rule lives in exactly one place and is unit-testable. It
// complements `validTab` in service_worker.js (tab-shaped, worker-only) rather
// than replacing it: this predicate is URL-shaped and stack-agnostic.
//
// Defensive, storage/DOM-free style mirroring normalizeUrl.js: anything that
// isn't a non-empty parseable URL string returns false rather than throwing.
export function isTrackableUrl(url) {
  if (typeof url !== 'string') return false;
  const raw = url.trim();
  if (raw.length === 0) return false;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export default isTrackableUrl;
