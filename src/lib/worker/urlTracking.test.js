import { describe, it, expect, vi } from 'vitest';
import {
  ACCESS_THROTTLE_MS,
  getUrlKey,
  newUrl,
  recordAccess,
  tabUpdates,
  urlUpdates,
} from './urlTracking';

// Fake worker deps. `getStorage` answers every query with the whole `storage`
// snapshot, in both its callback and promise forms, like the worker's
// area-aware read does against a stubbed chrome.storage.
function makeDeps({ storage = {}, tab, validTab } = {}) {
  return {
    getStorage: vi.fn((_query, callback) => {
      if (callback) {
        callback(storage);
        return new Promise(() => {});
      }
      return Promise.resolve(storage);
    }),
    getTab: vi.fn(async () => tab),
    removeRecord: vi.fn(),
    validTab: validTab || ((t) => Boolean(t.url) && t.url.indexOf('chrome://') === -1),
    processesIndex: { global: 0 },
    onVisit: vi.fn(),
  };
}

describe('getUrlKey', () => {
  // builds a url- prefixed key, stripping any hash fragment
  it('prefixes with url- and strips the fragment', () => {
    expect(getUrlKey('https://a.com/p')).toBe('url-https://a.com/p');
    expect(getUrlKey('https://a.com/p#section')).toBe('url-https://a.com/p');
  });
});

describe('urlUpdates', () => {
  // initializes a processes bucket and copies tab metadata
  it('initializes processes and copies title/favicon/groupId', () => {
    const out = urlUpdates(
      { url: 'https://a.com' },
      { status: 'complete', title: 'A', favIconUrl: 'a.png', groupId: 5, url: 'https://a.com' }
    );
    expect(out.title).toBe('A');
    expect(out.favicon).toBe('a.png');
    expect(out.groupId).toBe(5);
    expect(out.processes.samples).toBe(0);
  });

  // accumulates process stats and bumps the sample counter
  it('accumulates process stats when a process is supplied', () => {
    const out = urlUpdates(
      { url: 'https://b.com', title: 'B' },
      { status: 'complete', title: 'B', url: 'https://b.com', groupId: -1 },
      { cpu: 10, network: 2, privateMemory: 1, jsMemoryAllocated: 1, jsMemoryUsed: 1 },
      { global: 1 }
    );
    expect(out.processes.samples).toBe(1);
    expect(out.processes.cpu).toBe(10);
  });

  // the sample counter bumps once per worker sample: a second process for the
  // same tab url in the same sample adds its stats without a second bump
  it('counts one sample per url per processes index', () => {
    const processesIndex = { global: 1 };
    const tab = { status: 'complete', title: 'B', url: 'https://b.com', groupId: -1 };
    const record = urlUpdates({ url: 'https://b.com', title: 'B' }, tab, { cpu: 1 }, processesIndex);
    urlUpdates(record, tab, { cpu: 2 }, processesIndex);
    expect(record.processes.samples).toBe(1);
    expect(record.processes.cpu).toBe(3);
    expect(processesIndex['https://b.com']).toBe(1);
  });

  // falls back to the url as the title when the tab has none
  it('uses the url as title when title is missing', () => {
    const out = urlUpdates({ url: 'https://c.com' }, { status: 'complete', url: 'https://c.com' });
    expect(out.title).toBe('https://c.com');
  });

  // an edited record keeps its user title/favicon instead of taking the live tab's values
  it('preserves an edited title and favicon', () => {
    const out = urlUpdates(
      { url: 'https://a.com', title: 'My Title', favicon: 'mine.png', edited: true },
      { status: 'complete', title: 'Live Title', favIconUrl: 'live.png', groupId: -1, url: 'https://a.com' }
    );
    expect(out.title).toBe('My Title');
    expect(out.favicon).toBe('mine.png');
  });

  // a non-edited record still takes the live tab's title/favicon (guards the flag's scope)
  it('still copies the live title and favicon when not edited', () => {
    const out = urlUpdates(
      { url: 'https://a.com', title: 'Old', favicon: 'old.png' },
      { status: 'complete', title: 'Live Title', favIconUrl: 'live.png', groupId: -1, url: 'https://a.com' }
    );
    expect(out.title).toBe('Live Title');
    expect(out.favicon).toBe('live.png');
  });

  // a tab whose title is just its url must not overwrite a real stored title
  it('keeps a real title when the live tab reports its raw url', () => {
    const out = urlUpdates(
      { url: 'https://example.com/page', title: 'Example Page', favicon: 'ex.png' },
      { status: 'complete', title: 'example.com/page', favIconUrl: '', groupId: 7, url: 'https://example.com/page' }
    );
    expect(out.title).toBe('Example Page');
    expect(out.favicon).toBe('ex.png');
  });

  // the raw-url guard only blocks downgrades: a record still showing its url
  // fallback is upgraded by the first real title the tab reports
  it('upgrades a raw-url placeholder title to the real title', () => {
    const out = urlUpdates(
      { url: 'https://example.com/page', title: 'https://example.com/page' },
      { status: 'complete', title: 'Example Page', groupId: -1, url: 'https://example.com/page' }
    );
    expect(out.title).toBe('Example Page');
  });

  // a page with no <title> keeps its url fallback, since Chrome reports the url
  it('keeps the url fallback for a page with no real title', () => {
    const out = urlUpdates(
      { url: 'https://example.com/page' },
      { status: 'complete', title: 'example.com/page', groupId: -1, url: 'https://example.com/page' }
    );
    expect(out.title).toBe('example.com/page');
  });
});

