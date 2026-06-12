import { describe, it, expect } from 'vitest';
import { summarizeProcessLoad } from './processLoad';

describe('summarizeProcessLoad', () => {
  // no sampled data -> null so callers render nothing instead of NaN
  it('returns null when there are no samples', () => {
    expect(summarizeProcessLoad({ samples: 0 })).toBeNull();
    expect(summarizeProcessLoad({})).toBeNull();
    expect(summarizeProcessLoad(undefined)).toBeNull();
    expect(summarizeProcessLoad(null)).toBeNull();
  });

  // averages divide the summed cpu/memory by the sample count
  it('averages cpu and memory across samples', () => {
    const r = summarizeProcessLoad({ samples: 10, cpu: 18000, privateMemory: 2128000000 });
    // cpu: 18000 / 100 / 10 = 18 ; mem: 2128000000 / 1064000 / 10 = 200
    expect(r.cpu).toBeCloseTo(18, 5);
    expect(r.mem).toBeCloseTo(200, 5);
  });

  // a heavy tab (high memory) is classified excessive
  it('classifies a heavy tab as excessive', () => {
    const r = summarizeProcessLoad({ samples: 10, cpu: 48000, privateMemory: 7660800000 });
    // mem ~= 719.8 (> 600) -> excessive
    expect(r.level).toBe('excessive');
  });

  // a moderately busy tab lands at the medium level
  it('classifies a moderate tab as medium', () => {
    // cpu ~ 20 (>18, <=36), mem small -> medium
    const r = summarizeProcessLoad({ samples: 10, cpu: 20000, privateMemory: 1064000000 });
    expect(r.cpu).toBeCloseTo(20, 5);
    expect(r.level).toBe('medium');
  });

  // a near-idle tab is low
  it('classifies a near-idle tab as low', () => {
    const r = summarizeProcessLoad({ samples: 10, cpu: 5000, privateMemory: 532000000 });
    // cpu 5, mem 50 -> low
    expect(r.level).toBe('low');
  });

  // the bar width is the larger of the cpu and memory fractions, as a percent
  it('derives the bar width from the dominant fraction', () => {
    const r = summarizeProcessLoad({ samples: 10, cpu: 36000, privateMemory: 1064000000 });
    // cpu 36 -> 36/72 = 0.5 ; mem 100 -> 100/800 = 0.125 ; width = 50
    expect(r.width).toBeCloseTo(50, 5);
  });
});
