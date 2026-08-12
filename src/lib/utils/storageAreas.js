// The key -> storage-area routing table, and the one place that answers "which
// `chrome.storage` area holds this key?".
//
// It exists because `labels` — the user's groups, the irreplaceable record —
// moved from `chrome.storage.local` to `chrome.storage.sync`. Chrome destroys a
// local area whenever it uninstalls an extension, including the implicit
// uninstall that happens when an unpacked extension's directory goes missing;
// the sync area is backed by the user's Google account and is restored on
// reinstall.
//
// Routing lives in a table rather than at call sites so the ~20 modules that go
// through `Chrome` and the worker's `update` / `getStorage` need no edits: they
// keep passing whatever keys they always passed, and the fan-out happens once,
// underneath them. That also means a MIXED batch — `Chrome.get(['labels',
// 'previousLabels'])`, or an import writing `url-*` records and `labels`
// together — keeps working; the partition helpers below split it and the
// callers re-merge.
//
// `previousLabels` deliberately stays local: it is up to ten full snapshots of
// `labels`, and `chrome.storage.sync` caps a single item at 8,192 bytes and the
// whole area at 102,400. A ten-deep snapshot stack would breach the per-item cap
// on any non-trivial group set and could alone consume the entire area. It is a
// local undo convenience, not the irreplaceable record.

export const LOCAL = 'local';
export const SYNC = 'sync';

// Every statically-known key and the area that owns it. Declaration order is
// also `KNOWN_KEYS` order, which the chromeShim contract test pins.
export const STORAGE_AREAS = {
  labels: SYNC,
  uxSettings: LOCAL,
  autoClosed: LOCAL,
  activeTabs: LOCAL,
  allUrls: LOCAL,
  previousLabels: LOCAL,
  theme: LOCAL,
  settings: LOCAL,
  // Records the outcome of the most recent sync write of `labels` so the
  // Import / Export page can warn when groups are NOT reaching sync. Local by
  // definition: a diagnostic about sync cannot itself depend on sync working.
  syncStatus: LOCAL,
};

// The storage keys. Shared so the Chrome abstraction's default lists and the
// shim's hydration never drift. Derived from the routing table so a key can
// never be routed without being known, or known without being routed.
export const KNOWN_KEYS = Object.keys(STORAGE_AREAS);

// Unknown keys — notably the dynamic `url-<url>` records, which are unbounded in
// number and far exceed sync's 102,400-byte area cap — default to local.
export function areaForKey(key) {
  return STORAGE_AREAS[key] || LOCAL;
}

// Whether a `chrome.storage.onChanged` event carries a change for `key`.
//
// Every listener needs this because the areas fire SEPARATELY: one event now
// carries only one area's keys, so the old `if (areaName !== 'local') return`
// preamble silently drops every `labels` change the moment labels moved to sync.
// Gating each key against ITS OWN area is the fix, and putting it here means a
// future routing change updates every listener at once.
export function changedInArea(changes, areaName, key) {
  if (areaName !== areaForKey(key)) return null;
  return (changes && changes[key]) || null;
}

// Split a `chrome.storage` *read* query into one query per area, preserving the
// caller's argument form so each area receives what it would have received
// unpartitioned:
//   null/undefined -> { local: null, sync: null }   (read everything, both areas)
//   'labels'       -> { sync: ['labels'] }
//   ['a', 'b']     -> { local: [...], sync: [...] } (non-empty areas only)
//   { a: 1, b: 2 } -> { local: {...}, sync: {...} } (the defaults-map form)
export function partitionKeysByArea(keys) {
  if (keys == null) return { [LOCAL]: null, [SYNC]: null };

  if (typeof keys === 'string') {
    return { [areaForKey(keys)]: [keys] };
  }

  if (Array.isArray(keys)) {
    const byArea = {};
    for (const key of keys) {
      const area = areaForKey(key);
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(key);
    }
    return byArea;
  }

  // Object form: `chrome.storage.get({ key: defaultValue })`.
  const byArea = {};
  for (const [key, value] of Object.entries(keys)) {
    const area = areaForKey(key);
    if (!byArea[area]) byArea[area] = {};
    byArea[area][key] = value;
  }
  return byArea;
}

// Split a `chrome.storage` *write* map into one map per area. Only non-empty
// areas appear, so a caller writing exclusively local keys issues exactly one
// `set` — the same single round-trip it issued before routing existed.
export function partitionUpdatesByArea(updates) {
  const byArea = {};
  for (const [key, value] of Object.entries(updates || {})) {
    const area = areaForKey(key);
    if (!byArea[area]) byArea[area] = {};
    byArea[area][key] = value;
  }
  return byArea;
}

export default STORAGE_AREAS;
