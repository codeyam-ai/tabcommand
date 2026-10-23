// Shared "which title/favicon is better" rules for url-* records. Chrome reports
// the URL itself as `tab.title` in short windows (before the page sets its
// <title>, for discarded/lazily-restored tabs, around moves into a group), and
// several worker paths rebuild a url-* record from a stale storage snapshot. Both
// used to write a weaker title/favicon over a real one, flipping a group row to
// the raw URL + monogram. Every write path consults these helpers instead of
// repeating the logic inline.

function normalizeForTitle(value) {
  return String(value)
    .split('#')[0]
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

// True when `title` carries no information beyond the URL: missing, empty, or
// the URL itself modulo scheme, a leading `www.`, a trailing slash and the
// `#hash` (mirroring getUrlKey's hash-stripping).
export function isRawUrlTitle(title, url) {
  if (typeof title !== 'string' || title.trim().length === 0) return true;
  if (typeof url !== 'string' || url.length === 0) return false;
  return normalizeForTitle(title.trim()) === normalizeForTitle(url);
}

// Returns `incoming` with `title`/`favicon` taken from `stored` wherever
// `incoming`'s value is raw/empty and `stored`'s is real. Never mutates either.
export function mergeUrlDisplay(stored, incoming) {
  if (!incoming) return incoming;
  if (!stored) return incoming;
  const merged = { ...incoming };
  const url = incoming.url || stored.url;
  if (isRawUrlTitle(incoming.title, url) && !isRawUrlTitle(stored.title, url)) {
    merged.title = stored.title;
  }
  if (!incoming.favicon && stored.favicon) {
    merged.favicon = stored.favicon;
  }
  return merged;
}

// Fills `record`'s title/favicon in place from the live tab when the record lacks
// a real one. newUrl rebuilds url-* from a storage snapshot that can predate the
// title/favicon write; the live tab is the freshest source. Edited records and a
// missing tab are left untouched. Returns `record`.
export function fillDisplayFromLiveTab(record, liveTab) {
  if (!record || !liveTab || record.edited) return record;
  if (isRawUrlTitle(record.title, record.url) && !isRawUrlTitle(liveTab.title, record.url)) {
    record.title = liveTab.title;
  }
  if (!record.favicon && liveTab.favIconUrl) record.favicon = liveTab.favIconUrl;
  return record;
}

// Combines tabUpdates' fresh update object with newUrl's snapshot-based one.
// Every key spreads as before (`incoming` wins), except url-* records keep the
// better title/favicon of the two so a stale snapshot can't strip them.
export function mergeTrackingUpdates(base, incoming) {
  const merged = { ...base, ...incoming };
  for (const key in incoming || {}) {
    if (key.startsWith('url-') && base && base[key]) {
      merged[key] = mergeUrlDisplay(base[key], incoming[key]);
    }
  }
  return merged;
}

export default isRawUrlTitle;
