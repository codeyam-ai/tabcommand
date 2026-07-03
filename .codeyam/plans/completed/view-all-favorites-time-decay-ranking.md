---
title: "View All Favorites with Time-Decay Ranking"
mode: ui
createdAt: "2026-07-02T20:43:56Z"
source: manual
---

## Summary

Turn Favorites from a `visitCount`-only ranking into a **time-decayed** one, and
add a full-page "View All" view that makes the ranking legible. Today the
sidebar Favorites section derives its list from a raw per-site `visitCount`
blended with array-position recency — there is no notion of *when* a site was
visited, so an old-but-heavily-visited site can outrank a site the user actually
returns to weekly, and there is no way to see why a site is on the list or in
its position. We will (1) record per-visit timestamps in the service worker,
(2) rewrite `rankFavorites` to score each site as a **sum of time-decayed
visits** (a recent visit is worth more than an old one) with a qualification
threshold tuned so a site visited only once drops after ~a week and a site
visited only twice over ~two weeks also drops, (3) add a `Favorites` "View All >"
link that opens a new full-page `ViewAllFavorites` view listing every qualifying
favorite (uncapped) with its usage stats and a small usage-over-time
visualization so the user can see *why* each favorite is included and ranked
where it is, and (4) show hidden favorites on that page as dimmed rows with a
"Bring back" action that un-hides them.

## Key Decisions

- **Score by decayed visits, not raw count.** Replace the current
  `effectiveVisits * recencyWeight(arrayIndex)` model in `rankFavorites` with
  `score = Σ decay(ageOf(visit))` over each site's recorded visit timestamps.
  Default decay is exponential with a **~7-day half-life** (`2^(-ageDays/7)`), so
  a fresh visit is worth 1.0 and a week-old visit ~0.5. This directly encodes
  "a visit longer ago is less valuable than a recent visit." Half-life is a
  named constant so the editor workflow can tune it.
- **Qualification is a threshold on the decayed score**, tuned to the user's two
  acceptance cases: a site visited **once** falls below the threshold after
  ~1 week (its single visit decays past the cutoff), and a site visited **twice
  over ~two weeks** also falls below it. A starting `QUALIFY_MIN` of ~0.5 (just
  above the value of one week-old visit) satisfies both; treat the exact
  constant as tunable and pin it with the unit tests below. This replaces the
  current fixed `MIN_VISITS = 2` integer gate.
- **Recency signal moves from array position to real time.** `allUrls` position
  stops being the recency input to scoring (it becomes at most a deterministic
  tiebreak for equal scores). Recency now comes from the actual visit
  timestamps, which is more robust and is what the decay already expresses.
- **Bounded per-site visit history.** Store visit timestamps on each `url-*`
  record as a `visits: number[]` array (epoch ms). Prune on write: drop
  timestamps older than a **retention horizon** (default 30 days — comfortably
  past the point where they contribute meaningful decayed weight) and cap the
  array length (e.g. last 50 visits) so storage stays bounded even for
  hammered sites. Keep the existing `visitCount` field untouched for
  backward-compat/display, but base ranking purely on `visits`.
- **Migration: don't let existing favorites vanish on upgrade.** Records created
  before this change have `visitCount` but no `visits` array. On first
  read/score, synthesize a `visits` array for a legacy record from its
  `visitCount` (e.g. `min(visitCount, cap)` timestamps seeded at "recent" within
  the last few days) so current favorites survive the transition, then let real
  timestamps take over as the site is revisited. Do the seeding lazily in
  `rankFavorites`/a shared helper so no destructive storage rewrite is required.
  This is a deliberate one-time approximation, documented in the helper.
- **"View All" is a full page, following the History pattern.** No router exists;
  navigation is a persisted `uxSettings.page` enum switched in `App.jsx`. Add a
  `Pages.FAVORITES` entry and a `ViewAllFavorites` page mirroring
  `src/lib/pages/History/`, reusing the shared `.Page-back` / `.Page-h1` /
  `.Page-intro` classes.
- **Hidden favorites are shown, not filtered, on the View All page.** The sidebar
  keeps excluding `favoritesHidden`; the View All page instead renders them as
  dimmed rows flagged `isHidden`, with a "Bring back" button that removes the
  `urlKey` from `favoritesHidden` (the inverse of the existing `removeFavorite`).

## Implementation

### 1. Record per-visit timestamps in the service worker

**File**: `service_worker.js` (`newUrl`, around lines 449–496)

