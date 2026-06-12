import { describe, it, expect } from 'vitest';
import searchNotesSnippet from './searchNotesSnippet';

describe('searchNotesSnippet', () => {
  // splits short notes into the parts around the matched term
  it('returns before, match, and after around the term', () => {
    const result = searchNotesSnippet('Read this article about react hooks', 'react');
    expect(result).toEqual({ before: 'his article about ', match: 'react', after: ' hooks' });
  });

  // the match keeps the notes' original casing even when the term is lowercase
  it('matches case-insensitively but preserves the original case', () => {
    const result = searchNotesSnippet('All about React Hooks', 'react');
    expect(result).toEqual({ before: 'All about ', match: 'React', after: ' Hooks' });
  });

  // a long prefix before the term is trimmed out of the window
  it('trims a long prefix ahead of the term', () => {
    const result = searchNotesSnippet('abcdefghijklmnopqrstuvwxyz0123 react tail', 'react');
    expect(result.match).toBe('react');
    expect(result.before).toBe('nopqrstuvwxyz0123 ');
    expect(result.before).not.toContain('abcdefghijklm');
  });

  // a long suffix after the term is trimmed down
  it('trims a long suffix after the term', () => {
    const result = searchNotesSnippet(`x react ${'y'.repeat(40)}`, 'react');
    expect(result.before).toBe('x ');
    expect(result.after.length).toBeLessThan(41);
  });

  // nothing to highlight when notes or term are missing
  it('returns null for missing notes or term', () => {
    expect(searchNotesSnippet('', 'react')).toBeNull();
    expect(searchNotesSnippet('some notes', '')).toBeNull();
    expect(searchNotesSnippet(undefined, 'react')).toBeNull();
  });

  // returns null when the term does not appear in the notes
  it('returns null when the term is absent', () => {
    expect(searchNotesSnippet('no relevant content here', 'react')).toBeNull();
  });
});
