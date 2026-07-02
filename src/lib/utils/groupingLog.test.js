import { describe, it, expect } from 'vitest';
import appendGroupingLog from './groupingLog.js';

describe('appendGroupingLog', () => {
  // The common case: a new breadcrumb lands at the end of an existing trail,
  // preserving prior entries in order.
  it('appends the entry to the end of a populated store', () => {
    const store = [{ event: 'a' }, { event: 'b' }];
    const result = appendGroupingLog(store, { event: 'c' });
    expect(result).toEqual([{ event: 'a' }, { event: 'b' }, { event: 'c' }]);
  });

  // First-ever breadcrumb: storage has no `groupingLog` yet, so the helper must
  // treat a missing/undefined store as an empty trail rather than throwing.
  it('treats a missing store as an empty array', () => {
    expect(appendGroupingLog(undefined, { event: 'x' })).toEqual([{ event: 'x' }]);
  });

  // Defensive against a corrupted storage value: a non-array (e.g. someone wrote
  // an object) is discarded in favor of a fresh single-entry trail.
  it('treats a non-array store as an empty array', () => {
    expect(appendGroupingLog({ not: 'an array' }, { event: 'x' })).toEqual([{ event: 'x' }]);
  });

  // The ring buffer must stay bounded: once the trail exceeds `cap`, the oldest
  // entries fall off and only the most-recent `cap` survive.
  it('trims to cap, keeping the most-recent entries', () => {
    const store = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const result = appendGroupingLog(store, { n: 4 }, 2);
    expect(result).toEqual([{ n: 3 }, { n: 4 }]);
  });

  // A trail already at capacity slides forward by one on each append, never
  // growing past `cap`.
  it('keeps length at cap when already full', () => {
    const store = [{ n: 1 }, { n: 2 }];
    const result = appendGroupingLog(store, { n: 3 }, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ n: 2 }, { n: 3 }]);
  });

  // Purity guarantee: the caller's stored array is not mutated — the helper
  // returns a new array so callers can compare or write back safely.
  it('does not mutate the input array', () => {
    const store = [{ n: 1 }];
    const result = appendGroupingLog(store, { n: 2 });
    expect(store).toEqual([{ n: 1 }]);
    expect(result).not.toBe(store);
  });

  // The default cap is 200, matching the worker's GROUPING_LOG_CAP, so an
  // unbounded caller still gets a bounded buffer.
  it('defaults the cap to 200 entries', () => {
    let store = [];
    for (let i = 0; i < 250; i++) {
      store = appendGroupingLog(store, { n: i });
    }
    expect(store).toHaveLength(200);
    expect(store[0]).toEqual({ n: 50 });
    expect(store[199]).toEqual({ n: 249 });
  });
});