When a trackable navigation bumps `visitCount`, also append `Date.now()` to a
`visits` array on the same `url-*` record, then prune it: drop entries older than
a `VISIT_RETENTION_MS` horizon (default 30 days) and truncate to a max length
(e.g. last 50). Add the `VISIT_RETENTION_MS` constant near the existing
`MAX_AUTO_CLOSED_TIME` (line 82). Keep the write additive — preserve all existing
`url-*` fields and keep incrementing `visitCount` as today. Example shape:

```
const now = Date.now();
const visits = pruneVisits([...(urlRecord.visits || []), now], now);
updates[urlKey] = { ...urlRecord, visitCount: (urlRecord.visitCount || 0) + 1, visits };
```

Factor the prune (`filter age <= VISIT_RETENTION_MS`, then `slice(-MAX_VISITS)`)
into a tiny pure helper so it is unit-testable and reusable by the migration
seeding.

### 2. Rewrite ranking to a time-decay model

**File**: `src/lib/utils/rankFavorites.js`

Replace the frequency×position model with a time-decay score. New/changed pieces:

- Add `decayedVisitScore(visits, now, halfLifeMs)` — sum of `0.5^(age/halfLife)`
  over the (pruned) visit timestamps. Pure, no storage/DOM (matches the module's
  existing style).
- Replace `MIN_VISITS` with `QUALIFY_MIN` (a decayed-score threshold) and add
  `HALF_LIFE_MS` (~7 days) and reuse `VISIT_RETENTION`/prune semantics from step 1
  (share a helper, or duplicate the pure prune — keep it DRY via
  `src/lib/utils/`).
- `rankFavorites(allUrls, urlRecords, limit, excludedKeys, options)` keeps its
  signature but: for each candidate, derive `visits` (falling back to the
  migration seeding in step 4 when a record has `visitCount > 0` but no
  `visits`), discount an open non-pinned tab's most-recent in-progress visit as
  today (drop the latest timestamp or subtract one fresh unit), sum decayed
  variants across the `normalizeUrl` dedup groups, drop groups below
  `QUALIFY_MIN`, and sort by decayed score desc with recency (latest timestamp,
  then array index) as the deterministic tiebreak.
- Extend each returned row with the stats the View All page needs:
  `{ urlKey, url, title, favicon, isOpen, score, visitCount, lastVisit,
  recentVisits }` where `recentVisits` is the pruned timestamp array (for the
  sparkline) and `lastVisit` is its max. The existing sidebar consumers ignore
  the new fields, so this is additive.
- Add an `options.now` (default injected by callers) so tests can pin "now"
  deterministically instead of relying on wall-clock.

### 3. Extend `rankFavorites` to optionally include hidden favorites

**File**: `src/lib/utils/rankFavorites.js`

The View All page needs hidden favorites *in the list, flagged* rather than
excluded. Add `options.hiddenKeys` (a `Set`): when provided, a candidate whose
key is in `hiddenKeys` is **not** dropped but is scored normally, qualified
normally, and returned with `isHidden: true`. The sidebar continues to pass
hidden keys via `excludedKeys` (unchanged behavior); the page passes them via
`hiddenKeys` instead so they surface dimmed. Add an `options.limit`-bypass path
(or have the page pass a large limit) so "View All" is genuinely uncapped while
the sidebar keeps `FAVORITES_LIMIT = 10`.

### 4. Legacy-record migration helper

**New file**: `src/lib/utils/seedVisitsFromCount.js` (or a helper inside
`rankFavorites.js` if small)

Pure helper that, given a record with `visitCount > 0` and no `visits`, returns a
synthetic recent `visits` array (e.g. `min(visitCount, MAX_VISITS)` timestamps
spread over the last few days ending at `now`). Used lazily by `rankFavorites`
so pre-existing favorites keep a sensible rank on first load and then converge to
real data as the user revisits them. Document that this is a one-time
approximation, not persisted destructively.

### 5. Add the `ViewAllFavorites` page

