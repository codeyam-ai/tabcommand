---
title: "Sidebar Favorites, Search Hint & Load Meter Relocation"
mode: ui
createdAt: "2026-06-27T23:15:13Z"
source: manual
---

## Summary

Rework the left sidebar's vertical composition. (1) Move the BROWSER LOAD gauge
(`LoadMeter`) from its current spot directly under the search bar down to the
bottom of the sidebar, and hide it entirely when per-tab resource data is
unavailable (e.g. stable Chrome, where `loadDataSource !== 'processes'`).
(2) Add a subtle one-line hint directly below the search bar reading "Just start
typing at any time to search". (3) Below that hint, add a new **Favorites**
section that lists the user's most-visited sites, ranked by a blend of visit
frequency and recency with a lean toward recency.

## Key Decisions

- **Hide gate = `loadDataSource !== 'processes'`** — this is the exact same gate
  `Triage` already uses (`Triage.jsx:86`) and that `LoadMeterCaption` /
  `LoadPerTabNote` follow. On stable Chrome the source is `'system'` (whole-
  browser only) or `'none'`; in both cases there is no tab-by-tab breakdown, so
  per the request the gauge hides completely. We deliberately hide on `'system'`
  too even though a whole-browser number exists, because the user asked to hide
  whenever *tab-by-tab* info is unavailable. When hidden, the
  now-redundant `LoadMeterCaption` ("Whole-browser load" / "No load data") goes
  with it since it only rendered beneath the gauge.
- **Relocate, don't duplicate** — the gauge moves into the existing
  `App-sidebar-footer` region (above the counts / Import-Export link) rather than
  spawning a second instance. Its click-to-open-Load behavior
  (`App-gauge` → `changePage(Pages.LOAD)`) moves with it.
- **Favorites ranking blends frequency + recency, recency-weighted** (per user
  choice "a mix of history with a preference toward recency"). We add a
  `visitCount` to each `url-*` record going forward, then rank candidates from
  `allUrls` (which is already recency-ordered, newest at index 0) by a combined
  score where recency is the dominant term and visit count is a secondary boost.
  This avoids a cold-start empty list (recency carries it on day one) while still
  letting genuinely frequent sites rise. The scoring lives in a pure, unit-
  tested util so the component stays declarative.
- **Favorites reuses existing open-tab behavior** — clicking a favorite focuses
  an already-open tab or creates a new one, exactly like `SearchResults`
  (`SearchResults.jsx:30-43`), and renders the site via the existing `Favicon`
  component.
- **No new state library** — everything reads/writes `chrome.storage.local`
  through the existing `Chrome` helper and reacts via `chrome.storage.onChanged`,
  matching every other sidebar component.

## Implementation

### 1. Hide the LoadMeter when per-tab data is unavailable

**File**: `src/lib/components/LoadMeter/LoadMeter.jsx`

Read the `loadDataSource` storage key (add it to the existing `Chrome.get`
reads and the `onChanged` handler, mirroring how `LoadMeterCaption` reads it).
Track it in state and, when `loadDataSource !== 'processes'`, return `null`
before rendering the SVG gauge — so the whole gauge + legend + caption
disappears on stable Chrome / no-data. Keep all current rendering for the
`'processes'` case unchanged. Update the component's header comment to document
the new gate.

### 2. Move the gauge to the bottom of the sidebar

**File**: `src/lib/pages/App/App.jsx`

Remove the `App-gauge` block from its current position (currently lines
106-108, directly under `<Search />`). Re-insert it inside the
`App-sidebar-footer` block (currently lines 117-130), above the `App-sidebar-counts`
/ Import-Export link, keeping the `onClick={() => changePage(Pages.LOAD)}`
wrapper. Because `LoadMeter` now self-hides (step 1), the footer simply collapses
to counts + link when there's no per-tab data — no extra conditional needed in
`App.jsx`. The `Triage` card stays where it is (Home only).

**File**: `src/lib/pages/App/App.css`

Adjust spacing so the gauge reads well at the bottom of the footer (top
margin/border separating it from the counts/link, and confirm the existing
`padding-bottom`/footer layout still holds with the gauge present). The gauge
should sit above the counts and Import/Export link.

### 3. Add the "just start typing" search hint

**File**: `src/lib/pages/App/App.jsx`

Directly below `<Search />`, add a subtle single-line hint element, e.g.
`<p className="App-search-hint">Just start typing at any time to search</p>`.
This is honest because the app already focuses the search input on any
keystroke (`Search.jsx` `handleKeyDown` calls `input.focus()` for non-modifier
keys). Render it only on the Home page (`isHome`) so it doesn't show on
Load/History/Import pages.

**File**: `src/lib/pages/App/App.css`

Style `App-search-hint` as muted, small, low-emphasis text (use existing muted-
text theme tokens) with modest vertical spacing — visually a quiet hint, not a
control.

### 4. Track visit counts in the service worker

**File**: `service_worker.js`

