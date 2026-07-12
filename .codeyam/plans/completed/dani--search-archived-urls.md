---
title: "dani -- Search Archived URLs"
mode: ui
createdAt: "2026-07-12T00:00:00Z"
source: manual
prefix: "dani"
---

## Summary

Today the sidebar search only indexes **labeled** URLs. Every other URL you've
visited or closed — the full archive in `allUrls` — is never added to the search
index, so it can't be found. The search overlay even shows a disabled "Search
Archived URLs — coming soon" affordance as a placeholder for this. This plan
turns that promise on: index every URL in `allUrls` (with its metadata — title,
url, notes, favicon), and surface non-labeled hits under the existing "Archived
URLs" section while labeled hits stay under "Grouped URLs". The result: one
search box that finds anything you've been to, not just the URLs you filed into a
group.

## Key Decisions

- **Index the full `allUrls` archive, not just `labelMap` keys.** `Search.jsx`
  currently derives the URL document set from `buildSearchDocuments`'s `labelMap`
  (labeled URLs only). We instead read `allUrls` (the authoritative full set that
  `History.jsx` already uses) and build a document for every URL, still tagging
  which ones belong to a label so results can be segmented.
- **Keep labeled vs. archived visually separate** (chosen over one merged list).
  A URL that belongs to a label renders under "Grouped URLs"; a URL with no label
  renders under the now-active "Archived URLs" section. This preserves the
  existing grouping cue and lets the "coming soon" affordance become a real
  results region.
- **Reuse the same metadata fields already indexed.** `buildUrlDocuments`
  already shapes `{ urlTitle, url, favicon, notes, urlLabelTitle }`. Archived
  URLs use the identical shape with `urlLabelTitle` absent — that absence is the
  signal used to segment them, so no new field type is needed downstream and the
  `notes`/`url`/`title` boosts keep working for archived hits too.
- **Batch the storage read the same way it's already done.** Archived URL
  records live under their `url-…` keys just like labeled ones; we extend the
  existing `Chrome.get(...)` batch to fetch every `allUrls` key instead of only
  `labelMap` keys, keeping a single async read guarded by the existing
  `buildToken`.

## Implementation

### 1. Build documents for every archived URL, not just labeled ones

**File**: `src/lib/utils/buildSearchDocuments.js`

`buildSearchDocuments(labels)` stays responsible for the label documents and the
`labelMap` (urlKey → label title). Add a second input path so the URL half can
cover the whole archive:

- Change `buildUrlDocuments(labelMap, urlRecords)` to also accept the full key
  list. Concretely, add `buildUrlDocuments(urlKeys, labelMap, urlRecords)` (or an
  options object) that iterates over **`urlKeys`** (the deduped union of
  `allUrls` and `labelMap` keys) rather than only `Object.keys(labelMap)`. For
  each key with a present record, emit the same document shape, setting
  `urlLabelTitle: labelMap[urlKey]` when the key is labeled and leaving it
  **undefined** otherwise.
- Keep the existing skip-on-missing/malformed behavior (a partially-seeded store
  must never throw).
- URL keys are of the form `url-<url>`; when a record has no `title`, fall back to
  `record.url` (already done), and when a record is entirely absent but the key is
  in `allUrls`, either skip it (matches current behavior) or derive a minimal
  document from the key (`url` = `urlKey.replace(/^url-/, '')`). Prefer skipping
  absent records to stay consistent with the current contract; note the choice in
  the doc comment.

Update the file's top doc comment to describe that URL documents now span the
full archive, with `urlLabelTitle` present only for labeled URLs.

### 2. Feed the full archive into the index

**File**: `src/lib/components/Search/Search.jsx`

In the `addDocuments(labels)` closure inside the mount effect:

- After building label documents and `labelMap`, read `allUrls` alongside the
  labeled keys. Since `addDocuments` is currently called with just `labels`, fetch
  `allUrls` as part of the seed/update reads (extend the existing
  `Chrome.get('Search2', ['labels'], …)` to also request `allUrls`, and likewise
  the `changes.labels` / notes-change refresh paths so archived URLs re-index when
  the archive grows).
- Compute `urlKeys = unique([...allUrls, ...Object.keys(labelMap)])` and pass it
  to `Chrome.get('Search1', urlKeys, …)`, then to the updated
  `buildUrlDocuments(urlKeys, labelMap, result)`.
