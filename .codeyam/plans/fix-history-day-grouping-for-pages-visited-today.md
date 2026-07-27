---
title: "Fix History day grouping for pages visited today"
mode: ui
createdAt: "2026-07-27T19:15:00Z"
source: manual
---

## Summary

Pages visited today show up under "Earlier this week" on the History page instead of "Today" (the Laugh Factory pages are the reported example). The bucketing helper is correct — the timestamp feeding it is not. `History.jsx` derives each row's `ts` **only** from `autoClosed[urlKey]`, and the service worker writes `autoClosed` **only** when a tab is auto-closed by the inactivity sweep (`service_worker.js:539`), *deletes* the entry when the user returns to that tab (`service_worker.js:463-467`), and prunes entries older than 5 days (`MAX_AUTO_CLOSED_TIME`). So any page you opened today and closed manually — or left open — has no `autoClosed` entry, `ts` is `null`, and `bucketByDay(null, now)` returns the catch-all `'Earlier this week'`. Fix: derive the row's timestamp from the real recency signal the `url-*` records already carry (the `visits` array of epoch-ms timestamps written on every visit by `newUrl`), falling back to `autoClosed`; and start stamping a `lastVisit` on every `url-*` record in the service worker so search-engine URLs — which deliberately keep an empty `visits` array — are dated too.

## Key Decisions

- **Timestamp = "most recent thing that happened to this URL"**, computed as `max(record.lastVisit, latest(record.visits), autoClosedTs)`. A tab closed by the sweep an hour after its last visit should read as an hour ago, not as the visit time; a tab revisited after being auto-closed should read as the revisit. Taking the max makes both correct without branching on which store won.
- **Extract a pure helper rather than inline the logic in `History.jsx`.** The existing `bucketByDay` is pure and unit-tested with an injected `now`; the timestamp derivation deserves the same treatment (empty visits, non-numeric junk, object-form `autoClosed`, missing record). New file `src/lib/utils/historyTimestamp.js` + test, mirroring the `historyBuckets.js` pattern.
- **`lastVisit` is written on ALL url records, including search engines** — unlike `visits`, which `newUrl` intentionally skips for search engines so they don't accrue Favorites ranking weight (`service_worker.js:607-620`). `lastVisit` is a display/recency field only and nothing in `rankFavorites` reads it, so stamping it universally dates a Google search correctly without reintroducing search engines into Favorites scoring.
- **Rows sort by timestamp descending inside each bucket.** Today they render in `allUrls` order, which is *approximately* recency but drifts (`closeUrl` move-to-front, eviction reordering). Once every row has a real timestamp, sorting by it is free and makes "Today" read newest-first. Rows with no timestamp at all sort last, preserving their `allUrls` order.
- **No change to `bucketByDay` or `HISTORY_BUCKETS`.** The `null → 'Earlier this week'` fallback stays as the honest answer for a record with genuinely no known time (a legacy record predating `visits` with no `autoClosed` entry). The bug was never in the bucketing.

## Implementation

### 1. New pure helper for the History row timestamp

**New file**: `src/lib/utils/historyTimestamp.js`

Export `historyTimestamp(record, autoClosedEntry)` returning an epoch-ms number, or `null` when nothing is known:

- Read `record.lastVisit` when it is a finite number.
- Read the maximum finite entry of `record.visits` when it is a non-empty array.
- Read the `autoClosed` entry in **both** stored shapes — a bare number (current service-worker format) and the legacy `{ time, backgroundColor }` object — matching the existing inline handling at `src/lib/pages/History/History.jsx:49-50`.
- Return the max of whichever candidates are finite numbers; return `null` when none are.

Guard against garbage (`NaN`, strings, `undefined`, non-array `visits`) with `Number.isFinite`, the way `pruneVisits` in `src/lib/utils/visitDecay.js` does. Keep it pure — no storage, no `Date.now()` — so it unit-tests with fixed inputs.

Add a header comment in the house style explaining *why* `autoClosed` alone was insufficient, so the next reader doesn't re-derive the bug.

**New file**: `src/lib/utils/historyTimestamp.test.js`

Cover: latest visit wins over an older `autoClosed`; `autoClosed` wins when it is newer than the last visit; object-form `autoClosed` (`{ time }`); `lastVisit` alone; empty/absent `visits`; non-numeric junk in `visits`; nothing known → `null`.

**File**: `src/lib/utils/index.js`

Export the new helper alongside the other utils, following the file's existing convention.

### 2. History page uses the derived timestamp and sorts by it

**File**: `src/lib/pages/History/History.jsx`

- Import `historyTimestamp` and replace the inline `const ts = typeof closed === 'number' ? ... : ...` (lines 49-50) with `const ts = historyTimestamp(data, closed)`.
- Keep the existing `color` derivation exactly as-is — it still reads `closed.backgroundColor` off the object form as a fallback behind label membership (line 57). Do not fold color into the new helper.
- Sort `built` before `setRows`: timestamp descending, with `null`-timestamp rows last in their original `allUrls` order (a stable sort keyed on `ts ?? -Infinity` achieves this).
- Update the component's header comment (lines 16-19) — it currently claims `autoClosed` is the source of close timestamps, which is exactly the assumption being corrected.

