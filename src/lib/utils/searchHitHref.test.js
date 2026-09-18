import { describe, it, expect } from 'vitest';
import searchHitHref, { isChromeHistoryHit } from './searchHitHref';

describe('searchHitHref', () => {
  // the stored record usually does NOT repeat its url, so the key is the source
  it('derives the url from a tracked hit id when the record has no url field', () => {
    expect(searchHitHref({ id: 'url-https://react.dev/learn' })).toBe('https://react.dev/learn');
  });

  // an explicit url field wins — a Chrome-history hit carries one
  it('prefers an explicit url field over the id', () => {
    expect(searchHitHref({
      id: 'chrome-history-https://example.com/a',
      url: 'https://example.com/a',
    })).toBe('https://example.com/a');
  });

  // a real record that DOES carry url must not be second-guessed from its key
  it('uses the url field even when the id would also resolve', () => {
    expect(searchHitHref({
      id: 'url-https://old.example.com',
      url: 'https://new.example.com',
    })).toBe('https://new.example.com');
  });

  // an id in no recognised namespace yields nothing rather than a bogus href
  it('returns an empty string for an id with no url- prefix and no url field', () => {
    expect(searchHitHref({ id: 'label-Reading' })).toBe('');
  });

  // a query string is part of the url and survives the slice intact
  it('keeps query strings and fragments in a key-derived url', () => {
    expect(searchHitHref({ id: 'url-https://www.youtube.com/watch?v=abc#t=10' }))
      .toBe('https://www.youtube.com/watch?v=abc#t=10');
  });

  // rows render from whatever the index holds, which can briefly be a partial
  // record mid-rebuild — a missing id must not throw during paint
  it('tolerates a missing or empty hit', () => {
    expect(searchHitHref({})).toBe('');
    expect(searchHitHref({ id: null })).toBe('');
  });
});

describe('isChromeHistoryHit', () => {
  // these hits are not tracked records, so there is nothing to open an editor on
  it('is true only for the chrome-history id namespace', () => {
    expect(isChromeHistoryHit('chrome-history-https://example.com')).toBe(true);
    expect(isChromeHistoryHit('url-https://example.com')).toBe(false);
    expect(isChromeHistoryHit('label-Work')).toBe(false);
  });

  // an absent id must not be mistaken for a Chrome-history hit, or the row
  // would silently lose its edit affordance
  it('is false for a missing id', () => {
    expect(isChromeHistoryHit(undefined)).toBe(false);
    expect(isChromeHistoryHit(null)).toBe(false);
  });
});
