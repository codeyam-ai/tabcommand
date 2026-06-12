import { describe, it, expect } from 'vitest';
import gaugeFillPercent from './gaugeFillPercent';

describe('gaugeFillPercent', () => {
  // an empty gauge (value at base) leaves 100% of segments empty
  it('returns 100 when value equals base', () => {
    expect(gaugeFillPercent(0, 0, 150)).toBe(100);
  });

  // a full gauge (value at base + max) leaves 0% empty
  it('returns 0 when value reaches base + max', () => {
    expect(gaugeFillPercent(150, 0, 150)).toBe(0);
  });

  // a half-loaded gauge leaves half the segments empty
  it('returns 50 at the half-way point', () => {
    expect(gaugeFillPercent(75, 0, 150)).toBe(50);
  });

  // the base floor is subtracted before computing the fraction
  it('subtracts the base before computing the fraction', () => {
    const max = 5 * 1024 * 1024 * 1024;
    const base = 500 * 1024 * 1024;
    // value sitting exactly at the base reads as empty
    expect(gaugeFillPercent(base, base, max)).toBe(100);
  });

  // memory at base + half-max leaves half empty
  it('computes the memory arc fraction with a non-zero base', () => {
    const max = 5 * 1024 * 1024 * 1024;
    const base = 500 * 1024 * 1024;
    expect(gaugeFillPercent(base + max / 2, base, max)).toBe(50);
  });

  // values above the ceiling go negative (un-clamped, mirrors the reference)
  it('returns a negative percent when value exceeds base + max', () => {
    expect(gaugeFillPercent(300, 0, 150)).toBe(-100);
  });
});
