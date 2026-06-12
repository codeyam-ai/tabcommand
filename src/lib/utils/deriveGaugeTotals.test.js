import { describe, it, expect } from 'vitest';
import deriveGaugeTotals from './deriveGaugeTotals';

describe('deriveGaugeTotals', () => {
  // a full record maps cpu straight through and sums the two memory fields
  it('reads cpu and sums private + js-used memory', () => {
    const result = deriveGaugeTotals({
      cpu: 48000,
      privateMemory: 7660800000,
      jsMemoryUsed: 4596480000,
    });
    expect(result).toEqual({ cpu: 48000, memory: 7660800000 + 4596480000 });
  });

  // an empty record reads as a zeroed gauge, not NaN
  it('returns zeros for an empty record', () => {
    expect(deriveGaugeTotals({})).toEqual({ cpu: 0, memory: 0 });
  });

  // a null/undefined record is tolerated and reads as zero
  it('tolerates a missing record', () => {
    expect(deriveGaugeTotals(undefined)).toEqual({ cpu: 0, memory: 0 });
    expect(deriveGaugeTotals(null)).toEqual({ cpu: 0, memory: 0 });
  });

  // only one memory field present still produces a numeric sum
  it('sums when only one memory field is present', () => {
    expect(deriveGaugeTotals({ privateMemory: 1000 })).toEqual({ cpu: 0, memory: 1000 });
    expect(deriveGaugeTotals({ jsMemoryUsed: 250 })).toEqual({ cpu: 0, memory: 250 });
  });

  // cpu present without memory fields reads memory as zero
  it('reads cpu alone with zero memory', () => {
    expect(deriveGaugeTotals({ cpu: 12 })).toEqual({ cpu: 12, memory: 0 });
  });
});