**New file**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.jsx` (+ `.css`,
`.test.jsx`, `index.js`)

Mirror `src/lib/pages/History/History.jsx`. In a `useEffect`, read
`['allUrls', 'activeTabs', 'favoritesHidden']`, build the pinned-exclusion +
open-discount sets exactly as `Favorites.jsx` does (lines 35–51), then read the
`url-*` records and call `rankFavorites` with a large limit and `hiddenKeys` =
`favoritesHidden` so hidden rows come back flagged. Subscribe to
`chrome.storage.onChanged` the same way `Favorites.jsx` does so a "Bring back"
reflects live. Render:

- `.Page-back` button (`<Icon name="arrowLeft"/> Home`) that resets
  `uxSettings.page` to `Pages.HOME` (copy `History.jsx:9-14`).
- `.Page-h1` "Favorites" + `.Page-intro` explaining the ranking ("Ranked by how
  often and how recently you visit — recent visits count more.").
- One row per favorite with `<Favicon>`, title, and a stats strip: visit count
  (in window), last-visited (relative time), the computed rank score, and a
  small **usage-over-time** visualization built from `recentVisits` (a compact
  inline bar/sparkline — a per-day bucketed bar row is enough; no charting lib).
  This is the "see why it's included and in this order" payload.
- Hidden rows (`isHidden`) rendered with a dimmed class and a **"Bring back"**
  button instead of the remove `×`; clicking it removes the `urlKey` from
  `favoritesHidden` (inverse of `Favorites.jsx:100-112`).
- Row click opens/focuses the tab, reusing the `openFavorite` logic from
  `Favorites.jsx:84-98` (extract to a shared util if convenient).

**File**: `src/lib/pages/index.js` — export the new page.

### 6. Register the page route and navigation

**File**: `src/Constants.jsx`

Add `FAVORITES: 'Favorites'` to the `Pages` object.

**File**: `src/lib/pages/App/App.jsx`

Add a content-area branch `{page.name === Pages.FAVORITES && <ViewAllFavorites />}`
(import from `../ViewAllFavorites`), alongside the existing History/Load branches
(around lines 182–203).

### 7. Add the "View All >" link to the sidebar Favorites section

**File**: `src/lib/components/Favorites/Favorites.jsx` (+ `Favorites.css`)

After the list of favorite rows (after line 145), render a "View All >" link that
navigates to the new page by setting `uxSettings.page = { name: Pages.FAVORITES }`
via `Chrome.get`/`Chrome.set` (same pattern as `History.jsx`'s `back`, or
`App.jsx`'s `changePage`). Style it as a subtle footer link consistent with the
existing `.App-sidebar-link` (Import/Export) treatment. It should render whenever
the Favorites section renders (i.e. whenever there is at least one favorite).

## Reused existing code

- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — extended in place; keep `recencyWeight`/`usableTitle`
  patterns and pure style.
- `isTrackableUrl` from `src/lib/utils/isTrackableUrl.js` (glossary entry:
  `isTrackableUrl`) — candidate gating stays identical.
- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` — cosmetic-variant dedup
  stays identical.
- `Favorites` component from `src/lib/components/Favorites/Favorites.jsx`
  (glossary entry: `Favorites`) — source of the exclusion/open-set derivation,
  `openFavorite`, and the hide-inverse for "Bring back".
- `History` page from `src/lib/pages/History/History.jsx` — structural template
  for the new full page (`.Page-back`/`.Page-h1`/`.Page-intro`, storage-in-effect
  pattern, `back()` navigation).
- `Favicon` (glossary/component export) and `Icon` from `src/lib/components` —
  row favicon + back-arrow / bring-back glyphs.
- `Chrome` wrapper from `src/lib/utils/Chrome/Chrome.js` — all storage reads/writes.
- `Pages` from `src/Constants.jsx` — navigation enum.
- Service-worker `newUrl` in `service_worker.js` (lines 449–496) and the
  `MAX_AUTO_CLOSED_TIME` constant convention (line 82) — where and how to add
  timestamp recording + retention.

## Scenarios to Demonstrate

- **Sidebar Favorites with the new "View All >" link** — a populated Favorites
  section now ending in the link.
- **View All page, rich state** — several qualifying favorites, each showing
  visit count, last-visited, rank score, and the usage-over-time bars; clearly
  ordered by decayed score.
- **Time-decay ordering** — two sites with the *same* raw visit count but
  different recency: the recently-visited one ranks above the stale one
  (demonstrates the new model vs. the old count-only order).
- **Drop-after-a-week** — a site visited exactly once, its visit ~8 days old:
  absent from Favorites and from the View All qualifying list.
- **Twice-over-two-weeks drop** — a site visited only twice spread across ~two
  weeks: also dropped, per the qualification threshold.
- **Hidden favorite on the View All page** — a dimmed row with a "Bring back"
  button; after clicking, it returns to full-opacity and reappears in the sidebar.
- **Legacy record (migration)** — a pre-upgrade record with `visitCount` but no
  `visits` array still appears with a sensible rank (seeded), not missing.
- **Empty state** — no qualifying favorites: the page shows an empty message and
  the sidebar section (and its link) does not render.