describe('newUrl', () => {
  // returns undefined when called without a tab id or url
  it('returns early without tabId/url', async () => {
    const deps = makeDeps();
    await expect(newUrl(deps, undefined, 'https://a.com')).resolves.toBeUndefined();
    await expect(newUrl(deps, 1, undefined)).resolves.toBeUndefined();
  });

  // every call refreshes the worker's activeTabs first, even one that records
  // nothing, matching the worker's pre-split behavior
  it('calls onVisit before recording', async () => {
    const deps = makeDeps();
    await newUrl(deps, undefined, 'https://a.com');
    expect(deps.onVisit).toHaveBeenCalledTimes(1);
  });

  // a record rebuilt from a snapshot with no title/favicon takes them from the
  // live tab, so a standalone newUrl write can't strip the row's display fields
  it('fills a missing title and favicon from the live tab', async () => {
    const deps = makeDeps({
      storage: { allUrls: [], labels: {} },
      tab: { id: 1, url: 'https://new.com', title: 'New Site', favIconUrl: 'n.png', status: 'complete' },
    });
    const updates = await newUrl(deps, 1, 'https://new.com');
    expect(updates['url-https://new.com'].title).toBe('New Site');
    expect(updates['url-https://new.com'].favicon).toBe('n.png');
  });

  // a live tab that has navigated elsewhere must not lend its title to this url
  it('ignores a live tab showing a different url', async () => {
    const deps = makeDeps({
      storage: { allUrls: [], labels: {} },
      tab: { id: 1, url: 'https://other.com', title: 'Other', favIconUrl: 'o.png' },
    });
    const updates = await newUrl(deps, 1, 'https://new.com');
    expect(updates['url-https://new.com'].title).toBeUndefined();
    expect(updates['url-https://new.com'].favicon).toBeUndefined();
  });

  // a closed tab makes the live tab lookup reject; the visit is still recorded
  it('still records the visit when the live tab lookup fails', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    deps.getTab.mockRejectedValue(new Error('No tab with id: 1'));
    const updates = await newUrl(deps, 1, 'https://new.com');
    expect(updates['url-https://new.com'].visitCount).toBe(1);
  });

  // adds a brand-new url key to the front of allUrls
  it('prepends an unseen url key to allUrls', async () => {
    const deps = makeDeps({ storage: { allUrls: ['url-old'], labels: {} } });
    const updates = await newUrl(deps, 1, 'https://new.com');
    expect(updates.allUrls[0]).toBe('url-https://new.com');
  });

  // REGRESSION: a REVISIT must move the url key back to the front of allUrls.
  // allUrls is the recency list the tracked-URL cap trims from the TAIL, so a
  // key that never moves on revisit drifts out, gets evicted, and has its whole
  // url-* record — visits and all — deleted. That is what reset a daily-visited
  // site to "1 visit".
  it('moves a revisited url key to the front of allUrls', async () => {
    const deps = makeDeps({
      storage: {
        allUrls: ['url-https://new.com', 'url-https://a.com', 'url-https://b.com'],
        labels: {},
      },
    });
    const updates = await newUrl(deps, 1, 'https://b.com');
    expect(updates.allUrls[0]).toBe('url-https://b.com');
    expect(updates.allUrls).toHaveLength(3);
  });

  // keys pushed past the tracked-url cap have their records removed, except
  // keys a label still holds, whose records the group needs
  it('removes evicted records that no label holds', async () => {
    const allUrls = Array.from({ length: 501 }, (_, i) => `url-https://pad-${i}.com`);
    const deps = makeDeps({
      storage: { allUrls, labels: { Work: { urlKeys: ['url-https://pad-500.com'] } } },
    });
    const updates = await newUrl(deps, 1, 'https://new.com');
    expect(updates.allUrls).toHaveLength(500);
    expect(deps.removeRecord).toHaveBeenCalledWith('url-https://pad-499.com');
    expect(deps.removeRecord).not.toHaveBeenCalledWith('url-https://pad-500.com');
  });

  // Deleting from History means "forget this", not "block this" — a deliberate
  // return to the page is the user asking for it back, so a real visit clears
  // the tombstone and the key is re-added to allUrls as normal.
  it('clears the deletedUrls tombstone when the page is revisited', async () => {
    const deps = makeDeps({
      storage: { allUrls: [], labels: {}, deletedUrls: { 'url-https://b.com': Date.now() } },
    });
    const updates = await newUrl(deps, 1, 'https://b.com');
    expect(updates.deletedUrls['url-https://b.com']).toBeUndefined();
    expect(updates.allUrls[0]).toBe('url-https://b.com');
  });

  // Tombstones are pruned on the same pass that already prunes allUrls, so the
  // map is bounded by DELETED_URL_TTL_MS instead of growing one entry per
  // page ever deleted. An unrelated FRESH tombstone must survive the prune.
  it('prunes expired tombstones but keeps fresh ones', async () => {
    const now = Date.now();
    const deps = makeDeps({
      storage: {
        allUrls: [],
        labels: {},
        deletedUrls: {
          'url-https://stale.com': now - 2 * 60 * 60 * 1000,
          'url-https://fresh.com': now - 1000,
        },
      },
    });
    const updates = await newUrl(deps, 1, 'https://b.com');
    expect(updates.deletedUrls['url-https://stale.com']).toBeUndefined();
    expect(updates.deletedUrls['url-https://fresh.com']).toBe(now - 1000);
  });

  // The durable half of a visit: it accumulates under the site's HOST in
  // siteVisits, which the eviction branch never touches.
  it('records the visit under the site host in siteVisits', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    const before = Date.now();
    const updates = await newUrl(deps, 1, 'https://www.espn.com/nfl/story/id/1');
    expect(updates.siteVisits['espn.com']).toHaveLength(1);
    expect(updates.siteVisits['espn.com'][0]).toBeGreaterThanOrEqual(before);
  });

  // Every page of a content site credits the SITE, not its own orphan key: a
  // second article on the same host appends to the same siteVisits bucket.
  it('accumulates visits from different pages of one site under one host', async () => {
    const earlier = Date.now() - 1000 * 60 * 60;
    const deps = makeDeps({
      storage: { allUrls: [], labels: {}, siteVisits: { 'espn.com': [earlier] } },
    });
    const updates = await newUrl(deps, 1, 'https://espn.com/nba/standings');
    expect(updates.siteVisits['espn.com']).toHaveLength(2);
    expect(updates.siteVisits['espn.com'][0]).toBe(earlier);
  });

  // siteVisits must SURVIVE the eviction that deletes url-* records: the
  // durable store is written even while the tracked-URL cap is trimming keys,
  // so a site's stats outlive its record. This is the whole point of the store.
  it('keeps siteVisits history for a site whose url record is evicted', async () => {
    const history = [Date.now() - 1000 * 60 * 60 * 24 * 3, Date.now() - 1000 * 60 * 60];
    // A full recency list, so this visit pushes the tail past the cap.
    const allUrls = Array.from({ length: 500 }, (_, i) => `url-https://pad-${i}.com`);
    const deps = makeDeps({
      storage: { allUrls, labels: {}, siteVisits: { 'wikipedia.org': history } },
    });
    const updates = await newUrl(deps, 1, 'https://wikipedia.org/wiki/Main_Page');
    // Keys past the cap were evicted...
    expect(updates.allUrls).toHaveLength(500);
    // ...but the site's history is intact and grew by this visit.
    expect(updates.siteVisits['wikipedia.org']).toHaveLength(history.length + 1);
    expect(updates.siteVisits['wikipedia.org'].slice(0, 2)).toEqual(history);
  });

  // Search engines stay in history (allUrls + visitCount) but stop
  // accumulating the Favorites scoring signal: no siteVisits[host] write and no
  // per-record `visits` append, since rankFavorites discards search hosts anyway.
  // Red if the isSearchEngine gate is removed: siteVisits['google.com'] appears.
  it('records a search engine in history but not in the Favorites scoring stores', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    const url = 'https://www.google.com/search?q=weather';
    const updates = await newUrl(deps, 1, url);
    const urlKey = getUrlKey(url);
    // Still in history: allUrls + visitCount.
    expect(updates.allUrls).toContain(urlKey);
    expect(updates[urlKey].visitCount).toBe(1);
    // But NOT in the Favorites scoring stores.
    expect(updates.siteVisits).toBeUndefined();
    expect(updates[urlKey].visits).toEqual([]);
  });

  // A search engine with an existing siteVisits bucket does not grow it — the
  // durable store stops accumulating search hosts going forward.
  it('does not append to an existing siteVisits bucket for a search engine', async () => {
    const earlier = Date.now() - 1000 * 60 * 60;
    const deps = makeDeps({
      storage: { allUrls: [], labels: {}, siteVisits: { 'google.com': [earlier] } },
    });
    const updates = await newUrl(deps, 1, 'https://www.google.com/search?q=x');
    // siteVisits is left untouched (no write into updates for this host).
    expect(updates.siteVisits).toBeUndefined();
  });

  // Non-website navigations (about:blank, file://, chrome://, data:) are
  // never recorded: newUrl returns before touching storage so they can't
  // enter allUrls or bump visitCount.
  it('does not record non-website URLs', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    for (const url of [
      'about:blank',
      'file:///Users/x/doc.html',
      'chrome://extensions',
      'data:text/html,hi',
    ]) {
      await expect(newUrl(deps, 1, url)).resolves.toBeUndefined();
    }
    expect(deps.getStorage).not.toHaveBeenCalled();
  });

  // A brand-new url records a first visit timestamp alongside visitCount 1, so
  // Favorites can rank by a time-decayed sum of visits.
  it('records a first visit timestamp and visitCount on a new url', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    const before = Date.now();
    const updates = await newUrl(deps, 1, 'https://new.com');
    const record = updates['url-https://new.com'];
    expect(record.visitCount).toBe(1);
    expect(record.visits).toHaveLength(1);
    expect(record.visits[0]).toBeGreaterThanOrEqual(before);
  });

  // Every visit stamps `lastVisit` on the url-* record. This is the recency
  // signal the History page dates rows by; `autoClosed` alone only covers
  // tabs the inactivity sweep closed, so a manually-closed or still-open page
  // had no timestamp and fell into "Earlier this week".
  it('stamps lastVisit on the url record for every visit', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    const before = Date.now();
    const updates = await newUrl(deps, 1, 'https://new.com');
    const record = updates['url-https://new.com'];
    expect(record.lastVisit).toBeGreaterThanOrEqual(before);
    expect(record.lastVisit).toBeLessThanOrEqual(Date.now());
  });

  // The case that motivated putting `lastVisit` OUTSIDE the isSearchEngine
  // gate: a search engine keeps an empty `visits` array (so it stays out of
  // Favorites scoring) but must still be datable on the History page.
  // Red if `lastVisit` is moved inside the gate.
  it('stamps lastVisit on a search engine while leaving visits empty', async () => {
    const deps = makeDeps({ storage: { allUrls: [], labels: {} } });
    const before = Date.now();
    const url = 'https://www.google.com/search?q=weather';
    const updates = await newUrl(deps, 1, url);
    const record = updates[getUrlKey(url)];
    expect(record.visits).toEqual([]);
    expect(record.lastVisit).toBeGreaterThanOrEqual(before);
  });

  // A repeat visit appends a fresh timestamp and increments visitCount while
  // preserving the prior visits and other url-* fields.
  it('appends a visit timestamp on a repeat visit', async () => {
    const oldTs = Date.now() - 1000 * 60 * 60; // an hour ago
    const deps = makeDeps({
      storage: {
        allUrls: ['url-https://a.com'],
        labels: {},
        'url-https://a.com': { url: 'https://a.com', title: 'A', visitCount: 2, visits: [oldTs] },
      },
    });
    const updates = await newUrl(deps, 1, 'https://a.com');
    const record = updates['url-https://a.com'];
    expect(record.title).toBe('A'); // existing fields preserved
    expect(record.visitCount).toBe(3);
    expect(record.visits).toHaveLength(2);
    expect(record.visits[0]).toBe(oldTs);
  });

  // Visits older than the retention horizon are pruned on write, so per-site
  // history stays bounded.
  it('prunes visits older than the retention horizon on write', async () => {
    const ancient = Date.now() - 1000 * 60 * 60 * 24 * 60; // 60 days ago
    const deps = makeDeps({
      storage: {
        allUrls: ['url-https://a.com'],
        labels: {},
        'url-https://a.com': { url: 'https://a.com', visitCount: 5, visits: [ancient] },
      },
    });
    const updates = await newUrl(deps, 1, 'https://a.com');
    const record = updates['url-https://a.com'];
    // The ancient visit is dropped; only the fresh one survives.
    expect(record.visits).toHaveLength(1);
    expect(record.visits).not.toContain(ancient);
  });
});

