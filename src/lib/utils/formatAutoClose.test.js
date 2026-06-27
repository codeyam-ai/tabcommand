import { describe, it, expect } from 'vitest';
import formatAutoClose from './formatAutoClose';

describe('formatAutoClose', () => {
  // 0 is the slider's Off position — the engine disables auto-closing there
  it('renders Off for 0', () => {
    expect(formatAutoClose(0)).toBe('Off');
  });

  // negative or non-finite values are also treated as disabled
  it('renders Off for negative and non-numeric values', () => {
    expect(formatAutoClose(-15)).toBe('Off');
    expect(formatAutoClose(undefined)).toBe('Off');
    expect(formatAutoClose(null)).toBe('Off');
    expect(formatAutoClose('not-a-number')).toBe('Off');
  });

  // values under an hour show whole minutes
  it('shows minutes below one hour', () => {
    expect(formatAutoClose(15)).toBe('15 min');
    expect(formatAutoClose(45)).toBe('45 min');
  });

  // exactly one hour and whole-hour multiples drop the decimal
  it('shows whole hours without a decimal', () => {
    expect(formatAutoClose(60)).toBe('1 hr');
    expect(formatAutoClose(120)).toBe('2 hr');
    expect(formatAutoClose(480)).toBe('8 hr');
  });

  // non-whole hours show a single decimal place
  it('shows a single decimal for partial hours', () => {
    expect(formatAutoClose(90)).toBe('1.5 hr');
    expect(formatAutoClose(150)).toBe('2.5 hr');
  });

  // numeric strings (as emitted by a range input) are coerced
  it('coerces numeric strings', () => {
    expect(formatAutoClose('30')).toBe('30 min');
    expect(formatAutoClose('120')).toBe('2 hr');
    expect(formatAutoClose('0')).toBe('Off');
  });
});
