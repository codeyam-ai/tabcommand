---
title: "Full Search Page"
mode: ui
createdAt: "2026-09-10T13:09:50Z"
source: manual
---

## Summary

The sidebar search box (`Search` → `SearchResults`) is a quick-jump overlay: it shows at most 10 grouped URLs and 10 archived URLs, with no way to see everything that matched or to narrow the results by where they came from. This plan adds a pinned first row, **"Open Full Search"**, to the overlay. When there is query text, that row is selected by default, so pressing Enter (or clicking it) goes to a new **Full Search** page with the query carried over. The Full Search page shows every match with no cap. Results are split by source: **Groups**, **In my groups** (grouped URLs, sub-sectioned per group), **History** (tracked URLs not in any group), **Notes** (URLs whose notes matched, with the snippet), and **Open tabs**. Filter chips show a count for each section. There is also an opt-in **"Include Chrome history"** toggle, which requests the `history` permission at runtime (an optional permission, not an install-time one) and adds a section of matches from Chrome's full browser history.

## Key Decisions

- **"Open Full Search" takes index 0 and the default selection.** The user asked for Enter to open Full Search, which changes today's behavior where Enter opens the top hit. To reach the top hit it is now ArrowDown then Enter. The row shows even when the query has no results, and replaces the bare "No Results" state as the first thing on screen.
- **A new page, not a new html entry.** It follows the existing `uxSettings.page` routing: `Pages.SEARCH` plus `{ name: Pages.SEARCH, query }`, rendered in `App.jsx` alongside `HISTORY` and `FAVORITES`. Putting the query in `uxSettings.page` means a reload keeps the search, which matches how `URL` carries `urlKey`.
- **Extract the index into a shared hook.** Today the MiniSearch index is built inline in `Search.jsx` (lines 16-149). A new `useSearchIndex` hook takes over the construction, the `buildToken` race guard, and the `onChanged` rebuild logic, so the overlay and the page can't drift apart. `Search.jsx` becomes a consumer, and its existing tests must stay green.
- **Sources are computed by a pure util.** The new `segmentFullSearchResults(results, activeTabs)` extends what `segmentSearchResults` does. It returns `{ labels, grouped, history, notes, openTabs }`. A URL can appear in both its location section (grouped or history) and in Notes / Open tabs. The "All" chip dedupes by id. This keeps the page logic testable without React.
- **Chrome history is an optional permission.** Add `"optional_permissions": ["history"]` to `manifest.json`. The toggle calls `chrome.permissions.request({ permissions: ['history'] })` and then `chrome.history.search({ text, startTime: 0, maxResults: 200 })`. Hits whose URL is already indexed are dropped (the tracked record is richer). The toggle state persists in `settings`, and the page checks `chrome.permissions.contains` on mount so a revoked permission falls back cleanly. The install-time warning stays unchanged.
- **No page-content search here.** Searching website contents needs host permissions and is its own plan (`website-content-search`, which depends on this one). This page leaves a visible section slot for it.

## Implementation

### 1. Shared search index hook

**New file**: `src/lib/hooks/useSearchIndex.js`

Move the MiniSearch construction, `addDocuments` (with `buildToken`), and `handleStorageChange` out of `Search.jsx` into `useSearchIndex()`. The hook returns `{ search(query) }`, which is the raw MiniSearch results with `{prefix: true}`. It reuses `buildSearchDocuments` / `buildUrlDocuments` and `changedInArea` unchanged.

### 2. Overlay: pinned "Open Full Search" row

**File**: `src/lib/components/Search/Search.jsx`
**File**: `src/lib/components/SearchResults/SearchResults.jsx`

- `Search` uses `useSearchIndex`, passes `query` to `SearchResults`, and renders the results whenever `searchText` is non-empty, including when there are zero hits.
- `SearchResults` renders an "Open Full Search" row (search icon, the text `Open Full Search for "<query>"`) at flat index 0. Every other index shifts by one, both in `handleClick`'s lookup array and in the running `index` counter. `totalItems` grows by 1.
- Activating it (click or Enter at index 0) fires the synthetic Escape as the other results do, then sets `uxSettings.page = { name: Pages.SEARCH, query }`.
- The "No Results" section now renders below the pinned row.

### 3. Page constant and routing

**File**: `src/Constants.jsx`: add `SEARCH: 'Search'` to `Pages`.

