---
title: "History Live Updates & Day Grouping Fix"
mode: ui
createdAt: "2026-07-11T00:00:00Z"
source: manual
---

## Summary

The History page (`src/lib/pages/History/History.jsx`) reads Chrome storage
exactly once, on mount, so it never reflects tabs that are closed or visited
while the page is open — the user had to navigate away and back (forcing a
remount) to see fresh entries. Separately, History extracts each closed tab's
timestamp as `closed.time` and its color as `closed.backgroundColor`, but the
service worker actually stores `autoClosed[urlKey]` as a **bare numeric epoch**
(`autoClosed[tab.urlKey] = now` in `service_worker.js:460`; read back as a
number in `service_worker.js:436` and `Tabs.jsx:122`). Because a number has no
`.time`/`.backgroundColor`, every real closed tab falls through to `ts = null`
→ the "Earlier this week" bucket and loses its color — which makes the list
look mis-grouped and incomplete. This plan makes History live-updating (the
exact `chrome.storage.onChanged` pattern its sibling `ViewAllFavorites` already
uses) and fixes the timestamp/color extraction so Today / Yesterday grouping
works against the real numeric shape.

## Key Decisions

- **Reuse ViewAllFavorites' live-update pattern verbatim.** `ViewAllFavorites`
  already extracts its storage read into a `load()` function, calls it on mount,
  registers a single `chrome.storage.onChanged` listener that re-runs `load()`
  when a relevant key changes, and removes the listener on cleanup. Its own doc
  comment even claims it "Mirrors the History page" — but History never actually
  grew the listener. Mirror it back so both pages behave identically. This keeps
  the fix consistent with the codebase instead of inventing a new mechanism.
- **Treat `autoClosed` values as numbers, with object-form back-compat.** The
  real stored shape is a bare epoch number. Read `const ts = typeof closed ===
  'number' ? closed : (closed && closed.time) || null`. Keeping the object-form
  branch preserves the existing test that seeds `{ time: ... }` and guards
  against any legacy object-shaped entries still in storage. The autoClosed
  color fallback becomes effectively dead for numeric entries, so row color
  comes from `colorFor[urlKey]` (label membership), which already works — keep
  the `closed.backgroundColor` fallback only under the object branch.
- **Watch the same keys History reads.** The listener should re-load when
  `allUrls`, `autoClosed`, `labels`, or any `url-*` record changes — mirroring
  ViewAllFavorites' `touched` predicate (which watches `allUrls`, `activeTabs`,
  `favoritesHidden`, and `url-*`).
- **Leave the 250-entry `allUrls` cap alone.** `service_worker.js:498-512`
  deliberately caps history at 250 URLs and evicts the oldest. That is an
  intentional retention bound, not part of this bug; the "not capturing full
  history" symptom is explained by the mis-bucketing, not the cap.

## Implementation

### 1. Make History live-updating and fix timestamp/color extraction

**File**: `src/lib/pages/History/History.jsx`

- Extract the body of the current `useEffect` into a `load()` function that
  recomputes `now = Date.now()`, reads `['allUrls', 'autoClosed', 'labels']`,
  then the per-url records, and calls `setRows(built)`. (Because the bucket is
  computed from `now` at load time, recomputing `now` on each load also keeps
  Today/Yesterday correct across a midnight boundary while the page stays open.)
- In the effect: call `load()` once, then register
  `chrome.storage.onChanged.addListener(handleChange)` and return a cleanup that
  calls `chrome.storage.onChanged.removeListener(handleChange)`. `handleChange`
  should ignore non-`local` areas and re-run `load()` only when a changed key is
  `allUrls`, `autoClosed`, `labels`, or starts with `url-` — the ViewAllFavorites
  `touched` predicate, adapted to History's keys.
- Fix the per-row timestamp read (currently `const ts = closed && closed.time ?
  closed.time : null;`) to handle the real numeric shape:
  `const ts = typeof closed === 'number' ? closed : (closed && closed.time) || null;`
