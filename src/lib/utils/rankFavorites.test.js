import { describe, it, expect } from 'vitest';
import { rankFavorites } from './rankFavorites';

// rankFavorites ranks Favorites FREQUENCY-FIRST: it de-duplicates cosmetic URL
// variants, sums their effective visits, drops sites below a minimum-visit
// threshold, discounts currently-open tabs, and orders by effective visits with
// recency as the tiebreak. These tests pin that contract.
describe('rankFavorites', () => {
  const rec = (title, over = {}) => ({ title, favicon: '', ...over });

  // Empty or non-array input yields an empty list, never a throw.
  it('returns [] for empty or non-array allUrls', () => {
    expect(rankFavorites([], {})).toEqual([]);
    expect(rankFavorites(null, {})).toEqual([]);
    expect(rankFavorites(undefined, {})).toEqual([]);
  });

  // Keys lacking a record, or whose record has no usable title, are filtered out.
  it('drops keys without a usable record/title', () => {
    const allUrls = ['url-a', 'url-b', 'url-c'];
    const records = {
      'url-a': rec('Alpha', { visitCount: 3 }),
      // url-b has no record
      'url-c': { favicon: '', visitCount: 3 }, // record but no title
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.urlKey)).toEqual(['url-a']);
  });

  // Frequency leads: a more-visited older site ranks above a more-recent,
  // less-visited one (the recency-dominant blend is gone).
  it('ranks frequency-first — higher visit count beats more-recent', () => {
    const allUrls = ['url-fresh', 'url-popular'];
    const records = {
      'url-fresh': rec('Fresh', { visitCount: 2 }),
      'url-popular': rec('Popular', { visitCount: 9 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['Popular', 'Fresh']);
  });

  // With equal effective visit counts, recency (position in allUrls) is the
  // deterministic tiebreak.
  it('uses recency as the tiebreak when visit counts are equal', () => {
    const allUrls = ['url-new', 'url-mid', 'url-old'];
    const records = {
      'url-new': rec('New', { visitCount: 4 }),
      'url-mid': rec('Mid', { visitCount: 4 }),
      'url-old': rec('Old', { visitCount: 4 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['New', 'Mid', 'Old']);
  });

  // The minimum-visit threshold: a single-visit site doesn't qualify; bump it to
  // the threshold and it appears.
  it('drops sites below MIN_VISITS, includes them once they reach it', () => {
    const allUrls = ['url-once'];
    expect(rankFavorites(allUrls, { 'url-once': rec('Once', { visitCount: 1 }) })).toEqual(
      []
    );
    expect(
      rankFavorites(allUrls, { 'url-once': rec('Twice', { visitCount: 2 }) }).map(
        (r) => r.title
      )
    ).toEqual(['Twice']);
  });

  // A missing visitCount is treated as 0, so the site falls below threshold and
  // is excluded (and it must not throw).
  it('treats a missing visitCount as 0, below the threshold', () => {
    const allUrls = ['url-a', 'url-b'];
    const records = {
      'url-a': rec('NoCount'), // no visitCount field -> 0
      'url-b': rec('Counted', { visitCount: 3 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['Counted']);
  });

  // De-duplication: http/https/www/trailing-slash variants collapse to a single
  // row, their counts summed, with the most-recent variant as the representative.
  it('collapses cosmetic URL variants into one row with summed counts', () => {
    const allUrls = [
      'url-https://x.com/', // newest
      'url-http://www.x.com',
      'url-https://x.com', // oldest
    ];
    const records = {
      'url-https://x.com/': rec('X New', { visitCount: 1, url: 'https://x.com/' }),
      'url-http://www.x.com': rec('X Www', {
        visitCount: 1,
        url: 'http://www.x.com',
      }),
      'url-https://x.com': rec('X Old', { visitCount: 1, url: 'https://x.com' }),
    };
    const result = rankFavorites(allUrls, records);
    // One collapsed row; summed effective visits (1+1+1=3) clears MIN_VISITS;
    // the most-recent variant is the representative.
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('X New');
    expect(result[0].urlKey).toBe('url-https://x.com/');
  });

  // Open-tab discount: a site visited twice but open in one non-pinned tab drops
  // to effective 1 and falls below threshold; an unrelated open key is harmless.
  it('discounts a currently-open tab, floored against the threshold', () => {
    const allUrls = ['url-a', 'url-b'];
    const records = {
      'url-a': rec('Open', { visitCount: 2 }),
      'url-b': rec('Closed', { visitCount: 2 }),
    };
    // Without the discount both qualify.
    expect(rankFavorites(allUrls, records).map((r) => r.title)).toEqual([
      'Open',
      'Closed',
    ]);
    // url-a open once -> effective 1 < MIN_VISITS, drops out; url-b unaffected.
    const result = rankFavorites(allUrls, records, 5, undefined, {
      openKeys: new Set(['url-a']),
    });
    expect(result.map((r) => r.title)).toEqual(['Closed']);
  });

  // excludedKeys removes matching urlKeys (e.g. pinned/hidden) entirely.
  it('skips urlKeys present in excludedKeys', () => {
    const allUrls = ['url-a', 'url-b', 'url-c'];
    const records = {
      'url-a': rec('Alpha', { visitCount: 3 }),
      'url-b': rec('Bravo', { visitCount: 3 }),
      'url-c': rec('Charlie', { visitCount: 3 }),
    };
    expect(rankFavorites(allUrls, records).map((r) => r.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    const excluded = new Set(['url-b']);
    expect(
      rankFavorites(allUrls, records, 5, excluded).map((r) => r.title)
    ).toEqual(['Alpha', 'Charlie']);
  });

  // The limit argument caps how many favorites are returned.
  it('respects the limit', () => {
    const allUrls = ['url-a', 'url-b', 'url-c', 'url-d'];
    const records = {
      'url-a': rec('A', { visitCount: 3 }),
      'url-b': rec('B', { visitCount: 3 }),
      'url-c': rec('C', { visitCount: 3 }),
      'url-d': rec('D', { visitCount: 3 }),
    };
    expect(rankFavorites(allUrls, records, 2)).toHaveLength(2);
  });

  // Fewer qualifying candidates than the limit returns all of them.
  it('returns fewer than limit when there are fewer qualifying candidates', () => {
    const allUrls = ['url-a'];
    const records = { 'url-a': rec('Only', { visitCount: 2 }) };
    expect(rankFavorites(allUrls, records, 5)).toHaveLength(1);
  });

  // The returned row shape: url derived from the key when absent, title + favicon
  // passed through.
  it('derives url from the key when the record omits it, and shapes the row', () => {
    const allUrls = ['url-https://example.com/path'];
    const records = {
      'url-https://example.com/path': rec('Example', {
        favicon: 'icon.png',
        visitCount: 2,
      }),
    };
    expect(rankFavorites(allUrls, records)).toEqual([
      {
        urlKey: 'url-https://example.com/path',
        url: 'https://example.com/path',
        title: 'Example',
        favicon: 'icon.png',
      },
    ]);
  });
});
