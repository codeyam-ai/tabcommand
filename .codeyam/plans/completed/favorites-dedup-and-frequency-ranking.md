---
title: "Favorites: De-duplicate URLs & Rank by Earned Frequency"
mode: ui
createdAt: "2026-06-28T12:00:00Z"
source: manual
---

## Summary

The Favorites sidebar section repeats the "same" site multiple times and is
ordered recency-first, so it reads like recent history rather than a list of
genuinely favorite sites. URLs are keyed as `url-<url-without-#hash>`, so two
URLs that differ only by a trailing slash, `http`/`https`, or `www` become
distinct keys and render as separate, visually-identical rows. `rankFavorites`
never collapses them and orders by a recency-dominant blend
(`RECENCY_WEIGHT 0.7 / VISIT_WEIGHT 0.3`).

This change makes each site appear **once** (URL-normalized), orders Favorites
**frequency-first** (most-visited at the top, recency as the tiebreak), and adds
two guards so Favorites reflects *earned* preference rather than current
activity: (1) a **minimum-visit threshold** so one-off visits never appear, and
(2) a **currently-open-tab discount** so a tab that's still open doesn't have its
in-progress visit padding the ranking (preventing Favorites from just mirroring
the open tabs).

## Key Decisions

- **Normalize, then de-duplicate** — collapse URLs that differ only by trailing
  slash, `#fragment` (already stripped at key creation), or `http`/`https`/`www`.
  Query strings are preserved (genuinely different pages stay distinct). A new
  pure `normalizeUrl` util produces the grouping key. Chosen over exact-string
  dedup (wouldn't catch the slash/www/protocol variants the user is seeing) and
  over one-row-per-domain (too aggressive — would hide distinct pages of the same
  site).
- **Frequency-first ordering with recency tiebreak** — sort by aggregated
  effective visit count descending, then by recency (position in `allUrls`).
  Replaces the recency-dominant 0.7/0.3 blend, which is what made Favorites read
  like recent history. The `RECENCY_WEIGHT`/`VISIT_WEIGHT` blend is removed.
- **Minimum-visit threshold (`MIN_VISITS`, default 2)** — a site must have at
  least 2 *effective* (post-discount, post-aggregation) visits to qualify. This
  is the concrete mechanism for "don't let sites visited just once show up at the
  top" — a once-visited site simply isn't a favorite yet. Knob lives in
  `rankFavorites`; surfaced as a tunable constant.
- **Currently-open-tab discount** — for each candidate, subtract the number of
  currently-open, non-pinned tabs pointing at that key from its visit count
  before thresholding/ranking (floored at 0). This is the "the visit shouldn't
  count yet while the tab is open" requirement. Pinned tabs remain *fully
  excluded* (existing behavior); non-pinned open tabs are *discounted* (still
  eligible as favorites once they've been visited enough across closed sessions).
- **Aggregate counts across collapsed duplicates** — when slash/www/protocol
  variants merge, their effective visit counts are summed so the site gets credit
  for all variants, and the most-recent variant is the representative row
  (its `urlKey`/`url` are what the row opens and renders).
- **Ranking stays pure & in `rankFavorites`** — all new logic (discount,
  aggregate, threshold, sort) lives in the pure util so it remains unit-testable
  with no storage/DOM. `Favorites.jsx` only gathers the new inputs (open keys)
  and passes them in.

## Implementation

### 1. Add a pure URL-normalization util

**New file**: `src/lib/utils/normalizeUrl.js`

Export `normalizeUrl(url)` returning a canonical grouping key for de-duplication:

- Lowercase the scheme and host.
- Treat `http` and `https` as equivalent (drop the scheme from the key, or map
  both to a single sentinel).
- Strip a leading `www.` from the host.
- Strip a trailing slash from the path (but keep `/` for a bare-root path
  consistently — pick one canonical form, e.g. no trailing slash).
- Drop the `#fragment` (defensive; keys already strip it via `getUrlKey`).
- **Preserve** the query string.
- Be defensive: if the input isn't a parseable URL, fall back to the trimmed raw
  string so nothing throws (mirrors how `rankFavorites` already tolerates
  key-derived URLs). Prefer the `URL` constructor with a try/catch fallback.

Add a glossary-worthy doc comment describing the contract (what is and isn't
collapsed), matching the house style of the other `src/lib/utils` helpers.

### 2. Add unit tests for the normalizer

**New file**: `src/lib/utils/normalizeUrl.test.js`

Cover: trailing-slash equivalence, `http` vs `https`, `www.` vs bare host,
fragment stripping, query strings kept distinct, case-insensitive host, and the
non-URL fallback (no throw).

### 3. Rework ranking: discount, aggregate, threshold, frequency-first sort

**File**: `src/lib/utils/rankFavorites.js`

- Change the signature to accept the new inputs without breaking the pure
  contract. Suggested: an options object as the 5th parameter, e.g.
  `rankFavorites(allUrls, urlRecords, limit = 5, excludedKeys, options = {})`
  where `options` carries `{ openKeys = new Set(), minVisits = MIN_VISITS }`.
  (Editor may choose positional params instead; keep it readable.)
- Introduce `const MIN_VISITS = 2;` and **remove** `RECENCY_WEIGHT` /
  `VISIT_WEIGHT` and the blended-score math.
- Build candidates as today (skip `excludedKeys`, require `usableTitle`, keep
  original index for recency).
- Compute each candidate's **effective visit count**:
  `max(0, (record.visitCount || 0) - openCount)` where `openCount` is the number
  of `openKeys` entries equal to this `urlKey`. (If `openKeys` is a `Set`,
  subtract 1 when present; if callers can pass duplicates, accept a count map —
  pick the simplest shape that lets `Favorites.jsx` express "open in N non-pinned
  tabs". A `Set` + subtract-1 is acceptable for v1; note the simplification.)
- **Group** candidates by `normalizeUrl(record.url || urlKey-without-prefix)`.
  For each group: representative = the lowest-index (most-recent) member;
  group recency = that min index; group effective visits = **sum** of members'
  effective counts.
- **Threshold**: drop any group whose summed effective visits `< minVisits`.
- **Sort** groups by effective visits descending, then by recency (index asc)
  as a deterministic tiebreak.
- `slice(0, limit)` and map to the existing row shape
  (`{ urlKey, url, title, favicon }`) using the representative member, so the
  returned contract (and `Favorites.jsx` rendering) is unchanged.

### 4. Update ranking unit tests for the new contract

**File**: `src/lib/utils/rankFavorites.test.js`

The current tests pin recency-dominant behavior and single-visit records — they
will no longer hold. Replace/extend with tests for the new contract:

- Frequency-first ordering (higher visitCount ranks above a more-recent
  lower-count site).
- Recency tiebreak when effective visit counts are equal.
- `MIN_VISITS` threshold: a single-visit site is excluded; bump it to the
  threshold and it appears.
- De-duplication: `https://x.com`, `https://x.com/`, `http://www.x.com` collapse
  to one row, counts summed, most-recent variant as representative.
- Open-tab discount: a site visited twice but open in one tab drops to effective
  1 and falls below threshold; an unrelated open key doesn't affect others.
- Preserve existing edge cases that still apply: empty/non-array input → `[]`,
  drop keys without a usable title, `excludedKeys` suppression, `limit` cap,
  fewer-than-limit returns all, row shape / url-from-key derivation.

### 5. Feed open-tab info into the ranking from the component

**File**: `src/lib/components/Favorites/Favorites.jsx`

- Keep the existing `excludedKeys` (pinned tabs + `favoritesHidden`) unchanged.
- Additionally derive `openKeys` from `activeTabs`: the `urlKey`s of
  **non-pinned** active tabs (pinned are already excluded entirely). Pass it into
  `rankFavorites` via the new options arg, along with `minVisits` if surfaced as
  a component-level constant.
- No change needed to the `chrome.storage.onChanged` reload triggers — it already
  reloads on `activeTabs` changes, which is exactly when `openKeys` shifts.
- Rendering, click-to-open, and the remove (×) control are unchanged (they key
  off the representative `urlKey`/`url`, which the util still returns).

### 6. Update component tests

**File**: `src/lib/components/Favorites/Favorites.test.jsx`

- Existing tests seed `visitCount: 1`; under `MIN_VISITS = 2` those rows would no
  longer render. Bump seeded counts to at least the threshold so the
  render/exclude/remove tests still exercise their intent.
- Update the "frequently-visited older site climbs" test to assert the stronger
  frequency-first ordering.
- Add a test: two storage keys that normalize to the same site render a **single**
  row.
- Add a test: a site open in a **non-pinned** tab has its current visit discounted
  (e.g. visited twice, open once → drops below threshold and is hidden), while a
  pinned tab stays fully excluded as before.

### 7. Refresh the Favorites scenarios

**Files**: `.codeyam/scenarios/favorites-*.json`

- Audit each scenario's seeded `visitCount`s against `MIN_VISITS = 2`;
  `favorites-populated` already uses 2/3/5/8 (fine), but verify
  `favorites-single-favorite` and any 1-visit fixtures so they still render under
  the new threshold.
- Add a **duplicate-URL** scenario: seed `url-https://github.com/codeyam` and
  `url-https://github.com/codeyam/` (or a `www`/`http` variant) and demonstrate a
  single collapsed row.
- Add an **open-tab-discount** scenario: a site visited exactly at the threshold
  that is currently open in a non-pinned tab, demonstrating it drops out of
  Favorites until the tab closes.
- Re-register/refresh via the editor scenario tooling rather than hand-editing
  ids.

## Reused existing code

- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — the pure ranking util being reworked; keeps its row-shape
  contract so downstream rendering is untouched.
- `usableTitle` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `usableTitle`) — reused unchanged for candidate filtering.
- `Favorites` from `src/lib/components/Favorites/Favorites.jsx` (glossary entry:
  `Favorites`) — already reads `activeTabs` and builds an exclusion set and
  reloads on `activeTabs` changes; extended to also derive `openKeys`.
- Existing `excludedKeys` construction (pinned tabs + `favoritesHidden`) in
  `Favorites.jsx` — preserved; the open-tab discount is additive and distinct
  from pinned-tab exclusion.
- `getUrlKey` (`service_worker.js`) — confirms keys already strip `#hash`, so
  `normalizeUrl` only needs to handle slash/`www`/protocol/query (no
  service-worker change required for this fix).

## Scenarios to Demonstrate

- **Duplicate collapse** — `https://github.com/codeyam`, `.../codeyam/`, and
  `http://www.github.com/codeyam` present as one row, visit counts summed.
- **Frequency-first ordering** — a frequently-visited older site sits above a
  recently-visited but rarely-visited one.
- **One-off excluded** — a site visited exactly once does not appear at all (no
  longer leaks in as "recent history").
- **Open-tab discount** — a site visited twice but currently open in a non-pinned
  tab drops out (effective count 1 < threshold); after the tab closes it returns.
- **Pinned still fully excluded** — existing pinned-tab exclusion behavior
  unchanged.
- **Populated (rich data)** — several qualifying favorites ranked by earned
  frequency.
- **Empty state** — fresh install / nothing above threshold renders nothing.