- Keep the color as `colorFor[urlKey] || (closed && typeof closed === 'object' &&
  closed.backgroundColor)` so the object-form fallback stays valid YAML/JS but a
  numeric `closed` never yields `undefined.backgroundColor` surprises. Label
  color (`colorFor`) remains the primary source.

### 2. Update History tests for the live listener and numeric shape

**File**: `src/lib/pages/History/History.test.jsx`

- Add a test seeding `autoClosed` in the **real numeric form**
  (`{ 'url-...': Date.now() }`) and assert the tab groups under "Today" — this is
  the reproduction test below.
- Add a live-update test: render with one seeded url, then write a second
  `url-*` record + push its key into `allUrls` via the chrome shim's storage,
  and assert the new row appears **without** re-rendering/remounting (the
  `onChanged` listener drives it). Mirror how other `onChanged`-driven component
  tests in this repo trigger a change through the shim.
- Keep the existing object-form "Today" test green (the back-compat branch
  preserves it).

## Reused existing code

- `ViewAllFavorites` live-update pattern from
  `src/lib/pages/ViewAllFavorites/ViewAllFavorites.jsx` (glossary entry:
  `ViewAllFavorites`) — `load()` + `chrome.storage.onChanged` add/remove listener
  with a `touched`-key predicate. Copy this structure into History.
- `bucketByDay` / `HISTORY_BUCKETS` from `src/lib/utils/historyBuckets.js`
  (glossary entry: `bucketByDay`) — unchanged; the fix just feeds it a correct
  numeric `ts` instead of `null`.
- `Chrome.get` from `src/lib/utils/Chrome/Chrome.js` (glossary entry: `Chrome`) —
  storage abstraction used for the reads inside `load()`.
- `HistoryRow` from `src/lib/components/HistoryRow` (glossary entry:
  `HistoryRow`) — row renderer, unchanged.
- `installChromeShim` from `src/lib/utils/chromeShim` (glossary entry:
  `chromeShim`) — test double that already supports `storage.onChanged`
  (see `chromeShim.js:128`), used by the ViewAllFavorites tests.

## Reproduction Test

A tab whose `autoClosed` timestamp is stored in the real numeric epoch form is
mis-bucketed into "Earlier this week" instead of "Today".

**Target**: `src/lib/pages/History/History.test.jsx` — run with
`codeyam-editor editor refresh-tests --test History`.

```jsx
// a tab closed just now with the real numeric autoClosed timestamp groups under Today
it('groups a numerically-timestamped closed tab under Today', async () => {
  seed('allUrls', ['url-https://react.dev']);
  seed('url-https://react.dev', { title: 'React', favicon: '' });
  seed('autoClosed', { 'url-https://react.dev': Date.now() });
  installChromeShim();
  render(<History />);

  expect(await screen.findByText('React')).toBeInTheDocument();
  expect(screen.getByText('Today')).toBeInTheDocument();
});
```

Status: PROPOSED — confirm red at execution. Expected failure: with the current
`closed.time` read, a numeric `closed` yields `ts = null`, so the row buckets to
"Earlier this week"; the "Today" section never renders and
`screen.getByText('Today')` throws a not-found error.

## Scenarios to Demonstrate

- **Live update while open** — History page open with a few rows; a tab is
  auto-closed (a new `url-*` + `autoClosed` write) and the row appears in the
  correct day group with no navigation.
- **Today / Yesterday / Earlier grouping** — closed tabs with numeric
  timestamps spread across today, yesterday, and three days ago, each landing in
  the right section.
- **Empty state** — no `allUrls`; shows "No history yet."
- **Color-coded rows** — closed tabs that belong to a colored label render their
  dot in the label's color (via `colorFor`), independent of `autoClosed` shape.
- **Midnight rollover (edge)** — page left open across local midnight; a
  subsequent storage change re-loads with a fresh `now`, moving a "Today" row
  into "Yesterday".