### 3. Service worker stamps `lastVisit` on every visit

**File**: `service_worker.js`

In `newUrl` (around lines 613-620), add `lastVisit: now` to the `updates[urlKey]` record, **outside** the `isSearchEngine` conditional that gates `visits`. The `now` constant already exists at line 606. Note in the comment that `lastVisit` is a display-recency field only — `rankFavorites` scores off `visits`/`siteVisits` and must not start reading it.

This is additive: existing `url-*` records simply lack `lastVisit` until their next visit, and `historyTimestamp` already falls back to `visits` / `autoClosed` for them.

**File**: `service_worker.test.js`

Add coverage that a visit through `newUrl` writes `lastVisit` on the `url-*` record, and that a **search-engine** URL also gets `lastVisit` while its `visits` array stays empty — the case that motivated putting the field outside the gate.

## Reused existing code

- `bucketByDay` / `HISTORY_BUCKETS` from `src/lib/utils/historyBuckets.js` (glossary entry: `bucketByDay`) — unchanged; the fix feeds it a correct timestamp.
- `History` from `src/lib/pages/History/History.jsx` (glossary entry: `History`) — the consumer being fixed.
- `HistoryRow` from `src/lib/components/HistoryRow/HistoryRow.jsx` (glossary entry: `HistoryRow`) — already renders `row.ts` as a mono `HH:MM` label when present, so today's rows gain a visible time for free. No change needed.
- `pruneVisits` / `VISIT_RETENTION_MS` from `src/lib/utils/visitDecay.js` — the `visits` array shape and its `Number.isFinite` filtering convention that `historyTimestamp` mirrors.
- `installChromeShim` from `src/lib/utils/chromeShim` — how `History.test.jsx` seeds `allUrls` / `url-*` / `autoClosed`; the reproduction test uses the same `seed()` helper already defined in that file.

**Existing-implementation survey.** Grepped for an existing per-URL recency field before proposing `lastVisit`: `url-*` records carry `url`, `title`, `favicon`, `visitCount`, and `visits` — there is **no** existing `lastVisit`, `lastVisitTime`, `lastAccess`, or equivalent scalar timestamp anywhere in `service_worker.js` or the UI utils, and no existing helper that derives a display timestamp from a url record. `autoClosed[urlKey]` is the only timestamp store today, and it is the one this bug is caused by over-relying on. Nothing is being duplicated.

## Reproduction Test

Pins the reported bug: a page visited today but never auto-closed groups under "Earlier this week" instead of "Today".

**Target**: `src/lib/pages/History/History.test.jsx` — run with
`codeyam-editor editor refresh-tests --test History`.

```jsx
// Reproduction: a page visited TODAY but never auto-closed has no `autoClosed`
// entry, so its timestamp must come from the url record's `visits` array.
// Before the fix ts read as null and the row landed under "Earlier this week".
it('groups a tab visited today with no autoClosed entry under Today', async () => {
  seed('allUrls', ['url-https://laughfactory.com']);
  seed('url-https://laughfactory.com', {
    title: 'Laugh Factory',
    favicon: '',
    visitCount: 1,
    visits: [Date.now()],
  });
  seed('autoClosed', {});
  installChromeShim();
  render(<History />);

  expect(await screen.findByText('Laugh Factory')).toBeInTheDocument();
  expect(screen.getByText('Today')).toBeInTheDocument();
  expect(screen.queryByText('Earlier this week')).not.toBeInTheDocument();
});
```

Status: PROPOSED — confirm red at execution. Expected failure: with `autoClosed` empty, `History.jsx` sets `ts = null`, `bucketByDay(null, now)` returns `'Earlier this week'`, so the eyebrow renders "Earlier this week" — `getByText('Today')` throws "Unable to find an element with the text: Today" (and the final `queryByText` assertion would also fail).

## Scenarios to Demonstrate

- **Today, visited-not-closed** — several pages visited within the last hour (the Laugh Factory case), none present in `autoClosed`. All group under "Today", newest first, each showing its `HH:MM` time.
- **Mixed day buckets** — a visit from 20 minutes ago, one from yesterday afternoon, and one from four days ago, so all three sections render in order.
- **Auto-closed beats visit time** — a page last visited this morning that the sweep auto-closed this afternoon: the row reads the close time, not the visit time.
- **Search-engine URL** — a Google search from today, whose `visits` array is empty by design but whose `lastVisit` is set: groups under "Today".
- **Legacy record, no timestamps** — a `url-*` record with `visitCount` but no `visits`, no `lastVisit`, and no `autoClosed` entry: still appears under "Earlier this week" with no time shown (unchanged, honest fallback).
- **Empty state** — no `allUrls` at all: "No history yet."