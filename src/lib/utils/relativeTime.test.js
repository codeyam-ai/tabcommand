import { describe, it, expect } from 'vitest';
import { relativeTime } from './relativeTime';

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

// relativeTime maps an epoch-ms timestamp to a compact "how long ago" label
// relative to a caller-supplied `now`, bucketed by hour / day / week. These
// tests pin the bucket boundaries and the missing-timestamp behavior.
describe('relativeTime', () => {
  const now = 1_700_000_000_000;

  // A null/zero/undefined timestamp has no meaningful age.
  it('returns never for a missing timestamp', () => {
    expect(relativeTime(null, now)).toBe('never');
    expect(relativeTime(0, now)).toBe('never');
    expect(relativeTime(undefined, now)).toBe('never');
  });

  // Under an hour reads as just now.
  it('returns just now within the last hour', () => {
    expect(relativeTime(now - 5 * 60 * 1000, now)).toBe('just now');
    expect(relativeTime(now, now)).toBe('just now');
  });

  // Between one hour and one day reads in whole hours.
  it('returns whole hours within the last day', () => {
    expect(relativeTime(now - 3 * HOUR, now)).toBe('3h ago');
    expect(relativeTime(now - 23 * HOUR, now)).toBe('23h ago');
  });

  // From one day up to two weeks reads in whole days.
  it('returns whole days from one day to under two weeks', () => {
    expect(relativeTime(now - 1 * DAY, now)).toBe('1d ago');
    expect(relativeTime(now - 13 * DAY, now)).toBe('13d ago');
  });

  // Two weeks and beyond reads in whole weeks.
  it('returns whole weeks at two weeks and beyond', () => {
    expect(relativeTime(now - 14 * DAY, now)).toBe('2w ago');
    expect(relativeTime(now - 30 * DAY, now)).toBe('4w ago');
  });

  // A future timestamp (clock skew) is clamped to just now, never negative.
  it('clamps a future timestamp to just now', () => {
    expect(relativeTime(now + 5 * DAY, now)).toBe('just now');
  });
});
