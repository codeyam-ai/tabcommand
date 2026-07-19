import { describe, it, expect } from 'vitest';
import { isSearchEngineUrl } from './isSearchEngineUrl';

describe('isSearchEngineUrl', () => {
  // A Google search URL is a search engine, regardless of www / query string.
  it('matches google.com search URLs', () => {
    expect(isSearchEngineUrl('https://www.google.com/search?q=weather')).toBe(true);
    expect(isSearchEngineUrl('https://google.com')).toBe(true);
  });

  // Google's ccTLDs are covered by the google.<tld> rule, not just .com.
  it('matches google ccTLDs like google.co.uk and google.de', () => {
    expect(isSearchEngineUrl('https://www.google.co.uk/search?q=x')).toBe(true);
    expect(isSearchEngineUrl('https://google.de/search?q=x')).toBe(true);
    expect(isSearchEngineUrl('https://google.fr')).toBe(true);
  });

  // The curated exact-host set covers the other major engines and SERP subdomains.
  it('matches curated engine hosts and SERP subdomains', () => {
    for (const url of [
      'https://bing.com/search?q=x',
      'https://duckduckgo.com/?q=x',
      'https://search.yahoo.com/search?q=x',
      'https://search.brave.com/search?q=x',
      'https://www.ecosia.org/search?q=x',
      'https://yandex.ru/search/?text=x',
    ]) {
      expect(isSearchEngineUrl(url)).toBe(true);
    }
  });

  // Google properties on OTHER hosts are real destinations, not the search engine,
  // and must NOT be excluded (siteKey keeps these hosts distinct).
  it('does not match non-search Google properties on other hosts', () => {
    expect(isSearchEngineUrl('https://docs.google.com/document/d/1')).toBe(false);
    expect(isSearchEngineUrl('https://mail.google.com')).toBe(false);
    expect(isSearchEngineUrl('https://maps.google.com')).toBe(false);
  });

  // A portal root (yahoo.com) is content, not the SERP host (search.yahoo.com) —
  // only the SERP subdomain is excluded, so a genuine portal visit survives.
  it('excludes the SERP subdomain but not the content-portal root', () => {
    expect(isSearchEngineUrl('https://search.yahoo.com/search?q=x')).toBe(true);
    expect(isSearchEngineUrl('https://www.yahoo.com')).toBe(false);
  });

  // Ordinary sites are not search engines, even with a /search path or ?q= param.
  it('does not match ordinary sites', () => {
    expect(isSearchEngineUrl('https://github.com')).toBe(false);
    expect(isSearchEngineUrl('https://example.com/search?q=widgets')).toBe(false);
    expect(isSearchEngineUrl('https://news.ycombinator.com')).toBe(false);
  });

  // Non-string / unparseable / empty input is safely false (defers to siteKey '').
  it('returns false for non-string, empty, or unparseable input', () => {
    expect(isSearchEngineUrl(null)).toBe(false);
    expect(isSearchEngineUrl(undefined)).toBe(false);
    expect(isSearchEngineUrl('')).toBe(false);
    expect(isSearchEngineUrl('not a url')).toBe(false);
  });
});
