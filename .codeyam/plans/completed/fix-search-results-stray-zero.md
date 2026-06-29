---
title: "Fix Stray 0 at Top of Search Results"
mode: ui
createdAt: "2026-06-29T00:57:44Z"
source: manual
---

## Summary

When you start typing in the search box, a stray `0` sometimes appears at the
top of the search results overlay. This is a React rendering bug in
`SearchResults.jsx`: the section guards use the pattern
`{(labels && labels.length) && <div>…}`. When the array is empty, `[].length`
is `0`, so `[] && 0` evaluates to the number `0` — and React renders the
number `0` as literal text rather than rendering nothing. The fix is to make
these guards return a real boolean so empty sections render nothing instead of
a `0`.

## Key Decisions

- **Root cause is the `&& length` short-circuit, not the data.** The segmented
  result shape (`{ labels, urls }` from `segmentSearchResults`) is correct —
  it returns empty arrays when there are no matches in a given section. The bug
  is purely how those empty arrays are guarded in JSX. Fix it at the render
  site rather than reshaping the data.
- **Coerce the guards to booleans** (e.g. `labels.length > 0`) rather than
  switching to ternaries with `null`. This is the smallest, clearest change and
  matches the boolean guard already used in `Search.jsx`
  (`searchText.length > 0`).
- **Add a regression test that asserts the `0` is absent**, since the existing
  tests render the empty-section case (`labels={[]}, urls={[urlHit()]}`) but
  only assert the presence of expected text — they never assert that a stray
  `0` is *not* rendered, which is why the bug slipped through.

## Implementation

### 1. Fix the empty-array render guards

**File**: `src/lib/components/SearchResults/SearchResults.jsx`

In the returned JSX (around lines 143 and 152), the two section guards use
`{(labels && labels.length) && …}` and `{(urls && urls.length) && …}`. When the
array is present but empty, these evaluate to `0`, which React renders as text.

Change both guards so they evaluate to a boolean — e.g.
`{labels && labels.length > 0 && …}` and `{urls && urls.length > 0 && …}` (or
equivalently wrap the count in `!!(…)`). The "No Results" guard on line 138
(`(!labels || !labels.length) && (!urls || !urls.length)`) already evaluates to
a boolean and does not need to change, but verify it still behaves correctly
alongside the updated guards.

### 2. Add a regression test for the stray zero

**File**: `src/lib/components/SearchResults/SearchResults.test.jsx`

Add a test that renders the section-empty case — the same shape that triggers
the bug, `labels={[]}` with non-empty `urls` (and the mirror case, non-empty
`labels` with `urls={[]}`) — and asserts the overlay does **not** contain a
stray `0`. For example, assert `screen.queryByText('0')` is null, or assert the
overlay container's text content does not include a lone `0`. This locks in the
fix and prevents regression of the `&& length` pattern.

## Reused existing code

- `SearchResults` from `src/lib/components/SearchResults/SearchResults.jsx`
  (glossary entry: `SearchResults`) — the component being fixed.
- `segmentSearchResults` from `src/lib/utils/segmentSearchResults.js`
  (glossary entry: `segmentSearchResults`) — confirms the `{ labels, urls }`
  shape that feeds the component is already correct; no change needed there.
- Existing test setup in
  `src/lib/components/SearchResults/SearchResults.test.jsx` (`labelHit`,
  `urlHit` fixtures) — reuse these for the new regression test.

## Scenarios to Demonstrate

- **Happy path — mixed results**: type a query that matches both a Group and a
  URL; both sections render, no stray `0`.
- **URLs only (the reported bug)**: type a query that matches URLs but no
  Groups (`labels` is empty); the "Grouped URLs" section renders with no `0`
  above it.
- **Groups only**: type a query that matches a Group but no URLs (`urls` is
  empty); the "Groups" section renders with no stray `0`.
- **No results**: type a query that matches nothing; the "No Results" state
  renders as before, with no `0`.
