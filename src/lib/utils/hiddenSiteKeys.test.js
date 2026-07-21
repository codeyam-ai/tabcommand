import { describe, it, expect } from 'vitest';
import { hiddenSiteKey, hiddenSiteKeys } from './hiddenSiteKeys';

// hiddenSiteKeys is the read-side bridge for `favoritesHidden`, which can hold two
// storage forms: legacy page keys (`url-<url>`) written before removal became
// site-level, and the bare site keys written from now on. Both must normalize to
// the same site key, and that key must equal the group key rankFavorites rolls the
// site's row up under — otherwise a removed site quietly reappears.
describe('hiddenSiteKeys', () => {
  // The legacy form: an install that removed a favorite before this change holds a
  // page key. It must keep hiding its whole site, with no migration.
  it('normalizes a legacy url- page entry to its site key', () => {
    expect(hiddenSiteKeys(['url-https://espn.com/nfl/story'])).toEqual(
      new Set(['espn.com'])
    );
  });

  // The form written from now on. A bare hostname is not a parseable URL, so this
  // only works because of the normalizeUrl fallback — the case a lone siteKey call
  // would silently drop.
  it('passes a bare site key through unchanged', () => {
    expect(hiddenSiteKeys(['espn.com'])).toEqual(new Set(['espn.com']));
  });

  // Every cosmetic variant of a host is one row, so every variant must collapse to
  // one hidden key — including across the two storage forms.
  it('collapses scheme, www. and path variants onto one key', () => {
    expect(
      hiddenSiteKeys([
        'url-http://www.espn.com/',
        'url-https://espn.com/nba/story/_/id/1',
        'https://www.espn.com',
        'espn.com',
      ])
    ).toEqual(new Set(['espn.com']));
  });

  // The flip side of collapsing: hiding one site must never take another with it,
  // which is what would happen if unrelated entries bucketed onto a shared key.
  it('keeps distinct sites distinct', () => {
    expect(
      hiddenSiteKeys(['url-https://espn.com', 'url-https://b.com'])
    ).toEqual(new Set(['espn.com', 'b.com']));
  });

  // Subdomains other than www. are genuinely different sites (siteKey's rule), so
  // hiding one must not hide the other.
  it('does not collapse a non-www subdomain onto its parent', () => {
    expect(
      hiddenSiteKeys(['url-https://docs.python.org/3/'])
    ).toEqual(new Set(['docs.python.org']));
  });

  // Junk tolerance: an unparseable entry keeps its own key rather than bucketing
  // every malformed entry together under '' (which would hide unrelated rows).
  it('falls back to the raw entry for an unparseable url', () => {
    const keys = hiddenSiteKeys(['url-not a url', 'url-https://b.com']);
    expect(keys.has('not a url')).toBe(true);
    expect(keys.has('b.com')).toBe(true);
    expect(keys.has('')).toBe(false);
  });

  // Callers pass storage straight through, which may be missing or corrupt.
  it('tolerates a missing or non-array input', () => {
    expect(hiddenSiteKeys(undefined)).toEqual(new Set());
    expect(hiddenSiteKeys(null)).toEqual(new Set());
    expect(hiddenSiteKeys('espn.com')).toEqual(new Set());
    expect(hiddenSiteKeys([])).toEqual(new Set());
  });

  // A corrupt entry must be dropped rather than added as an empty key — an ''
  // in the set would match nothing useful and risks matching a junk group key.
  it('skips non-string and empty entries', () => {
    expect(hiddenSiteKeys([null, 42, '', '   ', 'espn.com'])).toEqual(
      new Set(['espn.com'])
    );
  });
});

// The single-entry form the write side ("un-hide this site") tests entries with,
// so read and write agree by construction rather than by coincidence.
describe('hiddenSiteKey', () => {
  // Both callers derive "which site is this row" through this one function, so a
  // legacy page entry and a fresh bare site key must land on the same key.
  it('normalizes both storage forms to the same key', () => {
    expect(hiddenSiteKey('url-https://www.espn.com/mlb/standings')).toBe(
      'espn.com'
    );
    expect(hiddenSiteKey('espn.com')).toBe('espn.com');
  });

  // The write/read round trip the sidebar's × and View All's "Bring back" both
  // depend on: whatever removal stores must normalize back to the same key on
  // read, or the site is hidden with no way to restore it. Pinned for the awkward
  // case — an unparseable URL, where the key is a normalizeUrl fallback rather
  // than a host.
  it('round-trips what removal writes, including an unparseable url', () => {
    for (const url of [
      'https://www.espn.com/nfl/story',
      'http://espn.com/',
      'not a url',
    ]) {
      const written = hiddenSiteKey(url);
      expect(hiddenSiteKeys([written])).toEqual(new Set([written]));
    }
  });

  // Callers treat '' as "no site" and skip it, so junk must reduce to '' rather
  // than to a key that could collide with a real row.
  it('returns an empty key for junk it cannot normalize', () => {
    expect(hiddenSiteKey(undefined)).toBe('');
    expect(hiddenSiteKey(null)).toBe('');
    expect(hiddenSiteKey('')).toBe('');
  });
});
