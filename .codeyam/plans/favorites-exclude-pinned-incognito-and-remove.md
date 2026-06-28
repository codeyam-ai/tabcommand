---
title: "Favorites: Exclude Pinned & Incognito URLs, Add Remove"
mode: ui
createdAt: "2026-06-28T11:21:29Z"
source: manual
---

## Summary

Three refinements to the sidebar **Favorites** section so it only surfaces sites
the user actually wants there. (1) A site currently open in a **Chrome-pinned
tab** is excluded from Favorites — pinned tabs are already always-available, so
they shouldn't take a Favorites slot. (2) URLs visited in **incognito mode** are
never recorded into browsing history at all, so they can never appear in
Favorites (or anywhere else). (3) The user can **remove** a site from Favorites:
hovering a row reveals an **×** on the right; clicking it hides that URL from
Favorites permanently (without deleting it from search/history). All three are
driven through the existing pure `rankFavorites` ranking and the component's live
`chrome.storage.onChanged` reload, so the section updates instantly.

## Key Decisions

- **Exclude pinned via `activeTabs`, not a record flag** — "pinned" is the native
  Chrome tab state (`tab.pinned`), already mirrored onto `activeTabs[].pinned`
  with a matching `urlKey` by `updateActiveTabs` in the service worker. Favorites
  computes the set of pinned `urlKey`s from `activeTabs` at load time and passes
  them as exclusions. This keeps exclusion live (re-pinning/unpinning a tab
  re-ranks) and needs no new persisted state. (Confirmed with the user this means
  Chrome-pinned tabs, not the app's `tabCommandPinned` thumbtack.)
- **Incognito = never record, rather than record-and-filter** — the privacy-correct
  behavior is to leave no trace of incognito browsing, so we stop incognito
  visits from entering `allUrls` / `url-*` at the source in the service worker
  instead of storing them with a flag and filtering later. Note this affects
  *future* visits only; pre-existing records carry no incognito marker and are
  indistinguishable, which is acceptable.
- **Remove = hide, not delete** — a separate `favoritesHidden` storage key (array
  of `urlKey`s) records user-removed favorites. The URL stays in `allUrls` /
  `url-*` so it still appears in Search and History; it's only suppressed from
  the Favorites section. A dedicated key avoids mutating the visit-tracking
  `url-*` records and is trivial to unit-test.
- **One unified exclusion path in `rankFavorites`** — both pinned `urlKey`s and
  hidden `urlKey`s are merged into a single `excludedKeys` set passed to the pure
  ranking function, which skips any candidate in the set. Keeps all
  exclusion/scoring logic pure and unit-tested in one place.

## Implementation

### 1. Add an `excludedKeys` parameter to the ranking

**File**: `src/lib/utils/rankFavorites.js`

Extend the signature to `rankFavorites(allUrls, urlRecords, limit = 5, excludedKeys)`
where `excludedKeys` is a `Set` of `urlKey`s (default to an empty set when
omitted, so existing callers/tests are unaffected). In the candidate-collection
loop, skip any `urlKey` present in `excludedKeys` (alongside the existing
`usableTitle` check). All downstream scoring/sorting is unchanged. Update the
header doc comment to mention the new exclusion input.

### 2. Exclude pinned tabs and hidden URLs in the Favorites component

**File**: `src/lib/components/Favorites/Favorites.jsx`

In the `load` routine, additionally read `activeTabs` and `favoritesHidden` from
storage (extend the existing `Chrome.get` calls — e.g. read
`['allUrls', 'activeTabs', 'favoritesHidden']` up front, then the `url-*` records
as today). Build a single `excludedKeys` Set as the union of:

- `urlKey`s of `activeTabs` entries with `pinned === true`, and
- every `urlKey` in `favoritesHidden` (default `[]`).

Pass that set as the new 4th argument to `rankFavorites`.

Extend the `handleChange` listener so a change to `activeTabs` **or**
`favoritesHidden` also triggers `load()` (today it only reloads on `allUrls` /
`url-*`), so pinning a tab or removing a favorite re-ranks immediately.

### 3. Add the hover-to-remove "×" control

**File**: `src/lib/components/Favorites/Favorites.jsx`

Render a remove button inside each `.Favorites-item`, after the title, using the
existing `Icon` component with `name="close"` (the line-style × already defined
in `src/lib/components/Icon/Icon.jsx`). Wrap it so it's reachable by keyboard and
labeled (e.g. `aria-label="Remove from favorites"` / `title="Remove from favorites"`).

Add a `removeFavorite(e, favorite)` handler that calls `e.stopPropagation()` (so
the row's `onClick` open-behavior doesn't fire), reads `favoritesHidden`, appends
`favorite.urlKey` if not already present, and writes it back via `chrome.storage.local.set`.
The existing `onChanged` reload (extended in step 2) will drop the row.

**File**: `src/lib/components/Favorites/Favorites.css`

Add styling for the remove button: hidden by default (`opacity: 0`) and revealed
on `.Favorites-item:hover` (`opacity: 1`), pushed to the right (the title already
has `min-width: 0; overflow: hidden`, so give the button `flex-shrink: 0` and
`margin-left: auto`). Use muted color with a hover emphasis consistent with the
sidebar idiom. Ensure the row keeps a stable height so the × appearing doesn't
shift layout.

### 4. Stop recording incognito visits in the service worker

**File**: `service_worker.js`

Two coordinated guards:

- In `validTab(tab)`, add `&& !tab.incognito` so incognito tabs are treated as
  invalid everywhere it's consulted (`tabUpdates` → no `url-*` process record;
  `updateActiveTabs` → filtered out of `activeTabs`).
