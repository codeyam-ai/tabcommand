import { describe, it, expect } from 'vitest';
import { loadLevel } from './loadLevel';

describe('loadLevel', () => {
  // at or above warnAt the whole-browser load is "high" (gauge/triage red)
  it('returns high at or above warnAt', () => {
    expect(loadLevel(70, 70)).toBe('high');
    expect(loadLevel(92, 70)).toBe('high');
  });

  // the medium band begins at warnAt * 0.6 and runs up to warnAt
  it('returns medium from warnAt*0.6 up to warnAt', () => {
    expect(loadLevel(42, 70)).toBe('medium'); // 70 * 0.6 = 42
    expect(loadLevel(69, 70)).toBe('medium');
  });

  // below warnAt*0.6 the load is comfortable ("low")
  it('returns low below the medium band', () => {
    expect(loadLevel(41, 70)).toBe('low');
    expect(loadLevel(0, 70)).toBe('low');
  });

  // the threshold is configurable — a lower warnAt shifts the bands down
  it('honors a custom warnAt threshold', () => {
    expect(loadLevel(50, 50)).toBe('high');
    expect(loadLevel(30, 50)).toBe('medium'); // 50 * 0.6 = 30
    expect(loadLevel(29, 50)).toBe('low');
  });
});
