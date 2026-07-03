import { describe, it, expect } from 'vitest';
import { bucketVisitsByDay, SPARK_DAYS } from './bucketVisitsByDay';

const DAY = 1000 * 60 * 60 * 24;

// bucketVisitsByDay turns a list of visit timestamps into per-day counts over a
// trailing window, oldest day first, so the sparkline can draw one bar per day.
// These tests pin the window size, bucket placement, and out-of-window handling.
describe('bucketVisitsByDay', () => {
  const now = 1_700_000_000_000;

  // Default window length matches SPARK_DAYS, one entry per day.
  it('returns an array of SPARK_DAYS zero counts for no visits', () => {
    const result = bucketVisitsByDay([], now);
    expect(result).toHaveLength(SPARK_DAYS);
    expect(result.every((c) => c === 0)).toBe(true);
  });

  // A non-array input is tolerated and yields the empty window.
  it('tolerates a non-array visits argument', () => {
    expect(bucketVisitsByDay(undefined, now)).toHaveLength(SPARK_DAYS);
    expect(bucketVisitsByDay(null, now).every((c) => c === 0)).toBe(true);
  });

  // Today's visit lands in the newest (last) bucket.
  it('places a visit today in the last bucket', () => {
    const result = bucketVisitsByDay([now], now);
    expect(result[result.length - 1]).toBe(1);
    expect(result.slice(0, -1).every((c) => c === 0)).toBe(true);
  });

  // Multiple visits on the same day accumulate in one bucket.
  it('accumulates same-day visits into one bucket', () => {
    const result = bucketVisitsByDay([now, now - 3600 * 1000, now - 7200 * 1000], now);
    expect(result[result.length - 1]).toBe(3);
  });

  // Visits spread across days land in distinct, correctly-ordered buckets.
  it('spreads visits across day buckets oldest-first', () => {
    const result = bucketVisitsByDay([now, now - 2 * DAY, now - 2 * DAY], now, 5);
    // day 0 today -> index 4; two days ago -> index 2
    expect(result).toEqual([0, 0, 2, 0, 1]);
  });

  // A visit older than the window (or in the future) is dropped, not clamped.
  it('ignores visits outside the window', () => {
    const older = now - 40 * DAY;
    const future = now + 2 * DAY;
    const result = bucketVisitsByDay([older, future], now);
    expect(result.every((c) => c === 0)).toBe(true);
  });
});
