---
title: "Durable Site-Level Visit Stats"
mode: ui
createdAt: "2026-07-14T15:58:13Z"
source: manual
---

## Summary

Favorites advertises a 56-day visit history (`VISIT_RETENTION_MS`, 8 weeks — sized
for the 7-week sparkline) but in practice loses it constantly: a site the user
visits every day can still render "1 visit · 12h ago". Two defects combine to
cause this.

**Defect 1 — visit history is hard-deleted by URL eviction.** `newUrl`
(`service_worker.js:495-513`) unshifts a `urlKey` onto `allUrls` *only when it is
absent* (`if (allUrls.indexOf(urlKey) === -1)`). A revisit never refreshes the
key's position, so `allUrls` is ordered by **first-seen**, not last-visited —
even though every consumer treats it as a recency list. Every newly-seen URL
pushes existing keys toward the tail; once `allUrls` reaches 250, everything past
index 249 is `chrome.storage.local.remove(...)`'d — the entire `url-*` record,
`visits` array and all. The next visit recreates the record from scratch with
`visitCount: 1, visits: [now]`. That is the reported "1 visit · 12h ago".

**Defect 2 — per-page keys make a content site evict itself.** `getUrlKey` keys on
the full URL minus `#hash`, and `normalizeUrl` preserves path and query, so every
ESPN *article* is its own key consuming one of the 250 slots. A news site the user
reads deeply actively accelerates the eviction of its own homepage record, and its
per-article visits never credit the site.

The fix makes visit stats **durable and site-level**: visits accumulate in a new
`siteVisits` store keyed by host, pruned only by the retention horizon
(`VISIT_RETENTION_MS`) and `MAX_VISITS` — never by the `allUrls` display cap.
`allUrls` additionally becomes a true LRU (move-to-front on every visit) and its
cap rises to 500, so the *history* list stops evicting live sites too. Favorites
then groups and ranks by host, so ESPN's homepage and articles roll up into one
row whose count and sparkline reflect the site's real 8-week usage.

## Key Decisions

- **Decouple stats from the display list, rather than only fixing the ordering.**
  A move-to-front LRU alone would rescue daily-visited sites, but a site visited
  *weekly* could still be pushed past the cap by 250 distinct URLs and lose
  everything. Storing visits in their own `siteVisits` map makes the advertised
  56-day window actually true regardless of browsing volume — the number in the
  UI stops being a lie.
- **Also raise the `allUrls` cap 250 → 500** (per user request). This is
  belt-and-braces, not the fix: with stats decoupled, eviction no longer destroys
  history, but a larger list keeps more sites renderable in History and Favorites.
  Lift the magic `250` into a named `MAX_TRACKED_URLS` constant while we're there.
- **Roll favorites up to the host** (per user decision). `rankFavorites` groups by
  host instead of host+path+query, so article visits credit the site. This is a
  deliberate semantic change: a Favorites row now means "ESPN", not "this exact
  ESPN page".
- **Keep writing `visits` / `visitCount` on the `url-*` record.** History rows and
  legacy records still read them, and keeping the write lets `rankFavorites`
  migrate old users by unioning the legacy per-record timestamps with `siteVisits`.
- **Migrate by union-with-dedupe, not by preferring one store.** On the first
  post-upgrade visit, `siteVisits[host]` would hold exactly one timestamp while the
  legacy record still holds twenty — preferring `siteVisits` would *itself* wipe
  history. Instead merge both and dedupe by exact epoch-ms. Safe because both
  stores are written from the same `newUrl` call with the same `now` value, so a
  double-counted visit is bit-identical and collapses.
- **Do not retune `QUALIFY_MIN`.** Site-level rollup raises every site's decayed
  score (more visits per row), so slightly more sites will clear the 0.5 threshold.
  That is the intended effect — genuinely-returned-to sites qualifying — and the
  existing `rankFavorites` tests pin the threshold. Note it; don't pre-emptively
  change it.

## Implementation

### 1. Add a shared site-key helper

**New file**: `src/lib/utils/siteKey.js`

