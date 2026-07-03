---
title: "Favorites Page-Identity Open Detection"
mode: ui
createdAt: "2026-07-03T14:13:44Z"
source: manual
---

## Summary

The Favorites section flags a site as open (the accent `--open` cue) via an
**exact** `urlKey` match against the live tabs — `openKeys.has(urlKey)` in
`rankFavorites`. For a single-page app that rewrites its own `?query` via the
History API (most visibly a Google Doc churning `?tab=t.…` as you move between
tabs inside the doc), the favorite is pinned to a *historical* query variant
while the live tab has drifted to a new one, so the exact match fails and the
favorite does **not** show as open — even though the very same doc IS shown as
open under its tab group. The group view reaches this consistently because it
reads the live tab directly (`Tabs.jsx` iterates `activeTabs`) and the group's
label `urlKeys` are healed to follow the live URL, so `Url`'s exact match always
succeeds. Fix: make Favorites open-detection **page-identity aware** — compare
origin + pathname via `samePageKey` (the exact rule the grouping eject path
already uses to tell an in-page rewrite from a real navigation), so a favorite
lights up whenever any live non-pinned tab is on the same page, regardless of
query drift. The ranking / de-duplication key (`normalizeUrl`, which
deliberately preserves the query) is left untouched.

## Key Decisions

- **Reuse `samePageKey`, not a new rule.** The grouping side already draws the
  in-page-rewrite vs. navigation line with `samePageKey` (origin + pathname,
  query and fragment dropped). Reusing it is exactly what "match the group's
  open detection" means and guarantees the two views can't drift apart.
- **Localize the change to `rankFavorites.js`.** Both callers
  (`Favorites.jsx`, `ViewAllFavorites.jsx`) already build `openKeys` as a Set of
  live `activeTabs` urlKeys and pass it straight through. Rather than change the
  option's shape at every call site, `rankFavorites` derives page keys from the
  `openKeys` it receives (`samePageKey(k.replace(/^url-/, ''))`) and matches each
  candidate's page identity against that set. Callers stay byte-for-byte
  unchanged; the `openKeys` contract ("live non-pinned tab keys") is unchanged.
- **`isOpen` only — nothing else changes semantics.** `isOpen` also drives the
  open-tab discount (dropping the in-progress most-recent visit); making `isOpen`
  page-identity aware carries that discount along consistently, which is correct
  (the page IS open). The `normalizeUrl` grouping/de-dupe key and the
  score/order stay exactly as they are — query-distinct pages remain distinct
  rows and distinct ranking entries.
- **Out of scope (noted, not changed): pinned-tab exclusion.** `excludedKeys`
  (pinned tabs) also matches by exact `urlKey` and has the same theoretical
  drift, but excluding a favorite is a different behavior from the open cue and
  is not what "open detection" refers to. Left exact to keep this change tightly
  scoped; call out if we later want the same treatment there.

## Implementation

### 1. Match open status by page identity in `rankFavorites`

**File**: `src/lib/utils/rankFavorites.js`

- Import the existing helper: `import samePageKey from './samePageKey';` (a pure
  `src/lib/utils` ES module — no service-worker/Chrome dependency, safe to import
  into this pure util).
- Where `openKeys` is currently read (`const openKeys = options.openKeys || new
  Set();`), additionally derive a set of open *page* keys once, up front:
  `const openPageKeys = new Set([...openKeys].map((k) => samePageKey(k.replace(/^url-/, ''))));`
  This strips the `url-` storage prefix to recover the raw URL, then reduces it
  to origin + pathname — mirroring how the grouping eject path derives
  `samePageKey(oldUrl)` from a stored `url-`-prefixed key in `service_worker.js`.
- Change the per-candidate open test from exact
  `const isOpen = openKeys.has(urlKey);` to page-identity:
  `const isOpen = openPageKeys.has(samePageKey(candidateUrl));`
  `candidateUrl` is already computed just above for the trackable-URL guard
  (`record.url || urlKey.replace(/^url-/, '')`) — reuse it so the favorite's page
  identity is derived from its real URL, matching how the live tab's is derived.
- Leave the open-tab discount (`if (isOpen && visits.length > 0) visits =
  visits.slice(0, -1);`), the `normalizeUrl` grouping, and the
  `existing.isOpen = existing.isOpen || candidate.isOpen` merge unchanged — they
  now simply operate on the page-identity `isOpen`.

No changes are needed in `Favorites.jsx` or `ViewAllFavorites.jsx`: they already
construct `openKeys` from the live non-pinned `activeTabs` and pass it in as
`options.openKeys`.

## Reused existing code

- `samePageKey` from `src/lib/utils/samePageKey.js` (glossary entry:
  `samePageKey`) — the origin+pathname reducer the tab-grouping eject path uses
  to distinguish an in-page rewrite from a navigation; reused verbatim so
  Favorites and the group view apply the identical rule.
- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — the pure ranking function being amended; the `openKeys`
  option and the open-tab discount are preserved, only the match becomes
  page-identity based.
- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` (glossary entry:
  `normalizeUrl`) — the ranking/de-dupe key; explicitly left as-is (query
  preserved) so query-distinct pages remain distinct rows.

## Reproduction Test

Pins that a favorite whose stored key differs from an open tab only by its
`?query` (a Google-Doc-style in-page rewrite) is flagged `isOpen`.

**Target**: `src/lib/utils/rankFavorites.test.js` — run with
`codeyam-editor editor refresh-tests --test rankFavorites`.

```js
// A favorite that differs from an open tab only by its ?query (a Google-Doc
// ?tab= in-page rewrite) is still flagged open — page identity (origin+path),
// not the exact urlKey, decides the open cue, matching the tab-group view.
it('flags a favorite open when a live tab is on the same page but a different query', () => {
  const docBase = 'https://docs.google.com/document/d/ABC/edit';
  const allUrls = [`url-${docBase}?tab=t.old`];
  const records = {
    [`url-${docBase}?tab=t.old`]: rec('Ambiguity Everywhere', [0, 1, 2], {
      url: `${docBase}?tab=t.old`,
    }),
  };
  const result = rankFavorites(allUrls, records, 5, undefined, opts({
    // The live tab has drifted to a NEW ?tab= value.
    openKeys: new Set([`url-${docBase}?tab=t.new`]),
  }));
  expect(result[0].isOpen).toBe(true);
});
```

Status: PROPOSED — confirm red at execution. Expected failure: today
`isOpen = openKeys.has('url-...?tab=t.old')` is `false` because the live key is
`...?tab=t.new`, so `expect(result[0].isOpen).toBe(true)` fails (received
`false`). (`rec`'s third `over` arg sets an explicit `url`; `opts()` is the
existing deterministic-`now` options helper used throughout this file.)

## Scenarios to Demonstrate

- **Google Doc drift (the bug):** a favorited Google Doc open in a non-pinned
  tab whose live `?tab=` differs from the favorite's stored key — favorite shows
  the `--open` cue, consistent with the doc appearing open under its group.
- **Exact match still open:** a favorite whose key matches the live tab exactly
  (no query) — still flagged open (no regression).
- **Same origin, different path:** a favorite for `/a` while a tab is open on
  `/b` of the same site — NOT flagged open (page identity keeps distinct paths
  distinct).
- **Not open at all:** a favorited site with no live tab — no `--open` cue.
- **Query-distinct pages stay distinct rows:** two favorites differing only by
  `?id=1` vs `?id=2` remain two separate ranked rows (`normalizeUrl` unchanged);
  only their open cue follows page identity.
- **View All Favorites parity:** the same page-identity open cue appears on the
  View All page, which shares `rankFavorites`.