When a tab navigates (the `chrome.tabs.onUpdated` handler's `changeInfo.url`
branch, around lines 69-86, which already calls `newUrl`), increment a
`visitCount` on that URL's `url-<key>` record. Implement by reading the
`url-<key>` record and writing back `{ ...url, visitCount: (url.visitCount || 0) + 1 }`
as part of the same storage update batch (alongside the existing `newUrl`
`allUrls` update). Initialize to `1` on first visit. This is additive — existing
`url-*` fields (`title`, `favicon`, `processes`, `groupId`) are untouched, and
records without `visitCount` are treated as `0` everywhere downstream.

### 5. Add a pure ranking util for Favorites

**New file**: `src/lib/utils/rankFavorites.js`

Export `rankFavorites(allUrls, urlRecords, limit = 5)` (and register its test).
`allUrls` is the recency-ordered key array; `urlRecords` is a map of
`urlKey -> record`. Compute a score per candidate that blends **recency** (the
item's index in `allUrls`, newest = best) as the dominant term with a secondary
boost from `visitCount`, so recency leads but frequent sites climb. Filter out
records without a usable `url`/`title`. Return the top `limit` as lightweight
objects `{ urlKey, url, title, favicon }` ready for rendering. Keep it
deterministic and side-effect free so it's straightforward to unit test (ties,
missing `visitCount`, fewer than `limit` items, empty input).

**New file**: `src/lib/utils/rankFavorites.test.js`

Cover: recency wins when counts are equal; a high-`visitCount` older site can
out-rank a barely-newer one within the recency-leaning weighting; missing
`visitCount` defaults to 0; respects `limit`; empty/short inputs.

### 6. Add the Favorites sidebar component

**New file**: `src/lib/components/Favorites/Favorites.jsx`

A sidebar section rendered below the search hint (Home only). On mount, read
`allUrls`, then fetch the corresponding `url-*` records via `Chrome.get`, run
them through `rankFavorites`, and render a "Favorites" header followed by the
top sites. Each row shows the `Favicon` (reuse `src/lib/components/Favicon`) and
the site title, and on click focuses an existing tab or opens a new one using
the same logic as `SearchResults.jsx:30-43` (look up `activeTabs` by `urlKey`,
`chrome.tabs.update(..., { active: true })` if open else `chrome.tabs.create`).
Subscribe to `chrome.storage.onChanged` for `allUrls` (and the relevant `url-*`
keys) to stay live, following the named-handler add/remove cleanup pattern used
across the app. Render nothing (or just the header is suppressed) when there are
no favorites yet, so an empty install stays clean.

**New file**: `src/lib/components/Favorites/Favorites.css`

Compact list styling consistent with the sidebar: a small muted "Favorites"
section header and tidy favicon + title rows with hover affordance.

**New file**: `src/lib/components/Favorites/Favorites.test.jsx`

Seed `chrome.storage.local` (via the existing test Chrome mock) with `allUrls`
and a few `url-*` records carrying `visitCount`, render, and assert the
Favorites header plus the expected ordered titles appear; assert the empty
state renders nothing.

**File**: `src/lib/components/index.js`

Export the new component: `export { Favorites } from "./Favorites";`.

**File**: `src/lib/pages/App/App.jsx`

Import `Favorites` and render `{isHome && <Favorites />}` directly below the
search hint (step 3), above the `Triage` card.

## Reused existing code

- `Chrome.get` / `Chrome.set` from `src/lib/utils/Chrome/Chrome.js` — all storage
  access (glossary area: `Chrome`).
- `loadDataSource` gate pattern from `LoadMeterCaption`
  (`src/lib/components/LoadMeterCaption/LoadMeterCaption.jsx`) and `Triage`
  (`src/lib/components/Triage/Triage.jsx:86`) — same source check reused to hide
  the gauge (glossary: `LoadMeterCaption`).
- `Favicon` from `src/lib/components/Favicon` — renders each favorite's icon.
- Open-tab-or-focus logic from `SearchResults.jsx:30-43` — reused for Favorites
  clicks (glossary: `SearchResults`).
- `allUrls` recency-ordered key list and `url-*` record schema from
  `service_worker.js` (`newUrl`, `urlUpdates`) — the data backbone for Favorites.
- `LoadMeter` gauge component (glossary: `LoadMeter`) — relocated, with a new
  self-hide gate.

## Scenarios to Demonstrate

- **Home with rich favorites (Dev Chrome, `processes`)** — search hint visible, a
  populated Favorites list ordered by the recency-leaning blend, and the
  BROWSER LOAD gauge sitting at the bottom of the sidebar.
- **Stable Chrome (`loadDataSource: 'system'`)** — gauge and its caption hidden
  entirely; footer shows only counts + Import/Export; hint and Favorites still
  present.
- **No load data (`loadDataSource: 'none'`)** — same hidden-gauge outcome as
  stable Chrome.
- **Fresh install / empty history** — search hint shows, Favorites section is
  empty (renders nothing), gauge hidden if no per-tab data.
- **Frequency-vs-recency edge** — a frequently-visited older site ranks against a
  just-visited newer one, demonstrating recency leads but visit count boosts.
- **Click a favorite** — focuses the already-open tab when present, otherwise
  opens a new tab.
