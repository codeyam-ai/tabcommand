import { describe, it, expect } from 'vitest';
import { historyTimestamp } from './historyTimestamp';

// A fixed "now": 2026-06-27 15:00 local. All fixtures are offsets from it, so
// the helper's purity is what's under test — no clock reads.
const NOW = new Date(2026, 5, 27, 15, 0, 0).getTime();
const HOUR = 1000 * 60 * 60;
const DAY = 24 * HOUR;

describe('historyTimestamp', () => {
  // the whole point of the fix: a page visited today with no autoClosed entry
  // still reports a real time instead of null
  it('reads the latest visit when there is no autoClosed entry', () => {
    const record = { visits: [NOW - 3 * DAY, NOW - HOUR, NOW - 2 * DAY] };
    expect(historyTimestamp(record, undefined)).toBe(NOW - HOUR);
  });

  // "most recent thing that happened": a sweep close after the last visit wins
  it('prefers a newer autoClosed time over an older last visit', () => {
    const record = { visits: [NOW - 6 * HOUR] };
    expect(historyTimestamp(record, NOW - HOUR)).toBe(NOW - HOUR);
  });

  // ...and the reverse: a revisit after an auto-close wins
  it('prefers a newer visit over an older autoClosed time', () => {
    const record = { visits: [NOW - HOUR] };
    expect(historyTimestamp(record, NOW - 6 * HOUR)).toBe(NOW - HOUR);
  });

  // legacy autoClosed entries are { time, backgroundColor } objects
  it('reads the object form of an autoClosed entry', () => {
    const entry = { time: NOW - 2 * HOUR, backgroundColor: '#1873E4' };
    expect(historyTimestamp({}, entry)).toBe(NOW - 2 * HOUR);
  });

  // search-engine records keep an empty `visits` array by design, so lastVisit
  // is the only signal they carry
  it('falls back to lastVisit when visits is empty', () => {
    const record = { lastVisit: NOW - 30 * 60 * 1000, visits: [] };
    expect(historyTimestamp(record, undefined)).toBe(NOW - 30 * 60 * 1000);
  });

  // lastVisit participates in the max like any other candidate
  it('takes the max across lastVisit, visits and autoClosed', () => {
    const record = { lastVisit: NOW - 5 * HOUR, visits: [NOW - 2 * HOUR] };
    expect(historyTimestamp(record, NOW - 9 * HOUR)).toBe(NOW - 2 * HOUR);
  });

  // garbage must not poison the max — mirrors pruneVisits' Number.isFinite guard
  it('ignores non-numeric junk in visits', () => {
    const record = { visits: ['nope', null, undefined, NaN, NOW - HOUR] };
    expect(historyTimestamp(record, undefined)).toBe(NOW - HOUR);
  });

  // a corrupted record must not throw or swallow the other signals — a
  // non-array `visits` is skipped and lastVisit still wins
  it('ignores a non-array visits field', () => {
    expect(historyTimestamp({ visits: 'nope', lastVisit: NOW }, undefined)).toBe(NOW);
  });

  // same guard on the other side: junk in lastVisit falls out of the max
  // instead of poisoning it to NaN
  it('ignores a non-numeric lastVisit', () => {
    expect(historyTimestamp({ lastVisit: 'nope', visits: [NOW - HOUR] }, undefined)).toBe(NOW - HOUR);
  });

  // a legacy record predating `visits`, never auto-closed: genuinely unknown,
  // so null — bucketByDay's "Earlier this week" fallback stays the honest answer
  it('returns null when nothing is known', () => {
    expect(historyTimestamp({ visitCount: 4 }, undefined)).toBeNull();
    expect(historyTimestamp({ visits: [] }, undefined)).toBeNull();
    expect(historyTimestamp(undefined, undefined)).toBeNull();
    expect(historyTimestamp({}, {})).toBeNull();
  });
});
