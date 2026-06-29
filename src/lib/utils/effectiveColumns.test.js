import { describe, it, expect } from 'vitest';
import { effectiveColumns, columnsForWidth, COLUMN_BREAKPOINTS } from './effectiveColumns';

describe('columnsForWidth', () => {
  // at or above the widest breakpoint the pane fits the full four columns
  it('fits four columns at desktop width and above', () => {
    expect(columnsForWidth(1240)).toBe(4);
    expect(columnsForWidth(1440)).toBe(4);
    expect(columnsForWidth(3000)).toBe(4);
  });

  // each breakpoint steps the fit-count down by one as the width narrows
  it('steps down through three and two columns', () => {
    expect(columnsForWidth(1239)).toBe(3);
    expect(columnsForWidth(1000)).toBe(3);
    expect(columnsForWidth(999)).toBe(2);
    expect(columnsForWidth(760)).toBe(2);
  });

  // below the narrowest breakpoint the grid collapses to a single column
  it('collapses to one column below the narrowest breakpoint', () => {
    expect(columnsForWidth(759)).toBe(1);
    expect(columnsForWidth(320)).toBe(1);
    expect(columnsForWidth(0)).toBe(1);
  });
});

describe('effectiveColumns', () => {
  // at a comfortable width the configured count renders exactly as chosen
  it('returns the configured count when the width fits it', () => {
    expect(effectiveColumns(4, 1440)).toBe(4);
    expect(effectiveColumns(3, 1440)).toBe(3);
    expect(effectiveColumns(2, 1440)).toBe(2);
  });

  // a wider-than-fits choice is capped to what the current width can show
  it('caps the configured count to what the width fits', () => {
    expect(effectiveColumns(4, 1000)).toBe(3);
    expect(effectiveColumns(4, 800)).toBe(2);
    expect(effectiveColumns(3, 500)).toBe(1);
  });

  // a choice narrower than the width is never widened past the user's pick
  it('never exceeds the configured count even on a wide viewport', () => {
    expect(effectiveColumns(2, 3000)).toBe(2);
    expect(effectiveColumns(3, 3000)).toBe(3);
  });

  // a missing or invalid configured value falls back to the default of 3
  it('falls back to the default for invalid input', () => {
    expect(effectiveColumns(undefined, 1440)).toBe(3);
    expect(effectiveColumns(0, 1440)).toBe(3);
    expect(effectiveColumns(null, 1440)).toBe(3);
  });

  // the fallback is itself still capped by a narrow viewport
  it('caps the fallback default on a narrow viewport', () => {
    expect(effectiveColumns(undefined, 500)).toBe(1);
  });

  // the exported breakpoints stay ordered widest-first so the first match wins
  it('keeps breakpoints ordered widest-first', () => {
    const mins = COLUMN_BREAKPOINTS.map((b) => b.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });
});
