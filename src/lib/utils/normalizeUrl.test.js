import { describe, it, expect } from 'vitest';
import { normalizeUrl } from './normalizeUrl';

// normalizeUrl collapses cosmetic URL variants (trailing slash, http/https,
// leading www., host case, fragment) onto one grouping key while preserving the
// query string and distinct paths. These tests pin that contract — it's the
// dedup key rankFavorites groups on.
describe('normalizeUrl', () => {
  // A trailing slash on the path is collapsed away, so `/path/` keys with `/path`.
  it('treats a trailing slash as equivalent to no trailing slash', () => {
    expect(normalizeUrl('https://x.com/path/')).toBe(
      normalizeUrl('https://x.com/path')
    );
  });

  // A bare root collapses whether or not it carries the trailing slash.
  it('collapses a bare root with and without a trailing slash', () => {
    expect(normalizeUrl('https://x.com/')).toBe(normalizeUrl('https://x.com'));
  });

  // The scheme is dropped, so http and https forms of the same URL share a key.
  it('treats http and https as equivalent', () => {
    expect(normalizeUrl('http://x.com/path')).toBe(
      normalizeUrl('https://x.com/path')
    );
  });

  // A leading www. is stripped from the host before keying.
  it('strips a leading www. from the host', () => {
    expect(normalizeUrl('https://www.x.com/path')).toBe(
      normalizeUrl('https://x.com/path')
    );
  });

  // Host casing is normalized, so X.COM keys with x.com.
  it('is case-insensitive on the host', () => {
    expect(normalizeUrl('https://X.COM/path')).toBe(
      normalizeUrl('https://x.com/path')
    );
  });

  // The #fragment is dropped (defensive — keys already strip it upstream).
  it('drops the #fragment', () => {
    expect(normalizeUrl('https://x.com/path#section')).toBe(
      normalizeUrl('https://x.com/path')
    );
  });

  // The query string is preserved, so two different queries stay distinct keys.
  it('keeps distinct query strings distinct', () => {
    expect(normalizeUrl('https://x.com/p?id=1')).not.toBe(
      normalizeUrl('https://x.com/p?id=2')
    );
  });

  // Different paths are genuinely different pages and stay distinct.
  it('keeps distinct paths distinct', () => {
    expect(normalizeUrl('https://x.com/a')).not.toBe(
      normalizeUrl('https://x.com/b')
    );
  });

  // The full http/https/www/trailing-slash matrix collapses to a single key.
  it('collapses the full http/https/www/slash matrix to one key', () => {
    const keys = new Set([
      normalizeUrl('https://github.com/codeyam'),
      normalizeUrl('https://github.com/codeyam/'),
      normalizeUrl('http://www.github.com/codeyam'),
      normalizeUrl('https://www.github.com/codeyam/'),
    ]);
    expect(keys.size).toBe(1);
  });

  // A non-parseable input falls back to the trimmed raw string without throwing.
  it('falls back to the trimmed raw string for a non-URL input, without throwing', () => {
    expect(normalizeUrl('  not a url  ')).toBe('not a url');
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
  });
});