describe('recordAccess', () => {
  // Switching back to a tab whose last visit is older than the throttle
  // window records a visit (delegating to newUrl), so a kept-open favorite
  // you return to earns rank credit.
  it('records a visit when the last visit is older than the throttle', async () => {
    const stale = Date.now() - ACCESS_THROTTLE_MS - 1000; // just past the window
    const deps = makeDeps({
      tab: { id: 7, url: 'https://a.com' },
      storage: {
        allUrls: ['url-https://a.com'],
        labels: {},
        'url-https://a.com': { url: 'https://a.com', title: 'A', visitCount: 2, visits: [stale] },
      },
    });
    const updates = await recordAccess(deps, 1);
    const record = updates['url-https://a.com'];
    expect(record.visitCount).toBe(3);
    expect(record.visits).toHaveLength(2);
    expect(deps.onVisit).toHaveBeenCalledTimes(1);
  });

  // Re-activating the same site within the throttle window records nothing, so
  // rapid alt-tabbing and the open→activate sequence can't inflate a rank.
  it('records nothing within the throttle window', async () => {
    const recent = Date.now() - 1000 * 60; // a minute ago, well inside 30 min
    const deps = makeDeps({
      tab: { id: 7, url: 'https://a.com' },
      storage: { 'url-https://a.com': { url: 'https://a.com', visitCount: 2, visits: [recent] } },
    });
    await expect(recordAccess(deps, 1)).resolves.toBeUndefined();
    expect(deps.onVisit).not.toHaveBeenCalled();
  });

  // A missing tab (rejected lookup) or a non-trackable URL is ignored — no
  // read, no visit.
  it('ignores missing tabs and non-trackable URLs', async () => {
    const deps = makeDeps();
    deps.getTab.mockRejectedValueOnce(new Error('No tab with id'));
    await expect(recordAccess(deps, 999)).resolves.toBeUndefined();

    deps.getTab.mockResolvedValueOnce({ id: 8, url: 'chrome://extensions' });
    await expect(recordAccess(deps, 8)).resolves.toBeUndefined();
    expect(deps.getStorage).not.toHaveBeenCalled();
  });
});

describe('tabUpdates', () => {
  // resolves an empty object for tabs that fail the validity check
  it('resolves {} for an invalid tab', async () => {
    const deps = makeDeps();
    await expect(tabUpdates(deps, { url: 'chrome://settings' })).resolves.toEqual({});
  });

  // resolves keyed url updates for a valid tab
  it('resolves keyed url updates for a valid tab', async () => {
    const deps = makeDeps();
    const out = await tabUpdates(deps, { url: 'https://a.com', status: 'complete', title: 'A', groupId: -1 });
    expect(out['url-https://a.com']).toBeTruthy();
  });

  // a record already built earlier in the same batch is updated in place of
  // the stored snapshot, so per-process stats accumulate within one sample
  it('builds on an in-batch record instead of the stored one', async () => {
    const deps = makeDeps({ storage: { 'url-https://a.com': { url: 'https://a.com', title: 'Stored' } } });
    const tab = { url: 'https://a.com', status: 'loading', groupId: -1 };
    const out = await tabUpdates(deps, tab, undefined, {
      'url-https://a.com': { url: 'https://a.com', title: 'In batch' },
    });
    expect(out['url-https://a.com'].title).toBe('In batch');
  });
});
