// Time-decay scoring primitives for Favorites. A site's rank is the SUM of its
// visits, each discounted by how long ago it happened — a fresh visit is worth
// 1.0 and an older visit is worth less — so a site the user returns to weekly
// outranks an old-but-once-heavily-visited one. Kept pure (no storage, no DOM)
// so it is trivial to unit-test with an injected `now`, and shared by both
// `rankFavorites` (scoring) and the migration seeding. The service worker
// duplicates the prune constants/logic (it can't import this ES module), the
// same way GAUGE / AUTO_CLOSE constants are mirrored there.

const DAY_MS = 1000 * 60 * 60 * 24;

// Exponential half-life: a visit exactly HALF_LIFE_MS old is worth half a fresh
// one. ~7 days means a week-old visit contributes 0.5. Named so the ranking is
// tunable from one place.
export const HALF_LIFE_MS = 7 * DAY_MS;

// How far back per-site visit history is retained (pruned on write). Sized to
// the longest usage view the Favorites "View All" page draws — the 7-week
// sparkline — with a week of margin (8 weeks). Visits this old contribute
// negligible decayed weight to the score (~2^-8), so retaining them costs
// nothing for ranking; they exist so the weekly usage-over-time view has data.
export const VISIT_RETENTION_MS = 56 * DAY_MS;

// Hard cap on retained timestamps per site so a hammered site can't grow its
// history unbounded. Keeps the newest visits (they dominate the decayed score).
export const MAX_VISITS = 50;

// The decayed-score threshold a site must clear to qualify as a Favorite. Set
// just at the value of a single one-week-old visit (0.5): a site visited once
// stays while the visit is fresh and drops ~a week later, and a site visited
// only a couple of times ~two weeks ago falls below it. Tunable; pinned by the
// rankFavorites unit tests.
export const QUALIFY_MIN = 0.5;

// When migrating a legacy record (visitCount but no `visits` array), synthesize
// this many days of recent visits ending at `now` so existing favorites keep a
// sensible rank across the upgrade instead of vanishing.
const SEED_SPAN_MS = 3 * DAY_MS;

// Drop visits older than the retention horizon and cap the array to the most
// recent MAX_VISITS. Returns a new ascending-sorted array of finite epoch-ms
// numbers. Pure; safe on `undefined`/garbage input.
export function pruneVisits(visits, now) {
  if (!Array.isArray(visits)) return [];
  const cutoff = now - VISIT_RETENTION_MS;
  const kept = visits
    .map(Number)
    .filter((ts) => Number.isFinite(ts) && ts > cutoff)
    .sort((a, b) => a - b);
  return kept.length > MAX_VISITS ? kept.slice(-MAX_VISITS) : kept;
}

// Sum of each visit's decayed weight: 2^(-age / halfLife), where a fresh visit
// (age 0, or a clock-skew future timestamp) is worth 1.0. Pure.
export function decayedVisitScore(visits, now, halfLifeMs = HALF_LIFE_MS) {
  if (!Array.isArray(visits) || visits.length === 0) return 0;
  let score = 0;
  for (const ts of visits) {
    const age = now - ts;
    score += age <= 0 ? 1 : Math.pow(2, -age / halfLifeMs);
  }
  return score;
}

// Legacy migration: given a record with `visitCount > 0` but no `visits` array,
// synthesize up to MAX_VISITS recent timestamps spread evenly across the last
// SEED_SPAN_MS ending at `now`. A one-time, non-destructive approximation done
// lazily at score time so a pre-upgrade favorite still ranks sensibly and then
// converges to real timestamps as the user revisits it. Pure.
export function seedVisitsFromCount(visitCount, now) {
  const n = Math.min(Math.max(Math.floor(visitCount || 0), 0), MAX_VISITS);
  if (n === 0) return [];
  if (n === 1) return [now];
  const step = SEED_SPAN_MS / (n - 1);
  const visits = [];
  for (let i = 0; i < n; i++) visits.push(Math.round(now - i * step));
  return visits.sort((a, b) => a - b);
}
