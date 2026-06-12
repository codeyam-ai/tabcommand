import { describe, it, expect } from 'vitest';
import humanReadableNumber from './humanReadableNumber';

describe('humanReadableNumber', () => {
  // thousands get grouped with separators in the en locale
  it('groups thousands with separators', () => {
    expect(humanReadableNumber(1284, 'en')).toBe('1,284');
  });

  // millions group every three digits
  it('groups millions', () => {
    expect(humanReadableNumber(1234567, 'en')).toBe('1,234,567');
  });

  // a numeric string is parsed before formatting
  it('parses a numeric string', () => {
    expect(humanReadableNumber('48000', 'en')).toBe('48,000');
  });

  // a falsy value yields undefined so the caller renders nothing
  it('returns undefined for falsy values', () => {
    expect(humanReadableNumber(0, 'en')).toBeUndefined();
    expect(humanReadableNumber(null, 'en')).toBeUndefined();
    expect(humanReadableNumber(undefined, 'en')).toBeUndefined();
    expect(humanReadableNumber('', 'en')).toBeUndefined();
  });

  // small numbers below 1000 pass through ungrouped
  it('leaves sub-thousand numbers ungrouped', () => {
    expect(humanReadableNumber(42, 'en')).toBe('42');
  });

  // a fractional value keeps its decimal part
  it('preserves a fractional value', () => {
    expect(humanReadableNumber(12.5, 'en')).toBe('12.5');
  });
});
