import { describe, it, expect } from 'vitest';
import { bucketByDay, HISTORY_BUCKETS } from './historyBuckets';

// A fixed "now": 2026-06-27 15:00 local.
const NOW = new Date(2026, 5, 27, 15, 0, 0).getTime();
const startOfToday = new Date(NOW).setHours(0, 0, 0, 0);
const DAY = 1000 * 60 * 60 * 24;

describe('bucketByDay', () => {
  // a timestamp since local midnight buckets into Today
  it('buckets a timestamp from today into Today', () => {
    expect(bucketByDay(startOfToday + 1000, NOW)).toBe('Today');
    expect(bucketByDay(NOW, NOW)).toBe('Today');
  });

  // the prior calendar day buckets into Yesterday
  it('buckets a timestamp from yesterday into Yesterday', () => {
    expect(bucketByDay(startOfToday - 1000, NOW)).toBe('Yesterday');
    expect(bucketByDay(startOfToday - DAY + 1000, NOW)).toBe('Yesterday');
  });

  // anything older than yesterday buckets into Earlier this week
  it('buckets older timestamps into Earlier this week', () => {
    expect(bucketByDay(startOfToday - DAY - 1000, NOW)).toBe('Earlier this week');
  });

  // a missing timestamp falls into Earlier this week so the tab still appears
  it('treats a missing timestamp as Earlier this week', () => {
    expect(bucketByDay(null, NOW)).toBe('Earlier this week');
    expect(bucketByDay(undefined, NOW)).toBe('Earlier this week');
  });

  // the bucket order is exported for rendering
  it('exposes the bucket order', () => {
    expect(HISTORY_BUCKETS).toEqual(['Today', 'Yesterday', 'Earlier this week']);
  });
});