- Keep the `buildToken` monotonic guard exactly as-is so overlapping rebuilds
  still can't corrupt the minisearch id map. The batch read simply covers more
  keys now.
- Extend the `handleStorageChange` listener so a change to **`allUrls`** (not just
  `labels` or a labeled URL's notes) triggers `addDocuments`, so newly visited/
  closed URLs become searchable live — mirroring how `History.jsx` already
  listens for `allUrls` / `url-` changes.

### 3. Segment archived hits into their own bucket

**File**: `src/lib/utils/segmentSearchResults.js`

Currently returns `{ labels, urls }` where a hit is a label iff it has
`labelTitle`, else a URL. Add a third bucket:

- Return `{ labels, urls, archived }`.
- A hit is a **label** when it carries `labelTitle`.
- Among non-label hits, a hit is a **grouped url** when it carries
  `urlLabelTitle` (it belongs to a label), and an **archived url** otherwise.
- Preserve the existing dedupe-by-id (the duplicate-React-key guard) before
  splitting.

### 4. Render the Archived URLs results and pass them through

**File**: `src/lib/components/SearchResults/SearchResults.jsx`

- Accept a new `archived` prop (array), alongside `labels` and `urls`.
- Replace the disabled "Search Archived URLs — coming soon" affordance with a
  real section that renders `archived` rows using the **same** `urlResult`
  renderer already used for grouped URLs (favicon, title, notes snippet, edit
  pencil, click-to-open/focus). Only render the section header when there are
  archived hits; otherwise fall back to the current empty/No-Results handling.
- Fold `archived` into the keyboard-navigation index math: the flat activation
  list becomes `[...labels, ...urls, ...archived]`, and `totalItems` /
  `handleClick`'s indexing must include archived rows so Arrow/Enter still land on
  the right item.
- Update `propTypes` to include `archived: PropTypes.array`.

**File**: `src/lib/components/Search/Search.jsx`

- Pass the new bucket down: `archived={results.archived.slice(0, 10)}` (cap it the
  same way `urls` is capped at 10), keeping `labels` and `urls` as they are.

## Reused existing code

- `buildSearchDocuments` / `buildUrlDocuments` from
  `src/lib/utils/buildSearchDocuments.js` (glossary entry: `buildSearchDocuments`)
  — extended to cover the archive.
- `segmentSearchResults` from `src/lib/utils/segmentSearchResults.js` (glossary
  entry: `segmentSearchResults`) — extended with an `archived` bucket.
- `searchNotesSnippet` from `src/lib/utils/searchNotesSnippet.js` (glossary entry:
  `searchNotesSnippet`) — reused unchanged for archived URL notes highlighting.
- `Search` from `src/lib/components/Search/Search.jsx` (glossary entry: `Search`)
  — the minisearch index, `buildToken` guard, and `onChanged` wiring are reused;
  the read set is widened to `allUrls`.
- `SearchResults` from `src/lib/components/SearchResults/SearchResults.jsx`
  (glossary entry: `SearchResults`) — the `urlResult` row renderer and keyboard
  nav are reused for the archived section.
- `allUrls` / `url-<url>` storage keys — the same full-archive source and record
  shape that `History` (`src/lib/pages/History/History.jsx`, glossary entry:
  `History`) already reads, so the archive definition stays consistent across
  History and Search.

## Scenarios to Demonstrate

- **Archived hit only** — query matches a URL the user visited but never labeled;
  it appears under the "Archived URLs" section with title + favicon.
- **Mixed results** — query matches a label, a grouped (labeled) URL, and an
  archived URL simultaneously; all three sections render in order (Groups →
  Grouped URLs → Archived URLs).
- **Archived notes match** — query matches text inside an archived URL's `notes`;
  the highlighted notes snippet renders on the archived row.
- **No results** — query matches nothing across labels, grouped, and archived;
  the "No Results" empty state shows and no stray section headers appear.
- **Empty archive** — `allUrls` is empty (fresh install); search still works over
  labels/grouped URLs and the Archived URLs section stays empty without errors.
- **Keyboard navigation across sections** — Arrow Down from a label into a grouped
  URL and on into an archived URL selects the correct row, and Enter opens/focuses
  it.
