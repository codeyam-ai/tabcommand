---
title: "Group Search Results by Group"
mode: ui
createdAt: "2026-07-12T15:45:32Z"
source: manual
---

## Summary

In the search overlay, grouped-URL hits are currently rendered as one flat
"Grouped URLs" list, with no indication of which group each URL belongs to.
This plan re-organizes those hits so that grouped URLs are split into a
sub-section per group, each headed by the group's color dot and name, and the
URLs are listed beneath their group. Archived (ungrouped) URLs and the Groups
section are unchanged. This makes it immediately clear which group a matching
URL lives in and clusters related results together.

## Key Decisions

- **Colored header per group** (chosen over an inline per-row badge) — the
  grouped-URL section becomes one sub-section per group, each with a header
  showing the group's color dot + title, matching the existing "Groups" header
  visual language. A per-row badge was considered but the header already
  conveys membership without repeating it on every row.
- **Carry the group color onto URL documents.** `SearchResults` only receives
  the search hits, so a grouped URL whose group didn't itself match the query
  has no color available today. Rather than pass the whole labels map down, add
  a `urlLabelColor` field to each URL document (alongside the existing
  `urlLabelTitle`) so every grouped URL hit already knows its group's color.
- **Group + order in a pure helper, flatten for activation.** A new pure
  `groupSearchUrlsByLabel` helper turns the flat `urls` array into ordered
  `{ title, color, urls }` groups (first-appearance order, preserving
  within-group order). `SearchResults` derives its flat keyboard/click
  activation list by flattening those groups, so render order and activation
  index stay perfectly aligned regardless of input order — the same invariant
  the current `[...labels, ...urls, ...archived]` code relies on.

## Implementation

### 1. Carry the group color through the index

**File**: `src/lib/utils/buildSearchDocuments.js`

- In `buildSearchDocuments`, also build and return a `labelColorMap` of
  `label.title -> label.backgroundColor` (the same source the label documents
  already use for their `color`).
- In `buildUrlDocuments`, accept the new `labelColorMap` argument and set
  `urlLabelColor: labelColorMap[title]` on each document, present only for
  grouped URLs (mirrors how `urlLabelTitle` is present only for labeled URLs).
  Leave it undefined for archived URLs.

**File**: `src/lib/components/Search/Search.jsx`

- Destructure `labelColorMap` from `buildSearchDocuments(labels)` and pass it
  into `buildUrlDocuments(urlKeys, labelMap, labelColorMap, result)`.
- Add `'urlLabelColor'` to the MiniSearch `storeFields` array so the color is
  returned on each hit.

### 2. Group the URL hits by their group

**New file**: `src/lib/utils/groupSearchUrlsByLabel.js`

Pure helper: given the flat `urls` array (each hit carrying `urlLabelTitle` and
`urlLabelColor`), return an ordered array of `{ title, color, urls }` groups.
Groups appear in first-appearance order across the input; URLs keep their input
order within each group. Guards a null/empty input to `[]`. Kept free of React
so the grouping is unit-testable in isolation.

### 3. Render one sub-section per group

**File**: `src/lib/components/SearchResults/SearchResults.jsx`

- Compute `const urlGroups = groupSearchUrlsByLabel(urls)` and derive the flat
  grouped-URL list `const flatUrls = urlGroups.flatMap((g) => g.urls)`.
- Replace every use of the raw `urls` prop in the flat activation ordering with
  `flatUrls` — specifically the `handleClick` array
  (`[...labels, ...flatUrls, ...(archived || [])]`) and the `totalItems` count
  in the keydown effect — so indices still line up with render order.
- Replace the single flat "Grouped URLs" section with: for each group in
  `urlGroups`, render a sub-section whose header shows a color dot
  (`style={{ backgroundColor: group.color }}`, reusing the
  `SearchResults-labelIcon` visual) next to the group title, followed by that
  group's URL rows via the existing `urlResult(index, url)` renderer. The
  running `index` continues to increment per URL row across all groups (headers
  are not selectable, matching today's section-title behavior).
- Keep the "only render when non-empty" guard: render the grouped area only when
  `urls` has hits, and skip any empty group.

**File**: `src/lib/components/SearchResults/SearchResults.css`

- Add styles for the per-group header (reuse/extend the existing
  `SearchResults-labelIcon` dot and section-title styling) so the group headers
  sit visually as lighter sub-headers under the results, distinct from the
  top-level "Groups"/"Archived URLs" section titles.

## Reused existing code

- `segmentSearchResults` from `src/lib/utils/segmentSearchResults.js` (glossary
  entry: `segmentSearchResults`) — still produces the `{ labels, urls, archived }`
  split; the new grouping consumes its `urls` output unchanged.
- `buildSearchDocuments` / `buildUrlDocuments` from
  `src/lib/utils/buildSearchDocuments.js` (glossary entry: `buildSearchDocuments`)
  — extended to carry `urlLabelColor`.
- `urlResult` renderer and `SearchResults-labelIcon` color-dot styling inside
  `SearchResults` (glossary entry: `SearchResults`) — reused for the URL rows
  and the new group headers.
- `searchNotesSnippet` from `src/lib/utils/searchNotesSnippet.js` (glossary
  entry: `searchNotesSnippet`) — unchanged; still highlights notes matches on
  each URL row.

## Scenarios to Demonstrate

- Grouped results spanning multiple groups — a query matching URLs in two or
  three different groups, each rendered under its own colored header.
- Single group — a query whose grouped hits all belong to one group (one header).
- Groups + Archived together — grouped sub-sections followed by the unchanged
  Archived URLs section.
- No grouped hits, only archived — grouped area hidden, archived shown as today.
- Empty state — a query with no matches still shows "No Results".
