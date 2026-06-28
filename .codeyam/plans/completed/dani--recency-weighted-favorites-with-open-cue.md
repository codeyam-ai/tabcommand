---
title: "dani -- Recency-Weighted Favorites With Open Cue"
mode: ui
createdAt: "2026-06-28T12:00:00Z"
source: manual
prefix: "dani"
---

## Summary

Make the Favorites sidebar section read as "yes, these are my favorite
websites over the past month." Today Favorites ranks purely on a lifetime
`visitCount` that never decays, so a site you hammered six months ago and
abandoned still outranks one you use daily now. We will re-weight the
existing ranking so recency pulls genuinely-current sites to the top and
lets stale heavy-use sites fade — **without** any service-worker data-model
change (no new stored fields). We also raise the list from 5 to up to 10
entries (only ones that still clear the earned-their-place threshold, so
"10 if justified"), and add a visual cue — a subtle accent-tinted row
background — for any favorite that is currently open in a tab.

## Key Decisions

- **Re-weight, don't re-instrument.** Per the scope decision, we keep the
  current data model (records carry only `{ url, title, favicon,
  visitCount }`; there are no per-visit timestamps). Recency is derived from
  each site's position in `allUrls` — the recency-ordered key array the
  service worker already maintains (newest at index 0, capped at 250). This
  is the same recency signal `rankFavorites` already uses as a tiebreak; we
  promote it from pure tiebreak to a decay weight on the score. A true
  rolling 30-day window would require recording visit timestamps in
  `service_worker.js` and migrating existing records — deliberately out of
  scope for this plan.
- **Qualification stays frequency-based; only ordering changes.** The
  minimum-visit gate (`MIN_VISITS = 2`, on the *effective* visit count after
  the open-tab discount and variant aggregation) is what makes an entry
  "justified." We keep that gate untouched so "10 if justified" means "up to
  10 sites that each genuinely earned a place." The recency decay multiplies
  the *score used for ordering*, not the qualification test — so a recent
  one-off visit still can't sneak in, and a frequent site never silently
  drops below threshold just because it's a little older.
- **Recency decay is a bounded linear falloff with a floor**, so frequency
  still matters: the newest qualifying site keeps full weight, the oldest
  retained site keeps a `RECENCY_FLOOR` fraction (≈0.25) of its score rather
  than collapsing to zero. This makes a daily-used recent site outrank a
  long-abandoned heavy-use one, while a hugely-visited slightly-older site
  isn't unfairly buried. Exact curve/floor is a tactical detail for the
  editor; the contract is "monotonic in recency, never zero, frequency still
  dominates within a similar recency band."
- **"Open" cue = open in a non-pinned tab.** Sites open in a Chrome-*pinned*
  tab are already excluded from Favorites entirely, so the only favorites
  that can render while open are the non-pinned ones already tracked in
  `openKeys`. The cue therefore reuses that exact set — no new state. We
  compute the flag inside `rankFavorites` during variant grouping (a site
  may be open under a different cosmetic URL variant than the row's
  representative), and surface it as an `isOpen` field on each returned row.
- **Cue is a background color, per the request** — a subtle accent tint
  built on the existing lime brand token (`--c-lime-fg` / `--brand-command`),
  kept visually distinct from the existing hover background (`--c-raised`)
  so an open row reads as highlighted even at rest and the hover affordance
  still works.

## Implementation

### 1. Add recency-decay weighting and an `isOpen` flag to the ranking

**File**: `src/lib/utils/rankFavorites.js`

- Introduce a `RECENCY_FLOOR` constant (≈0.25) and a small pure helper that
  maps a candidate's `index` (position in `allUrls`) and the total length to
  a weight in `[RECENCY_FLOOR, 1]` — newest → 1, oldest retained → floor.
  Keep it pure and trivially unit-testable, matching the file's existing
  "no storage, no DOM" discipline.
- In the final ranking, order by `effectiveVisits * recencyWeight(group.index,
  allUrls.length)` descending, keeping the raw recency `index` as the
  deterministic tiebreak (so equal weighted scores stay stable, preserving
  the existing tiebreak contract).
- **Leave the qualification filter on raw `effectiveVisits >= minVisits`** —
  the decay must not change who qualifies, only the order.
- During variant grouping, track whether *any* member of a group is in
  `options.openKeys`; carry that onto the group and emit it as `isOpen` on
  the returned row shape (alongside `urlKey`, `url`, `title`, `favicon`).
  The open-tab visit discount already in place is unchanged — `isOpen` is
  purely a render hint.
- Update the file's header comment to describe the frequency × recency-decay
  blend (the current comment says recency is only a tiebreak) and the new
  `isOpen` field, so the glossary description regenerates accurately.

