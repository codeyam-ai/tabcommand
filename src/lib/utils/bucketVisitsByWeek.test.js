import { describe, it, expect } from 'vitest';
import { bucketVisitsByWeek, SPARK_WEEKS } from './bucketVisitsByWeek';

const DAY = 1000 * 60 * 60 * 24;
const WEEK = DAY * 7;

// bucketVisitsByWeek turns visit timestamps into per-week counts over a trailing
// window, oldest week first, so the long-range sparkline can draw one bar per
// week. These tests pin the window size, weekly bucket placement, aggregation,
// and out-of-window handling.
describe('bucketVisitsByWeek', () => {
  const now = 1_700_000_000_000;

  // Default window length matches SPARK_WEEKS, one entry per week.
  it('returns an array of SPARK_WEEKS zero counts for no visits', () => {
    const result = bucketVisitsByWeek([], now);
    expect(result).toHaveLength(SPARK_WEEKS);
    expect(result.every((c) => c === 0)).toBe(true);
  });

  // A non-array input is tolerated and yields the empty window.
  it('tolerates a non-array visits argument', () => {
    expect(bucketVisitsByWeek(undefined, now)).toHaveLength(SPARK_WEEKS);
    expect(bucketVisitsByWeek(null, now).every((c) => c === 0)).toBe(true);
  });

  // This week's visit lands in the newest (last) bucket.
  it('places a visit this week in the last bucket', () => {
    const result = bucketVisitsByWeek([now - 2 * DAY], now);
    expect(result[result.length - 1]).toBe(1);
    expect(result.slice(0, -1).every((c) => c === 0)).toBe(true);
  });

  // Multiple visits within the same week aggregate into one bucket — the whole
  // point of the weekly view (it varies in height where the daily view is flat).
  it('aggregates same-week visits into one bucket', () => {
    const result = bucketVisitsByWeek([now - 1 * DAY, now - 3 * DAY, now - 6 * DAY], now);
    expect(result[result.length - 1]).toBe(3);
  });

  // Visits spread across weeks land in distinct, correctly-ordered buckets.
  it('spreads visits across week buckets oldest-first', () => {
    const result = bucketVisitsByWeek([now, now - 2 * WEEK, now - 2 * WEEK], now, 4);
    // this week -> index 3; two weeks ago -> index 1
    expect(result).toEqual([0, 2, 0, 1]);
  });

  // A visit older than the window (or in the future) is dropped, not clamped.
  it('ignores visits outside the window', () => {
    const older = now - 10 * WEEK;
    const future = now + 2 * WEEK;
    const result = bucketVisitsByWeek([older, future], now);
    expect(result.every((c) => c === 0)).toBe(true);
  });
});