- In the `chrome.tabs.onUpdated` listener, the `changeInfo.url` branch calls
  `newUrl(tabId, changeInfo.url)` directly (it does not pass through `validTab`).
  Guard that branch with `!tab.incognito` so an incognito navigation never gets
  added to `allUrls` and never bumps `visitCount`.

Add a brief comment noting incognito visits are intentionally not persisted.

### 5. Tests

**File**: `src/lib/utils/rankFavorites.test.js`

Add a case proving `excludedKeys` removes matching `urlKey`s from the result
(and that omitting the argument preserves current behavior).

**File**: `src/lib/components/Favorites/Favorites.test.jsx`

Add cases: (a) a URL open in a pinned `activeTabs` entry is absent from the
rendered list; (b) a `urlKey` present in seeded `favoritesHidden` is absent;
(c) clicking the hover × on a row writes that `urlKey` into `favoritesHidden`
and the row disappears, while a plain row click still opens/focuses the tab.

**File**: `service_worker.test.js`

Add a case proving an `onUpdated` navigation on an incognito tab does **not**
add the `urlKey` to `allUrls` or create/increment its `url-*` `visitCount`,
while a normal-tab navigation still does.

## Reused existing code

- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — extended with the `excludedKeys` filter; all scoring reused.
- `Favorites` component from `src/lib/components/Favorites/Favorites.jsx`
  (glossary entry: `Favorites`) — its `Chrome.get` load + `chrome.storage.onChanged`
  live-reload pattern is extended, not replaced.
- `Icon` from `src/lib/components/Icon/Icon.jsx` — reuse the existing `close` (×)
  glyph for the remove control.
- `Favicon` from `src/lib/components/Favicon` — unchanged, still rendered per row.
- `activeTabs` records (with `urlKey` + `pinned`) produced by `updateActiveTabs`
  in `service_worker.js` — reused as the source of which URLs are pinned.
- `validTab` / `newUrl` in `service_worker.js` — the recording chokepoints where
  the incognito guards are added.
- `installChromeShim` from `src/lib/utils/chromeShim` — reused storage shim for
  the component/service-worker tests.

## Scenarios to Demonstrate

- **Populated, nothing excluded** — several ranked favorites render as today
  (happy path with realistic titles/favicons).
- **A favorite is open in a Chrome-pinned tab** — that site is omitted from the
  list; the remaining favorites fill the slots.
- **Hover reveals the ×** — hovering a row shows the remove control on the right;
  it's hidden otherwise.
- **Remove a favorite** — clicking × hides that site (it's gone from Favorites on
  reload) while it remains available in Search/History.
- **Incognito visit** — a URL visited only in incognito never appears in
  Favorites (and is not recorded at all).
- **Empty / all-excluded state** — when no qualifying favorites remain (none, or
  all pinned/hidden), the section renders nothing, keeping the sidebar clean.