### 2. Raise the limit to 10 and pass `isOpen` through to the row

**File**: `src/lib/components/Favorites/Favorites.jsx`

- Change `FAVORITES_LIMIT` from `5` to `10`. Because qualification is
  unchanged, installs without 10 genuinely-earned favorites simply render
  fewer rows — "10 if justified."
- Read `favorite.isOpen` from each ranked row and apply a modifier class
  (e.g. `Favorites-item--open`) on the row `div` when true. No new storage
  reads are needed — `openKeys` is already built here from `activeTabs` and
  passed into `rankFavorites`, which now returns the flag.

### 3. Style the "already open" row

**File**: `src/lib/components/Favorites/Favorites.css`

- Add a `.Favorites-item--open` rule giving a subtle accent-tinted
  background derived from the lime brand token (`--c-lime-fg`) — e.g. a
  low-opacity tint, optionally with a thin left accent stripe — chosen to
  stay legible in both dark and light themes (both define `--c-lime-fg`).
- Ensure it composes sensibly with `.Favorites-item:hover` (`--c-raised`):
  hover should still give feedback on an open row, and the open tint must
  remain visible at rest. Order/specificity should keep the open state
  readable whether or not the row is hovered.

### 4. Update unit tests for the new ranking and flag

**File**: `src/lib/utils/rankFavorites.test.js`

- Add a test: a more-recent, lower-frequency qualifying site outranks a
  much-older, higher-frequency one once both clear the threshold —
  demonstrating recency decay flips an order that frequency alone would not.
- Add a test: the recency decay does **not** change qualification — a site
  that clears `MIN_VISITS` still appears even when it's the oldest entry
  (weight = floor, not zero).
- Add a test: `isOpen` is `true` for a returned row whose site is in
  `openKeys` (including when the open variant differs from the row's
  representative URL) and `false` otherwise.
- Re-check the existing "ranks frequency-first" and "recency tiebreak" tests
  against the new weighted ordering; adjust expected orders only where the
  decay legitimately changes them, and keep the de-dup, threshold,
  open-discount, exclusion, and limit tests intact.

### 5. Reflect the new behavior in the component test

**File**: `src/lib/components/Favorites/Favorites.test.jsx`

- Add/extend a test asserting that a favorite whose `urlKey` is in the
  non-pinned `activeTabs` set renders with the `Favorites-item--open`
  modifier class, and a non-open favorite does not.
- Confirm the section now renders up to 10 rows when that many qualify.

## Reused existing code

- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — extended in place; already owns variant de-dup, the
  open-tab discount via `openKeys`, the `minVisits` gate, and recency-as-
  tiebreak. The plan promotes its existing recency signal to a weight.
- `usableTitle` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `usableTitle`) — unchanged candidate filter.
- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` — unchanged; still the
  basis for collapsing cosmetic URL variants (and now for grouping the
  `isOpen` check across variants).
- `Favorites` component from `src/lib/components/Favorites/Favorites.jsx`
  (glossary entry: `Favorites`) — already derives `excludedKeys` (pinned +
  hidden) and `openKeys` (non-pinned open) from `activeTabs`; we reuse
  `openKeys` for both the existing discount and the new cue.
- Existing Favorites scenarios under `.codeyam/scenarios/`
  (`favorites-populated`, `favorites-frequency-boost`,
  `favorites-open-tab-discounted`, `favorites-pinned-tab-excluded`,
  `favorites-single-favorite`, `favorites-duplicate-urls-collapsed`) — the
  baselines new scenarios extend and that should be re-verified for unchanged
  intent.
- Theme tokens `--c-lime-fg` / `--brand-command` and `--c-raised` from
  `src/index.css` — reused for the open-row tint and to stay clear of the
  hover background.

## Scenarios to Demonstrate

- **Ten justified favorites** — a rich install with ≥10 sites clearing the
  visit threshold, showing the section fill to the new 10-row cap.
- **Recent beats stale** — a daily-used recent site ranked above a
  long-abandoned, higher-lifetime-count site, demonstrating recency decay
  (the headline "reflects my past month" behavior).
- **Favorite currently open is highlighted** — a qualifying favorite open in
  a non-pinned tab rendered with the accent-tinted background, alongside
  non-open rows for contrast.
- **Open + frequent still ranks and is cued** — a site frequent enough to
  survive the open-tab visit discount, shown both ranked and highlighted (so
  the cue isn't confused with the discount that can drop borderline sites).
- **Fewer than ten** — a modest install with only a few qualifying sites,
  confirming "10 if justified" renders just the earned rows, not padding.
- **Empty state** — an install with no site clearing the threshold renders
  nothing (unchanged).