Pure helper `siteKey(url)` returning the canonical host for a URL: lowercase host,
leading `www.` stripped, no scheme/path/query/hash. Returns `''` for a
non-parseable input (mirroring `normalizeUrl`'s defensive fallback). This is the
key for the `siteVisits` store and the grouping key for `rankFavorites`.

Reuse `normalizeUrl`'s host-derivation logic verbatim so the two agree; do not
re-implement `www.`-stripping a second way.

### 2. Persist visits in a site-keyed store the URL cap can't evict

**File**: `service_worker.js`

- Mirror `siteKey` into the service worker (it cannot import the ES module) next
  to the existing `pruneVisits` mirror, following the established
  GAUGE / AUTO_CLOSE / `VISIT_RETENTION_MS` mirroring convention. Add a comment
  pointing at `src/lib/utils/siteKey.js` as the source of truth.
- In `newUrl` (line ~480), also read the `siteVisits` map, append `now` to
  `siteVisits[siteKey(url)]`, and prune it with the existing `pruneVisits`
  (retention + `MAX_VISITS`). Write it back in the same `updates` object so the
  visit and the URL record land in one `chrome.storage.local.set`.
- Leave the existing `url-*` record write (`visitCount`, `visits`) exactly as-is
  for backward compatibility and History.
- Crucially: `siteVisits` is **never touched by the eviction branch**. Evicting a
  `url-*` key must no longer be able to destroy a site's stats.

### 3. Make `allUrls` a true LRU and raise the cap

**File**: `service_worker.js`

- In `newUrl`, replace the "only insert when absent" branch with move-to-front on
  **every** visit: find the key's index, splice it out if present, then `unshift`.
  `allUrls` finally means what every consumer already assumes it means.
- Introduce `const MAX_TRACKED_URLS = 500;` and use it in place of the two literal
  `250`s (the `length >= 250` guard, `slice(250)`, and `slice(0, 250)`).
- **Also fix `closeUrl`** (line ~562): when `urlKey` is absent,
  `allUrls.indexOf(urlKey)` is `-1` and `allUrls.splice(0, 0, allUrls.splice(-1, 1)[0])`
  moves the *last* element to the front — silently scrambling recency order. Guard
  on `oldIndex > -1` and return early otherwise. (Found while tracing the eviction
  path; small, in the same function family, and it corrupts the very ordering this
  plan is making load-bearing.)

### 4. Rank Favorites by site, sourced from the durable store

**File**: `src/lib/utils/rankFavorites.js`

- Accept `options.siteVisits` (the persisted map; defaults to `{}`).
- Group candidates by `siteKey(candidateUrl)` instead of `normalizeUrl(url)`. The
  representative (the row's title, favicon, and click target) stays the
  most-recent — i.e. lowest-index — member, which is the existing rule.
- Resolve a group's timestamps as the **deduped union** of `siteVisits[host]` and
  the group's merged per-record `visits` (the latter still flows through
  `visitsFor`, preserving the legacy `seedVisitsFromCount` migration path), then
  `pruneVisits` the result. Dedupe by exact epoch-ms.
- Everything downstream is unchanged: `decayedVisitScore`, the `qualifyMin` gate,
  the open-tab discount (drop the newest timestamp when any variant of the site is
  open), the sort, and the returned row shape
  (`visitCount` = merged length, `lastVisit`, `recentVisits`).

### 5. Feed the store into the Favorites views

**Files**: `src/lib/components/Favorites/Favorites.jsx`,
`src/lib/pages/ViewAllFavorites/ViewAllFavorites.jsx`

Read `siteVisits` from storage alongside `allUrls` / url records and pass it to
`rankFavorites` as `options.siteVisits`. No JSX changes: `FavoriteRow` already
renders `visitCount`, `lastVisit`, and the day/week sparklines from
`recentVisits`, and those now carry site-level, retention-bounded data.

Rows will now read e.g. "23 visits" for `espn.com` and the 7-week sparkline will
finally have data across the full window rather than resetting to a single bar.

## Reused existing code

- `pruneVisits` from `src/lib/utils/visitDecay.js` (glossary: `pruneVisits`) — and
  its service-worker mirror (glossary: `pruneVisits` @ `service_worker.js`) —
  applied unchanged to the new `siteVisits` arrays.
- `VISIT_RETENTION_MS`, `MAX_VISITS`, `HALF_LIFE_MS`, `QUALIFY_MIN` from
  `src/lib/utils/visitDecay.js` — the retention/cap/decay contract is already
  correct; only the storage that honors it changes.
- `decayedVisitScore` from `src/lib/utils/visitDecay.js` (glossary:
  `decayedVisitScore`) — scoring is untouched.
- `seedVisitsFromCount` / `visitsFor` from `src/lib/utils/rankFavorites.js`
  (glossary: `seedVisitsFromCount`, `visitsFor`) — the legacy `visitCount`-only
  migration path stays intact and now feeds the union.
- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` — its host derivation
  (lowercase, strip `www.`) is the basis for the new `siteKey`.
- `isTrackableUrl` from `src/lib/utils/isTrackableUrl.js` — the http(s)-only gate
  in `newUrl` and `rankFavorites` is unchanged.
- `bucketVisitsByDay` / `bucketVisitsByWeek` (glossary: both) and `UsageSparkline`
  — consume `recentVisits` as-is; no signature change.
- `samePageKey` from `src/lib/utils/samePageKey.js` — the open-tab cue keeps using
  page identity.

## Reproduction Test

Pins the ordering defect at the root of the history loss: `newUrl` does not move a
revisited key back to the front of `allUrls`, so a frequently-visited site drifts
to the tail and is evicted (deleting its `visits`).

**Target**: `service_worker.test.js` — in the existing `describe('newUrl')` block
(alongside `prepends an unseen url key to allUrls`). Run with
`codeyam-editor editor refresh-tests --test service_worker`.

```js
// A REVISIT moves the url key back to the front of allUrls. allUrls is the
// recency list the 250/500-key eviction trims from the tail, so a key that
// never moves on revisit drifts out and its stored `visits` are deleted —
// resetting a daily-visited site to "1 visit".
it('moves a revisited url key to the front of allUrls', async () => {
  chrome.storage.local.get.mockImplementation((_q, cb) =>
    cb({ allUrls: ['url-https://new.com', 'url-a', 'url-b'], labels: {} })
  );
  const updates = await fns.newUrl(1, 'https://b');
  expect(updates.allUrls[0]).toBe('url-https://b');
  expect(updates.allUrls).toHaveLength(3);
});
```

Status: PROPOSED — confirm red at execution. Expected failure: `newUrl` takes the
`indexOf(urlKey) === -1` branch only, so for an already-present key it never
touches `allUrls` and leaves `updates.allUrls` **undefined** — the
`expect(updates.allUrls[0])` line throws `TypeError: Cannot read properties of
undefined (reading '0')`. (Adjust the seeded key to match `getUrlKey`'s
`url-<url>` form when materializing; the assertion — revisited key ends up at
index 0, list length unchanged — is the contract.)

A second test worth adding in the same pass (not required to prove the bug):
`siteVisits[host]` survives a `url-*` eviction, i.e. the durable-store guarantee.

## Scenarios to Demonstrate

- **The bug, before/after** — a favorite whose record was evicted and recreated:
  "1 visit · 12h ago" with a single sparkline bar, versus the same site showing its
  true 8-week history after the fix.
- **Heavy content site (ESPN)** — homepage plus a dozen article URLs; one rolled-up
  row with a high visit count and a full 7-week sparkline, rather than a homepage
  row at 1 visit and a dozen orphan article rows.
- **Eviction pressure** — more than 500 distinct URLs browsed since a site's last
  visit; the `url-*` record is evicted, but the site's `siteVisits` history and its
  Favorites rank survive intact.
- **Legacy migration** — a pre-upgrade record with `visits` (or only `visitCount`)
  and no `siteVisits` entry: rank and count are preserved on first load, and no
  visit is double-counted after the next real visit.
- **Empty state** — a fresh profile with no `siteVisits` key at all; Favorites
  renders its empty state rather than throwing.
- **Edge — open tab discount** — a site open in a non-pinned tab still has its
  in-progress visit discounted, now at the site level.
- **Edge — cosmetic variants** — `http://www.espn.com/` and `https://espn.com`
  collapse into the single ESPN row (host-level grouping subsumes the old
  `normalizeUrl` de-duplication).
