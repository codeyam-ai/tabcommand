import { describe, it, expect } from 'vitest';
import scanProgressPercent from './scanProgressPercent';

describe('scanProgressPercent', () => {
  // the ordinary case the bar is drawn from
  it('returns the fraction scanned as a percent', () => {
    expect(scanProgressPercent(0, 60)).toBe(0);
    expect(scanProgressPercent(30, 60)).toBe(50);
    expect(scanProgressPercent(60, 60)).toBe(100);
  });

  // the reason this is a function and not an inline expression: a scope that
  // resolved to no scannable pages reports 0 / 0, and `0 / 0` is NaN — which
  // renders as `width: NaN%` and leaves the bar at whatever it was.
  it('returns 0 rather than NaN for an empty scan', () => {
    expect(scanProgressPercent(0, 0)).toBe(0);
    expect(scanProgressPercent(undefined, undefined)).toBe(0);
  });

  // a bar cannot be more than full; clamping keeps a miscount from overflowing
  // its track rather than rendering a visibly broken control
  it('clamps to the 0-100 range', () => {
    expect(scanProgressPercent(80, 60)).toBe(100);
    expect(scanProgressPercent(-5, 60)).toBe(0);
  });
});
