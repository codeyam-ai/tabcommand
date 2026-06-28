import { describe, it, expect } from 'vitest';
import { rankFavorites } from './rankFavorites';

// rankFavorites blends recency (dominant) with visit frequency. These tests pin
// the contract the Favorites section depends on: recency leads, visit count
// boosts within the recency-leaning weighting, missing counts default to 0,
// records without a usable title are dropped, and limit/empty inputs behave.
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
      'url-a': rec('Alpha'),
      // url-b has no record
      'url-c': { favicon: '' }, // record but no title
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.urlKey)).toEqual(['url-a']);
  });

  // With equal visit counts, recency order (position in allUrls) decides ranking.
  it('ranks by recency when visit counts are equal', () => {
    const allUrls = ['url-new', 'url-mid', 'url-old'];
    const records = {
      'url-new': rec('New', { visitCount: 2 }),
      'url-mid': rec('Mid', { visitCount: 2 }),
      'url-old': rec('Old', { visitCount: 2 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['New', 'Mid', 'Old']);
  });

  // A tiny recency gap is overcome by a large visit-count gap (the frequency boost).
  it('lets a high-visitCount older site out-rank a barely-newer one', () => {
    // Adjacent positions deep in a long recency list (so the per-position recency
    // gap is tiny) but a big visit-count gap: the frequently-visited older site
    // should climb above the barely-newer one.
    const filler = Array.from({ length: 100 }, (_, i) => `url-pad-${i}`);
    const allUrls = [...filler.slice(0, 40), 'url-fresh', 'url-popular', ...filler.slice(40)];
    const records = {
      'url-fresh': rec('Fresh', { visitCount: 0 }),
      'url-popular': rec('Popular', { visitCount: 50 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result[0].title).toBe('Popular');
  });

  // A large recency gap is NOT overcome by visits — recency is the dominant weight.
  it('keeps recency dominant when the recency gap is large', () => {
    // A far-newer site with zero visits still beats a much older popular site,
    // because recency is the dominant weight.
    const allUrls = ['url-newest', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'url-oldest'];
    const records = {
      'url-newest': rec('Newest', { visitCount: 0 }),
      'url-oldest': rec('Oldest', { visitCount: 999 }),
    };
    const result = rankFavorites(allUrls, records);
    expect(result[0].title).toBe('Newest');
  });

  // A record with no visitCount field is scored as 0 and does not throw.
  it('treats a missing visitCount as 0', () => {
    const allUrls = ['url-a', 'url-b'];
    const records = {
      'url-a': rec('NoCount'), // no visitCount field
      'url-b': rec('Counted', { visitCount: 3 }),
    };
    // url-a is newer (index 0); with both effectively low/zero-vs-some counts,
    // recency should still place NoCount first, and it must not throw.
    const result = rankFavorites(allUrls, records);
    expect(result.map((r) => r.title)).toEqual(['NoCount', 'Counted']);
  });

  // The limit argument caps how many favorites are returned.
  it('respects the limit', () => {
    const allUrls = ['url-a', 'url-b', 'url-c', 'url-d'];
    const records = {
      'url-a': rec('A'),
      'url-b': rec('B'),
      'url-c': rec('C'),
      'url-d': rec('D'),
    };
    expect(rankFavorites(allUrls, records, 2)).toHaveLength(2);
  });

  // Fewer candidates than the limit returns all of them, not a padded list.
  it('returns fewer than limit when there are fewer candidates', () => {
    const allUrls = ['url-a'];
    const records = { 'url-a': rec('Only') };
    expect(rankFavorites(allUrls, records, 5)).toHaveLength(1);
  });

  // The returned row shape: url derived from the key when absent, title + favicon passed through.
  it('derives url from the key when the record omits it, and shapes the row', () => {
    const allUrls = ['url-https://example.com/path'];
    const records = {
      'url-https://example.com/path': rec('Example', { favicon: 'icon.png' }),
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
