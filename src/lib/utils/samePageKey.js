// Produces a stable "page identity" for a URL — its origin + pathname — used to
// tell an in-page URL rewrite apart from a real navigation. Single-page apps
// carry state in the query string or fragment and mutate their own URL via the
// History API as you click around (most visibly Google Docs, which rewrites
// `?tab=t.…` as you move between tabs in a document). Such a change is NOT a
// navigation, so a grouped tab must stay in its group through it.
//
// The grouping eject path in service_worker.js compares `samePageKey(oldUrl)`
// to `samePageKey(newUrl)`: equal means only the query/hash moved (in-page,
// keep grouped), different means a genuine navigation to another origin/path
// (eject, as before). This is a general structural rule rather than a per-host
// table, so it can't rot when a site changes how it builds its URLs.
//
// What IS dropped (so these compare equal):
//   - the query string (`?tab=t.A` vs `?tab=t.B`, any `?…` change).
//   - the `#fragment` (SPA anchor navigation).
//
// What is KEPT (so these stay distinct — genuine navigations):
//   - the origin (scheme + host + port) — a different domain ejects.
//   - the pathname — `/a` vs `/b` ejects.
//
// Defensive, storage/DOM-free style mirroring normalizeUrl.js / isTrackableUrl.js:
// a non-string or unparseable value (e.g. `chrome://newtab`, `about:blank`, '')
// falls back to the raw input unchanged, so two such values compare equal only
// when literally identical — preserving today's eject behavior for those cases.
export function samePageKey(url) {
  if (typeof url !== 'string') return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  return parsed.origin + parsed.pathname;
}

export default samePageKey;
