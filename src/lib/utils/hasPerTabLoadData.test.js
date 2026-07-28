import { describe, it, expect } from 'vitest';
import { hasPerTabLoadData } from './hasPerTabLoadData';

describe('hasPerTabLoadData', () => {
  // the processes source is the only one that attributes load to individual tabs
  it('is true for the processes source', () => {
    expect(hasPerTabLoadData('processes')).toBe(true);
  });

  // stable Chrome reports a whole-machine source — no per-tab attribution
  it('is false for the system source', () => {
    expect(hasPerTabLoadData('system')).toBe(false);
  });

  // an explicit no-data source is not per-tab data either
  it('is false for the none source', () => {
    expect(hasPerTabLoadData('none')).toBe(false);
  });

  // before the service worker writes the marker the source is absent entirely
  it('is false when the marker is unset', () => {
    expect(hasPerTabLoadData(null)).toBe(false);
    expect(hasPerTabLoadData(undefined)).toBe(false);
    expect(hasPerTabLoadData('')).toBe(false);
  });

  // the match is exact — a near-miss value must not open the per-tab surfaces
  it('is false for a near-miss value', () => {
    expect(hasPerTabLoadData('process')).toBe(false);
    expect(hasPerTabLoadData('Processes')).toBe(false);
    expect(hasPerTabLoadData('processes ')).toBe(false);
  });
});
