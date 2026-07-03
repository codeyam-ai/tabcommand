import { describe, it, expect } from 'vitest';
import { usageMax } from './usageMax';

const DAY = 1000 * 60 * 60 * 24;

// usageMax finds the largest daily-or-weekly bucket count across all favorites,
// so the View All page can scale every sparkline to a common maximum. These
// tests pin the floor, the cross-row max, and the day-vs-week aggregation.
describe('usageMax', () => {
  const now = 1_700_000_000_000;

  // No favorites (or garbage) floors at 1, never 0 — avoids divide-by-zero when
  // scaling bars.
  it('returns 1 for empty or non-array input', () => {
    expect(usageMax([], now)).toBe(1);
    expect(usageMax(null, now)).toBe(1);
    expect(usageMax(undefined, now)).toBe(1);
  });

  // A favorite with no visits still floors the max at 1.
  it('floors at 1 when favorites have no visits', () => {
    expect(usageMax([{ recentVisits: [] }, { recentVisits: null }], now)).toBe(1);
  });

  // The max spans ALL favorites, not just one — the busiest row wins.
  it('takes the max across all favorites', () => {
    const quiet = { recentVisits: [now - 1 * DAY] };
    const busy = { recentVisits: [now - 1 * DAY, now - 1 * DAY, now - 1 * DAY] };
    expect(usageMax([quiet, busy], now)).toBe(3);
  });

  // Weekly aggregation can exceed any single day, so the weekly buckets drive the
  // max when visits spread across a week.
  it('reflects weekly aggregation over daily counts', () => {
    // One visit on each of five different days in the same week: max day = 1 but
    // the week bucket = 5.
    const spread = {
      recentVisits: [
        now - 1 * DAY,
        now - 2 * DAY,
        now - 3 * DAY,
        now - 4 * DAY,
        now - 5 * DAY,
      ],
    };
    expect(usageMax([spread], now)).toBe(5);
  });
});
