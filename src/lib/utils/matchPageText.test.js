import { describe, it, expect } from 'vitest';
import matchPageText from './matchPageText';

describe('matchPageText', () => {
  // the whole point of the feature: a phrase the user read, not a title
  it('splits page text into the parts around the match', () => {
    const result = matchPageText('Storage is subject to a quota per origin.', 'quota');
    expect(result.match).toBe('quota');
    expect(result.before).toBe('Storage is subject to a ');
    expect(result.after).toBe(' per origin.');
  });

  // someone half-remembering a phrase does not remember its capitalisation,
  // but the excerpt must still read as the page wrote it
  it('matches case-insensitively and keeps the page casing', () => {
    const result = matchPageText('The Quota Ceiling is fixed.', 'quota');
    expect(result.match).toBe('Quota');
    expect(result.before).toBe('The ');
  });

  // substring, not token: adjacency is exactly what makes a remembered phrase
  // worth searching for, and a tokenised match would lose it
  it('matches a multi-word phrase across a word boundary', () => {
    const result = matchPageText('It failed because the quota was exceeded today.', 'quota was exceeded');
    expect(result.match).toBe('quota was exceeded');
    expect(result.after).toBe(' today.');
  });

  // the defect this function was rewritten to fix: a fixed-character window cut
  // words in half, so "t to a per-origin quota" read as a rendering bug
  it('trims a long prefix back to a word boundary and marks the cut', () => {
    const text = `${'alpha '.repeat(60)}quota tail`;
    const result = matchPageText(text, 'quota');
    expect(result.before.startsWith('…')).toBe(true);
    // everything after the ellipsis is whole words
    expect(result.before.slice(1).trimEnd().split(' ').every((w) => w === 'alpha')).toBe(true);
  });

  // the same word-boundary rule on the trailing side, where a mid-word cut
  // looked like the excerpt had been corrupted rather than shortened
  it('trims a long suffix back to a word boundary and marks the cut', () => {
    const text = `head quota ${'omega '.repeat(60)}`;
    const result = matchPageText(text, 'quota');
    expect(result.after.endsWith('…')).toBe(true);
    expect(result.after.slice(0, -1).trim().split(' ').every((w) => w === 'omega')).toBe(true);
  });

  // a short page must not gain ellipses it did not earn
  it('adds no ellipsis when the whole text fits in the window', () => {
    const result = matchPageText('a quota b', 'quota');
    expect(result.before).toBe('a ');
    expect(result.after).toBe(' b');
  });

  // null is the caller's signal that this page is not a result at all
  it('returns null for missing text, missing query, or no hit', () => {
    expect(matchPageText('', 'quota')).toBeNull();
    expect(matchPageText('some text', '')).toBeNull();
    expect(matchPageText(undefined, 'quota')).toBeNull();
    expect(matchPageText('nothing relevant here', 'quota')).toBeNull();
  });

  // the index lets a caller reason about where in the page the hit landed
  it('reports the index of the match in the full text', () => {
    expect(matchPageText('0123456789quota', 'quota').index).toBe(10);
  });

  // the FIRST occurrence is the one excerpted, so the snippet is stable across
  // re-scans of an unchanged page
  it('excerpts the first occurrence', () => {
    const result = matchPageText('first quota then second quota', 'quota');
    expect(result.index).toBe(6);
    expect(result.before).toBe('first ');
  });
});
