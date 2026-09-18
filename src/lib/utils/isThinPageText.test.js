import { describe, it, expect } from 'vitest';
import isThinPageText, { THIN_TEXT } from './isThinPageText';

describe('isThinPageText', () => {
  // the case the predicate exists for: a client-rendered app returns a
  // bootstrap shell whose readable text is a loading message
  it('calls a bootstrap shell thin', () => {
    expect(isThinPageText('Loading…')).toBe(true);
    expect(isThinPageText('You need to enable JavaScript to run this app.')).toBe(true);
  });

  // a real article is never thin, however short the paragraph
  it('calls a page with real prose not thin', () => {
    expect(isThinPageText('x'.repeat(THIN_TEXT))).toBe(false);
    expect(isThinPageText('y'.repeat(THIN_TEXT * 4))).toBe(false);
  });

  // the boundary is inclusive on the "enough" side, matching the scan's
  // `fetched.length >= THIN_TEXT` short-circuit
  it('treats exactly the threshold as enough text', () => {
    expect(isThinPageText('a'.repeat(THIN_TEXT - 1))).toBe(true);
    expect(isThinPageText('a'.repeat(THIN_TEXT))).toBe(false);
  });

  // a fetch that failed yields '' — thin, so the deep tier gets its turn
  it('calls empty, null and undefined thin', () => {
    expect(isThinPageText('')).toBe(true);
    expect(isThinPageText(null)).toBe(true);
    expect(isThinPageText(undefined)).toBe(true);
  });
});
