import { describe, it, expect } from 'vitest';
import { rankFavorites } from './rankFavorites';
import { QUALIFY_MIN } from './visitDecay';

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000;

// rankFavorites scores each site by a TIME-DECAYED sum of its visit timestamps
// (a recent visit worth more than an old one), drops sites below QUALIFY_MIN,
// and orders survivors by that decayed score with recency as the tiebreak. A
// legacy record (visitCount but no `visits`) is seeded lazily. hiddenKeys are
// returned flagged rather than dropped, for the "View All" page. All tests pin
// `now` via options so decay is deterministic.
describe('rankFavorites', () => {
  // Build a record with visit timestamps at the given day-ages (relative to NOW)
  // and a realistic http(s) url derived from the title so it clears the
  // trackable-URL guard.
  const rec = (title, dayAges, over = {}) => ({
    title,
    favicon: '',
    url: `https://${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`,
    visitCount: dayAges.length,
    visits: dayAges.map((d) => Math.round(NOW - d * DAY)).sort((a, b) => a - b),
    ...over,
  });

  const opts = (over = {}) => ({ now: NOW, ...over });

  // Empty or non-array input yields an empty list, never a throw.
  it('returns [] for empty or non-array allUrls', () => {
    expect(rankFavorites([], {}, 5, undefined, opts())).toEqual([]);
    expect(rankFavorites(null, {}, 5, undefined, opts())).toEqual([]);
    expect(rankFavorites(undefined, {}, 5, undefined, opts())).toEqual([]);
  });

  // Keys lacking a record, or whose record has no usable title, are filtered out.
  it('drops keys without a usable record/title', () => {
    const allUrls = ['url-a', 'url-b', 'url-c'];
    const records = {
      'url-a': rec('Alpha', [0, 1]),
      // url-b has no record
      'url-c': { favicon: '', visits: [NOW] }, // record but no title
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(result.map((r) => r.urlKey)).toEqual(['url-a']);
  });

  // Time-decay ordering: two sites with the SAME raw visit count but different
  // recency — the recently-visited one ranks above the stale one.
  it('ranks a recent site above a stale one with the same visit count', () => {
    const allUrls = ['url-stale', 'url-recent'];
    const records = {
      'url-recent': rec('Recent', [1, 2, 3]),
      'url-stale': rec('Stale', [10, 11, 12]),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(result.map((r) => r.title)).toEqual(['Recent', 'Stale']);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  // Qualification threshold — a single visit ~8 days old decays below QUALIFY_MIN
  // and drops; a single recent visit clears it.
  it('drops a single week-plus-old visit but keeps a recent one', () => {
    const stale = rankFavorites(
      ['url-old'],
      { 'url-old': rec('Old', [8]) },
      5,
      undefined,
      opts()
    );
    expect(stale).toEqual([]);
    const fresh = rankFavorites(
      ['url-new'],
      { 'url-new': rec('New', [1]) },
      5,
      undefined,
      opts()
    );
    expect(fresh.map((r) => r.title)).toEqual(['New']);
  });

  // A site visited only twice ~two weeks ago also falls below the threshold.
  it('drops a site visited twice over two weeks', () => {
    const result = rankFavorites(
      ['url-rare'],
      { 'url-rare': rec('Rare', [15, 18]) },
      5,
      undefined,
      opts()
    );
    expect(result).toEqual([]);
  });

  // Legacy migration: a record with visitCount but no `visits` array is seeded
  // from the count so it still qualifies and ranks sensibly.
  it('seeds a legacy visitCount-only record so it still qualifies', () => {
    const allUrls = ['url-legacy'];
    const records = {
      'url-legacy': {
        title: 'Legacy',
        favicon: '',
        url: 'https://legacy.example',
        visitCount: 7, // no `visits` array
      },
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(result.map((r) => r.title)).toEqual(['Legacy']);
    expect(result[0].score).toBeGreaterThan(QUALIFY_MIN);
  });

  // De-duplication: http/https/www/trailing-slash variants collapse to one row,
  // their visit timestamps merged, with the most-recent variant as representative.
  it('collapses cosmetic URL variants and merges their visits', () => {
    const allUrls = ['url-https://x.com/', 'url-http://www.x.com', 'url-https://x.com'];
    const records = {
      'url-https://x.com/': rec('X New', [1], { url: 'https://x.com/' }),
      'url-http://www.x.com': rec('X Www', [2], { url: 'http://www.x.com' }),
      'url-https://x.com': rec('X Old', [3], { url: 'https://x.com' }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('X New');
    expect(result[0].urlKey).toBe('url-https://x.com/');
    // Merged visits across all three variants.
    expect(result[0].recentVisits).toHaveLength(3);
  });

  // Open-tab discount: an open non-pinned tab's most-recent (in-progress) visit
  // is dropped from its history, lowering the score.
  it('discounts an open tab by dropping its most-recent visit', () => {
    // Key and record.url are the same real URL, as they are in storage — open
    // detection reduces both the favorite and the live tab to page identity.
    const allUrls = ['url-https://open.example'];
    const records = { 'url-https://open.example': rec('Open', [0, 1, 2]) };
    const closed = rankFavorites(allUrls, records, 5, undefined, opts());
    const open = rankFavorites(allUrls, records, 5, undefined, opts({
      openKeys: new Set(['url-https://open.example']),
    }));
    expect(open[0].isOpen).toBe(true);
    expect(open[0].recentVisits).toHaveLength(2); // latest dropped
    expect(open[0].score).toBeLessThan(closed[0].score);
  });

  // hiddenKeys are NOT dropped: they're scored, qualified, and flagged isHidden
  // so the View All page can render them dimmed.
  it('flags hiddenKeys as isHidden instead of dropping them', () => {
    const allUrls = ['url-shown', 'url-hidden'];
    const records = {
      'url-shown': rec('Shown', [0, 1]),
      'url-hidden': rec('Hidden', [0, 1]),
    };
    const result = rankFavorites(allUrls, records, Infinity, undefined, opts({
      hiddenKeys: new Set(['url-hidden']),
    }));
    const byTitle = Object.fromEntries(result.map((r) => [r.title, r.isHidden]));
    expect(byTitle).toEqual({ Shown: false, Hidden: true });
  });

  // excludedKeys removes matching urlKeys (e.g. pinned) entirely.
  it('skips urlKeys present in excludedKeys', () => {
    const allUrls = ['url-a', 'url-b'];
    const records = {
      'url-a': rec('Alpha', [0, 1]),
      'url-b': rec('Bravo', [0, 1]),
    };
    const excluded = new Set(['url-b']);
    const result = rankFavorites(allUrls, records, 5, excluded, opts());
    expect(result.map((r) => r.title)).toEqual(['Alpha']);
  });

  // The limit caps how many favorites are returned; Infinity leaves it uncapped.
  it('respects a numeric limit and an Infinity uncapped limit', () => {
    const allUrls = ['url-a', 'url-b', 'url-c', 'url-d'];
    const records = {
      'url-a': rec('A', [0, 1]),
      'url-b': rec('B', [0, 1]),
      'url-c': rec('C', [0, 1]),
      'url-d': rec('D', [0, 1]),
    };
    expect(rankFavorites(allUrls, records, 2, undefined, opts())).toHaveLength(2);
    expect(rankFavorites(allUrls, records, Infinity, undefined, opts())).toHaveLength(4);
  });

  // The returned row carries the stats the View All page needs.
  it('shapes the row with score, visitCount-in-window, lastVisit and recentVisits', () => {
    const allUrls = ['url-https://example.com/path'];
    const visits = [NOW - 2 * DAY, NOW - 1 * DAY];
    const records = {
      'url-https://example.com/path': {
        title: 'Example',
        favicon: 'icon.png',
        visits,
      },
    };
    const [row] = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(row.urlKey).toBe('url-https://example.com/path');
    expect(row.url).toBe('https://example.com/path');
    expect(row.title).toBe('Example');
    expect(row.favicon).toBe('icon.png');
    expect(row.isOpen).toBe(false);
    expect(row.isHidden).toBe(false);
    expect(row.visitCount).toBe(2);
    expect(row.lastVisit).toBe(NOW - 1 * DAY);
    expect(row.recentVisits).toEqual(visits);
    expect(row.score).toBeGreaterThan(QUALIFY_MIN);
  });

  // Defensive trackable-URL guard: a stored non-website key is excluded even with
  // many visits, while real sites rank.
  it('drops stored non-website entries like about:blank and file://', () => {
    const allUrls = ['url-about:blank', 'url-file:///Users/x/doc.html', 'url-real'];
    const records = {
      'url-about:blank': rec('Blank', [0, 1, 2], { url: 'about:blank' }),
      'url-file:///Users/x/doc.html': rec('Doc', [0, 1], {
        url: 'file:///Users/x/doc.html',
      }),
      'url-real': rec('Real Site', [0, 1], { url: 'https://example.com' }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts());
    expect(result.map((r) => r.title)).toEqual(['Real Site']);
  });

  // A favorite that differs from an open tab only by its ?query (a Google-Doc
  // ?tab= in-page rewrite) is still flagged open — page identity (origin+path),
  // not the exact urlKey, decides the open cue, matching the tab-group view.
  it('flags a favorite open when a live tab is on the same page but a different query', () => {
    const docBase = 'https://docs.google.com/document/d/ABC/edit';
    const allUrls = [`url-${docBase}?tab=t.old`];
    const records = {
      [`url-${docBase}?tab=t.old`]: rec('Ambiguity Everywhere', [0, 1, 2], {
        url: `${docBase}?tab=t.old`,
      }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      // The live tab has drifted to a NEW ?tab= value.
      openKeys: new Set([`url-${docBase}?tab=t.new`]),
    }));
    expect(result[0].isOpen).toBe(true);
  });

  // No regression: an exact urlKey match (no query at all) still lights the cue.
  it('still flags a favorite open on an exact live-tab match', () => {
    const allUrls = ['url-https://example.com/x'];
    const records = {
      'url-https://example.com/x': rec('Exact', [0, 1, 2], {
        url: 'https://example.com/x',
      }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      openKeys: new Set(['url-https://example.com/x']),
    }));
    expect(result[0].isOpen).toBe(true);
  });

  // Page identity keeps distinct PATHS distinct: a favorite on /a is NOT flagged
  // open just because a live tab is open on /b of the same origin.
  it('does not flag a favorite open when the live tab is a different path on the same origin', () => {
    const allUrls = ['url-https://example.com/a'];
    const records = {
      'url-https://example.com/a': rec('Page A', [0, 1, 2], {
        url: 'https://example.com/a',
      }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      openKeys: new Set(['url-https://example.com/b']),
    }));
    expect(result[0].isOpen).toBe(false);
  });

  // Rows are SITE-level now: two pages of one host — even query-distinct ones —
  // roll into a single row whose representative is the most-recent member, and
  // whose visits are the merged history. The open cue still comes from page
  // identity, so a live tab query-drifted off one of the members still lights the
  // site's row.
  it('rolls query-distinct pages of one site into a single row and keeps the open cue', () => {
    const allUrls = [
      'url-https://shop.example/item?id=1',
      'url-https://shop.example/item?id=2',
    ];
    const records = {
      'url-https://shop.example/item?id=1': rec('Item One', [0, 1, 2], {
        url: 'https://shop.example/item?id=1',
      }),
      'url-https://shop.example/item?id=2': rec('Item Two', [0, 1, 2], {
        url: 'https://shop.example/item?id=2',
      }),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      openKeys: new Set(['url-https://shop.example/item?id=99']),
    }));
    // One row — both pages share the host `shop.example`.
    expect(result).toHaveLength(1);
    // The representative is the most-recent — i.e. lowest-index — member.
    expect(result[0].title).toBe('Item One');
    // It lights up: same origin+path as the live tab, despite query drift.
    expect(result[0].isOpen).toBe(true);
  });

  // The DURABLE store is the authoritative history: a site whose url-* record was
  // evicted and recreated carries only a single visit on the record, yet its row
  // must reflect the full history siteVisits retained. This is the reported bug —
  // a daily-visited site rendering "1 visit" — expressed at the ranking layer.
  it('ranks from siteVisits when the url record was evicted and recreated', () => {
    const allUrls = ['url-https://en.wikipedia.org/wiki/Main_Page'];
    const records = {
      // Recreated from scratch: one visit, moments ago.
      'url-https://en.wikipedia.org/wiki/Main_Page': rec('Wikipedia', [0], {
        url: 'https://en.wikipedia.org/wiki/Main_Page',
      }),
    };
    const durable = [1, 2, 3, 4, 5, 6].map((d) => NOW - d * DAY);
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      siteVisits: { 'en.wikipedia.org': durable },
    }));
    expect(result).toHaveLength(1);
    // The record's single visit UNIONED with the six durable ones — not 1.
    expect(result[0].visitCount).toBe(7);
    expect(result[0].recentVisits).toHaveLength(7);
  });

  // Union-with-dedupe, not either-or: the service worker writes the SAME visit to
  // both stores with the same epoch-ms, so the duplicate must collapse rather
  // than double-count the visit.
  it('dedupes a visit present in both the record and siteVisits', () => {
    const shared = NOW - 2 * DAY;
    const allUrls = ['url-https://a.com/page'];
    const records = {
      'url-https://a.com/page': { title: 'A', visits: [shared], url: 'https://a.com/page' },
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      siteVisits: { 'a.com': [shared] },
    }));
    expect(result).toHaveLength(1);
    // One visit, not two — the bit-identical timestamp collapsed.
    expect(result[0].visitCount).toBe(1);
  });

  // A heavy content site: the homepage plus many article pages become ONE row,
  // and the site's durable history — not any single page's — drives the count.
  it('rolls a content site homepage and its articles into one row', () => {
    const allUrls = [
      'url-https://www.espn.com',
      'url-https://www.espn.com/nfl/story/1',
      'url-https://www.espn.com/nba/standings',
    ];
    const records = {
      'url-https://www.espn.com': rec('ESPN', [0], { url: 'https://www.espn.com' }),
      'url-https://www.espn.com/nfl/story/1': rec('A story', [0], {
        url: 'https://www.espn.com/nfl/story/1',
      }),
      'url-https://www.espn.com/nba/standings': rec('Standings', [0], {
        url: 'https://www.espn.com/nba/standings',
      }),
    };
    const durable = [1, 2, 3, 4, 5].map((d) => NOW - d * DAY);
    const result = rankFavorites(allUrls, records, 5, undefined, opts({
      siteVisits: { 'espn.com': durable },
    }));
    // One ESPN row, not a homepage row plus two orphan article rows.
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('ESPN');
  });

  // An empty/absent siteVisits store is the pre-upgrade world: ranking must fall
  // back cleanly to the per-record visits so a fresh profile never throws.
  it('ranks from record visits alone when siteVisits is absent', () => {
    const allUrls = ['url-https://a.com'];
    const records = { 'url-https://a.com': rec('A', [0, 1, 2], { url: 'https://a.com' }) };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({}));
    expect(result).toHaveLength(1);
    expect(result[0].visitCount).toBe(3);
  });

  // Reproduction: a search-engine host with a heavy, at-the-cap siteVisits history
  // (the "google.com, 50 visits at the top" bug) must never qualify as a Favorite.
  // Red if the isSearchEngineUrl guard is removed from rankFavorites: google.com
  // rolls up 50 recent visits, clears QUALIFY_MIN, and returns a length-1 array.
  it('excludes search-engine hosts from Favorites despite heavy visit history', () => {
    const allUrls = ['url-google-search'];
    const records = {
      'url-google-search': {
        title: 'weather - Google Search',
        favicon: '',
        url: 'https://www.google.com/search?q=weather',
        visitCount: 50,
        visits: [],
      },
    };
    // Durable site store at the cap, all recent — what pins it at #1 before the fix.
    const siteVisits = {
      'google.com': Array.from({ length: 50 }, (_, i) => Math.round(NOW - i * 60 * 60 * 1000)),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({ siteVisits }));
    expect(result).toEqual([]);
  });

  // Real favorites survive alongside searches: a heavily-searched google.com is
  // dropped while a genuinely-revisited github.com still qualifies and ranks.
  it('keeps a genuinely revisited site while dropping a search engine', () => {
    const allUrls = ['url-https://www.google.com/search?q=x', 'url-https://github.com'];
    const records = {
      'url-https://www.google.com/search?q=x': {
        title: 'x - Google Search',
        favicon: '',
        url: 'https://www.google.com/search?q=x',
        visitCount: 40,
        visits: [],
      },
      'url-https://github.com': rec('GitHub', [0, 1, 2, 3, 4], { url: 'https://github.com' }),
    };
    const siteVisits = {
      'google.com': Array.from({ length: 40 }, (_, i) => Math.round(NOW - i * 60 * 60 * 1000)),
      'github.com': [0, 1, 2, 3, 4].map((d) => NOW - d * DAY),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({ siteVisits }));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('GitHub');
  });

  // A Google ccTLD search (google.co.uk) and a non-Google engine (bing.com) are
  // both excluded — the exclusion isn't limited to the exact google.com host.
  it('excludes google ccTLD and other engine hosts too', () => {
    const allUrls = ['url-https://www.google.co.uk/search?q=x', 'url-https://bing.com/search?q=y'];
    const records = {
      'url-https://www.google.co.uk/search?q=x': {
        title: 'x - Google', favicon: '', url: 'https://www.google.co.uk/search?q=x', visits: [],
      },
      'url-https://bing.com/search?q=y': {
        title: 'y - Bing', favicon: '', url: 'https://bing.com/search?q=y', visits: [],
      },
    };
    const siteVisits = {
      'google.co.uk': Array.from({ length: 30 }, (_, i) => Math.round(NOW - i * 60 * 60 * 1000)),
      'bing.com': Array.from({ length: 30 }, (_, i) => Math.round(NOW - i * 60 * 60 * 1000)),
    };
    const result = rankFavorites(allUrls, records, 5, undefined, opts({ siteVisits }));
    expect(result).toEqual([]);
  });
});