**File**: `src/lib/pages/App/App.jsx`: add a `page.name === Pages.SEARCH` branch next to the `HISTORY` / `FAVORITES` branches (around line 345), rendering `<FullSearch initialQuery={page.query} />`.

**File**: `src/lib/pages/index.js`: export `FullSearch`.

### 4. Full Search page

**New file**: `src/lib/pages/FullSearch/FullSearch.jsx` (+ `FullSearch.css`, `index.js`)

- A `PageHeader` titled "Search", with a large query input seeded from `initialQuery`. Edits write the query back to `uxSettings.page.query` (debounced) so a reload keeps it.
- Filter chips: All · Groups · In my groups · History · Notes · Open tabs · (Chrome history, only when enabled), each with a count. Chips with zero hits are dimmed but still clickable.
- Sections render with no 10-item cap. URL rows reuse the existing row look: the `Favicon`, the title, the host, the group color swatch for grouped hits, the notes snippet via `searchNotesSnippet`, an "Open" badge when the URL is in `activeTabs`, and the edit pencil that routes to `Pages.URL`.
- Clicking a row reuses the same open-or-focus-tab behavior as `SearchResults.handleClick`. Pull that logic into a small shared util (**new file**: `src/lib/utils/openUrlKey.js`) so both callers share it.
- Keyboard: ArrowUp/Down/Enter over the visible (filtered) flat list, and Escape blurs the input. Use `KeyDown` the way `SearchResults` does.
- An empty query shows a short hint. A query with no hits shows `EmptyState`.

### 5. Source segmentation util

**New file**: `src/lib/utils/segmentFullSearchResults.js` (+ test)

Pure function. `labels` are hits with `labelTitle`. `grouped` are URL hits with `urlLabelTitle`, run through `groupSearchUrlsByLabel`. `history` are URL hits with no group. `notes` are URL hits whose `match` includes `notes`. `openTabs` are URL hits whose id is in `activeTabs[].urlKey`. It dedupes by id within each section the way `segmentSearchResults` does.

### 6. Optional Chrome history

**File**: `manifest.json`: add `"optional_permissions": ["history"]`.

**New file**: `src/lib/utils/searchChromeHistory.js`: `searchChromeHistory(text, indexedUrls)` calls `chrome.history.search` and returns hits shaped like URL results (`id: 'chrome-history-<url>'`, `urlTitle`, `url`, `lastVisitTime`), dropping URLs already in `indexedUrls`.

**File**: `src/lib/utils/chromeShim/chromeShim.js`: add `permissions.contains` / `request` and `history.search` stubs so the dev server and scenarios can render both the permission-granted and not-granted states.

### 7. Store and privacy copy

**File**: `store/store-listing.md`: add a justification row for the optional `history` permission ("only requested when the user turns on 'Include Chrome history' in Full Search; queried locally, never transmitted").

The public policy at codeyam.com/tabcommand/privacy lives outside this repo. Flag in the final summary that it needs a line about the optional history permission.

## Reused existing code

- `buildSearchDocuments`, `buildUrlDocuments` from `src/lib/utils/buildSearchDocuments.js` (glossary: `buildSearchDocuments`, `buildUrlDocuments`)
- `segmentSearchResults` from `src/lib/utils/segmentSearchResults.js` (glossary: `segmentSearchResults`), the model for the new util
- `groupSearchUrlsByLabel` from `src/lib/utils/groupSearchUrlsByLabel.js`
- `searchNotesSnippet` from `src/lib/utils/searchNotesSnippet.js` (glossary: `searchNotesSnippet`)
- `changedInArea` from `src/lib/utils/storageAreas.js`
- `Chrome.get` / `Chrome.set` from `src/lib/utils/Chrome`
- `KeyDown` from `src/lib/utils/KeyDown.js`
- `PageHeader`, `EmptyState`, `Favicon`, `Icon` components from `src/lib/components`
- The page-branch pattern in `src/lib/pages/App/App.jsx`

## Scenarios to Demonstrate

- Overlay with a query that has matches: "Open Full Search" pinned and selected at the top, the normal sections below
- Overlay with a query that has no matches: "Open Full Search" plus "No Results"
- Full Search, rich data: hits in all five sections, with counts on the chips, the notes snippet highlighted, and "Open" badges
- Full Search filtered to a single chip (e.g. Notes)
- Full Search with more than 10 grouped and archived hits (proves there's no cap)
- Full Search with an empty query (hint) and with no hits (empty state)
- The Chrome history toggle off (not granted), and on with Chrome-history hits deduped against tracked URLs