import { describe, it, expect } from 'vitest';

import { siteKey } from './siteKey';

describe('siteKey', () => {
  // The common case: a URL reduces to its bare host, with path/query/fragment
  // dropped — this is the identity a site's visits accumulate under.
  it('reduces a url to its bare host', () => {
    expect(siteKey('https://espn.com/nfl/story?id=1#top')).toBe('espn.com');
    expect(siteKey('https://news.ycombinator.com')).toBe('news.ycombinator.com');
  });

  // Every page of a content site must collapse onto ONE key — that is what makes
  // article visits credit the site instead of minting orphan per-page records.
  it('maps every page of a site to the same key', () => {
    const home = siteKey('https://www.espn.com');
    const article = siteKey('https://www.espn.com/nfl/story/_/id/44120031/chiefs');
    const standings = siteKey('https://www.espn.com/mlb/standings');
    expect(home).toBe('espn.com');
    expect(article).toBe(home);
    expect(standings).toBe(home);
  });

  // Cosmetic variants collapse: scheme, host case, and a leading `www.` are all
  // canonicalized away, so http/https/www spellings of a site share one row.
  it('collapses scheme, host case, and a leading www', () => {
    expect(siteKey('http://www.espn.com/')).toBe('espn.com');
    expect(siteKey('https://espn.com')).toBe('espn.com');
    expect(siteKey('https://ESPN.com')).toBe('espn.com');
    expect(siteKey('http://WWW.ESPN.COM/nfl')).toBe('espn.com');
  });

  // A subdomain other than `www.` is a genuinely different site and stays
  // distinct — collapsing docs.python.org into python.org would over-merge.
  it('keeps non-www subdomains distinct', () => {
    expect(siteKey('https://docs.python.org/3/library')).toBe('docs.python.org');
    expect(siteKey('https://python.org')).toBe('python.org');
    expect(siteKey('https://docs.python.org')).not.toBe(siteKey('https://python.org'));
  });

  // A port is part of the host identity, so it is preserved.
  it('preserves an explicit port', () => {
    expect(siteKey('http://localhost:3000/page')).toBe('localhost:3000');
  });

  // Defensive: a non-parseable or non-string input yields '' rather than
  // throwing, so callers can treat it as "no site" and skip it. Every malformed
  // value must NOT bucket together under a shared key.
  it('returns an empty string for unparseable or non-string input', () => {
    expect(siteKey('not a url')).toBe('');
    expect(siteKey('')).toBe('');
    expect(siteKey('   ')).toBe('');
    expect(siteKey(null)).toBe('');
    expect(siteKey(undefined)).toBe('');
    expect(siteKey(42)).toBe('');
  });

  // Whitespace around an otherwise-valid url is tolerated, mirroring normalizeUrl.
  it('trims surrounding whitespace before parsing', () => {
    expect(siteKey('  https://espn.com/nfl  ')).toBe('espn.com');
  });
});
