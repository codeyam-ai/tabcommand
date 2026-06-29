import { describe, it, expect } from 'vitest';
import { rankFavorites } from './rankFavorites';

// rankFavorites QUALIFIES Favorites frequency-first (de-duplicate cosmetic URL
// variants, sum effective visits, discount currently-open tabs, drop sites below
// a minimum-visit threshold) and then ORDERS the survivors by a frequency ×
// recency-decay blend, with recency (position in allUrls) as the deterministic
// tiebreak for equal scores. Each row also carries an `isOpen` render hint. These
// tests pin that contract.
describe('rankFavorites', () => {
  // Records carry a realistic http(s) url (derived from the title) so they clear
  // the trackable-URL guard, mirroring production where every stored key is a
  // real navigated website. A test that needs a specific url (dedup variants,
  // non-website junk) passes its own `url` in `over`, which wins.
  const rec = (title, over = {}) => ({
    title,
    favicon: '',
    url: `https://${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`,
    ...over,
  });

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

  // With equal effective visit counts, the recency decay orders newest-first
  // (and recency remains the deterministic tiebreak for any exact score tie).
  it('orders newest-first when visit counts are equal', () => {
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
    // Built inline (not via rec) so the record genuinely OMITS url — the row's
    // url must then be derived from the trackable key itself.
    const records = {
      'url-https://example.com/path': {
        title: 'Example',
        favicon: 'icon.png',
        visitCount: 2,
      },
    };
    expect(rankFavorites(allUrls, records)).toEqual([
      {
        urlKey: 'url-https://example.com/path',
        url: 'https://example.com/path',
        title: 'Example',
        favicon: 'icon.png',
        isOpen: false,
      },
    ]);
  });

  // Recency decay flips an order frequency alone would not: a more-recent, LOWER
  // -frequency site outranks a much-older, HIGHER-frequency one once both clear
  // the threshold. (By raw count alone, Stale's 6 would beat Recent's 3.)
  it('lets recency decay rank a recent lower-frequency site above a stale heavier one', () => {
    const allUrls = ['url-recent', 'url-f1', 'url-f2', 'url-f3', 'url-stale'];
    const records = {
      'url-recent': rec('Recent', { visitCount: 3 }),
      'url-stale': rec('Stale', { visitCount: 6 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['Recent', 'Stale']);
  });

  // The decay must not change WHO qualifies, only the order: the oldest retained
  // site (recency weight at the floor, never zero) still appears as long as its
  // RAW effective visits clear the threshold.
  it('does not let recency decay drop an oldest-but-qualifying site', () => {
    const allUrls = ['url-new', 'url-old'];
    const records = {
      'url-new': rec('New', { visitCount: 9 }),
      'url-old': rec('Old', { visitCount: 2 }), // oldest -> weight = floor, not 0
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['New', 'Old']);
  });

  // Defensive trackable-URL guard: a stored non-website key (about:blank /
  // file://) is excluded even with a high visit count, while real sites rank.
  it('drops stored non-website entries like about:blank and file:// from the ranking', () => {
    const allUrls = ['url-about:blank', 'url-file:///Users/x/doc.html', 'url-real'];
    const records = {
      'url-about:blank': rec('Blank', { visitCount: 99, url: 'about:blank' }),
      'url-file:///Users/x/doc.html': rec('Doc', {
        visitCount: 50,
        url: 'file:///Users/x/doc.html',
      }),
      'url-real': rec('Real Site', { visitCount: 3, url: 'https://example.com' }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['Real Site']);
  });

  // isOpen render hint: true for a row whose site is in openKeys, false otherwise.
  // The site must still clear the threshold after the open-tab discount.
  it('flags isOpen for an open favorite and not for a closed one', () => {
    const allUrls = ['url-open', 'url-closed'];
    const records = {
      'url-open': rec('Open', { visitCount: 3 }), // 3 - 1 discount = 2, qualifies
      'url-closed': rec('Closed', { visitCount: 3 }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, {
      openKeys: new Set(['url-open']),
    });
    const byTitle = Object.fromEntries(result.map((r) => [r.title, r.isOpen]));
    expect(byTitle).toEqual({ Open: true, Closed: false });
  });

  // isOpen fires when ANY variant of a collapsed site is open, even if the open
  // variant is not the representative row that renders.
  it('flags isOpen when a non-representative variant is the open one', () => {
    const allUrls = ['url-https://x.com/', 'url-https://x.com'];
    const records = {
      'url-https://x.com/': rec('X New', { visitCount: 2, url: 'https://x.com/' }),
      'url-https://x.com': rec('X Old', { visitCount: 2, url: 'https://x.com' }),
    };
    // The older variant (not the representative) is the open one.
    const result = rankFavorites(allUrls, records, 5, undefined, {
      openKeys: new Set(['url-https://x.com']),
    });
    expect(result).toHaveLength(1);
    expect(result[0].urlKey).toBe('url-https://x.com/'); // newest is representative
    expect(result[0].isOpen).toBe(true);
  });
});
