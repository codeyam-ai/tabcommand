import { describe, it, expect } from 'vitest';
import {
  pruneVisits,
  decayedVisitScore,
  seedVisitsFromCount,
  HALF_LIFE_MS,
  VISIT_RETENTION_MS,
  MAX_VISITS,
  QUALIFY_MIN,
} from './visitDecay';

const DAY = 1000 * 60 * 60 * 24;

// pruneVisits bounds a per-site visit-timestamp array: it drops entries older
// than the retention horizon, caps the length to the newest MAX_VISITS, and
// returns a clean ascending array of finite numbers. These tests pin that.
describe('pruneVisits', () => {
  const now = 1_700_000_000_000;

  // Garbage / undefined input never throws; it yields an empty array.
  it('returns [] for non-array or empty input', () => {
    expect(pruneVisits(undefined, now)).toEqual([]);
    expect(pruneVisits(null, now)).toEqual([]);
    expect(pruneVisits([], now)).toEqual([]);
  });

  // Visits older than the retention horizon are dropped.
  it('drops visits older than the retention horizon', () => {
    const fresh = now - 1 * DAY;
    const stale = now - (VISIT_RETENTION_MS + DAY);
    expect(pruneVisits([stale, fresh], now)).toEqual([fresh]);
  });

  // Non-finite / non-numeric entries are filtered out.
  it('filters out non-finite entries', () => {
    const good = now - DAY;
    expect(pruneVisits([good, NaN, Infinity, 'x'], now)).toEqual([good]);
  });

  // The result is sorted ascending regardless of input order.
  it('returns visits sorted ascending', () => {
    const a = now - 3 * DAY;
    const b = now - 2 * DAY;
    const c = now - 1 * DAY;
    expect(pruneVisits([c, a, b], now)).toEqual([a, b, c]);
  });

  // More than MAX_VISITS entries keep only the newest MAX_VISITS.
  it('caps length to the newest MAX_VISITS', () => {
    const many = [];
    for (let i = 0; i < MAX_VISITS + 10; i++) many.push(now - i * 1000);
    const result = pruneVisits(many, now);
    expect(result).toHaveLength(MAX_VISITS);
    // Newest retained is now; oldest retained is now - (MAX_VISITS-1)*1000.
    expect(result[result.length - 1]).toBe(now);
    expect(result[0]).toBe(now - (MAX_VISITS - 1) * 1000);
  });
});

// decayedVisitScore sums each visit's exponentially-decayed weight, where a
// fresh visit is worth 1.0 and a visit one half-life old is worth 0.5.
describe('decayedVisitScore', () => {
  const now = 1_700_000_000_000;

  // No visits -> zero score, no throw.
  it('returns 0 for empty or non-array input', () => {
    expect(decayedVisitScore([], now)).toBe(0);
    expect(decayedVisitScore(undefined, now)).toBe(0);
  });

  // A single fresh visit is worth exactly 1.0.
  it('scores a fresh visit as 1', () => {
    expect(decayedVisitScore([now], now)).toBeCloseTo(1, 5);
  });

  // A visit one half-life old is worth 0.5.
  it('scores a half-life-old visit as 0.5', () => {
    expect(decayedVisitScore([now - HALF_LIFE_MS], now)).toBeCloseTo(0.5, 5);
  });

  // Two visits sum their decayed weights.
  it('sums decayed weights across visits', () => {
    const score = decayedVisitScore([now, now - HALF_LIFE_MS], now);
    expect(score).toBeCloseTo(1.5, 5);
  });

  // A future timestamp (clock skew) is clamped to a weight of 1, not >1.
  it('clamps a future visit to weight 1', () => {
    expect(decayedVisitScore([now + HALF_LIFE_MS], now)).toBeCloseTo(1, 5);
  });

  // A single visit at exactly one half-life sits right at QUALIFY_MIN, the
  // boundary a Favorite must clear — pinning the threshold intent.
  it('puts a one-half-life visit at the qualification threshold', () => {
    expect(decayedVisitScore([now - HALF_LIFE_MS], now)).toBeCloseTo(QUALIFY_MIN, 5);
  });
});

// seedVisitsFromCount synthesizes a recent visit history for a legacy record
// that has a visitCount but no timestamps, so it keeps a sensible rank on
// upgrade instead of vanishing.
describe('seedVisitsFromCount', () => {
  const now = 1_700_000_000_000;

  // A zero / missing count yields no visits.
  it('returns [] for a zero or missing count', () => {
    expect(seedVisitsFromCount(0, now)).toEqual([]);
    expect(seedVisitsFromCount(undefined, now)).toEqual([]);
  });

  // A count of one seeds a single visit at now.
  it('seeds a single visit at now for count 1', () => {
    expect(seedVisitsFromCount(1, now)).toEqual([now]);
  });

  // The seeded array length equals the count (capped at MAX_VISITS).
  it('seeds count timestamps, capped at MAX_VISITS', () => {
    expect(seedVisitsFromCount(5, now)).toHaveLength(5);
    expect(seedVisitsFromCount(MAX_VISITS + 20, now)).toHaveLength(MAX_VISITS);
  });

  // Seeded visits are recent and end at now, so a migrated favorite qualifies.
  it('seeds recent visits ending at now that clear the threshold', () => {
    const visits = seedVisitsFromCount(3, now);
    expect(Math.max(...visits)).toBe(now);
    // All within the last few days, so the decayed score clears QUALIFY_MIN.
    expect(decayedVisitScore(visits, now)).toBeGreaterThan(QUALIFY_MIN);
    expect(visits.every((ts) => ts <= now && ts > now - 5 * DAY)).toBe(true);
  });

  // The result is sorted ascending, matching pruneVisits' contract.
  it('returns seeded visits sorted ascending', () => {
    const visits = seedVisitsFromCount(4, now);
    const sorted = [...visits].sort((a, b) => a - b);
    expect(visits).toEqual(sorted);
  });
});
