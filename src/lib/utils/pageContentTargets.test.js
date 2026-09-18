import { describe, it, expect } from 'vitest';
import pageContentTargets, {
  SCOPE_OPEN_TABS,
  SCOPE_ALL_GROUPED,
  SCOPE_HISTORY,
  LABEL_PREFIX,
  HISTORY_LIMIT,
} from './pageContentTargets';

const ACTIVE_TABS = [
  { urlKey: 'url-https://a.com', tabKey: 'tab-301' },
  { urlKey: 'url-https://b.com', tabKey: 'tab-302' },
];

const LABELS = {
  Work: { title: 'Work', urlKeys: ['url-https://a.com', 'url-https://c.com'] },
  Reading: { title: 'Reading', urlKeys: ['url-https://d.com'] },
};

const RECORDS = {
  'url-https://a.com': { title: 'A', favicon: 'fa', lastVisit: 30 },
  'url-https://b.com': { title: 'B', lastVisit: 10 },
  'url-https://c.com': { title: 'C', lastVisit: 20 },
  'url-https://d.com': { title: 'D', lastVisit: 40 },
};

const base = { activeTabs: ACTIVE_TABS, labels: LABELS, urlRecords: RECORDS };

describe('pageContentTargets', () => {
  // an open tab can be read as the user currently sees it, which is what the
  // tabId selects downstream — so it must be derived, not guessed
  it('derives a numeric tabId from the stored tabKey for open tabs', () => {
    const targets = pageContentTargets(SCOPE_OPEN_TABS, base);
    expect(targets.map((t) => t.tabId)).toEqual([301, 302]);
    expect(targets[0].url).toBe('https://a.com');
    expect(targets[0].title).toBe('A');
    expect(targets[0].favicon).toBe('fa');
  });

  // the group scopes select closed URLs, which have no tab to read
  it('leaves tabId undefined for a URL that is not open', () => {
    const targets = pageContentTargets(`${LABEL_PREFIX}Work`, base);
    const closed = targets.find((t) => t.url === 'https://c.com');
    expect(closed.tabId).toBeUndefined();
  });

  // a URL that is BOTH open and in the group is still read from the live tab
  it('still carries the tabId when a grouped URL happens to be open', () => {
    const targets = pageContentTargets(`${LABEL_PREFIX}Work`, base);
    expect(targets.find((t) => t.url === 'https://a.com').tabId).toBe(301);
  });

  // the widest group scope must reach every group, not just the first
  it('collects every group for the all-grouped scope', () => {
    const urls = pageContentTargets(SCOPE_ALL_GROUPED, base).map((t) => t.url);
    expect(urls).toEqual(['https://a.com', 'https://c.com', 'https://d.com']);
  });

  // reading a page twice would spend two fetches to produce two identical rows
  it('deduplicates a URL that two groups both contain', () => {
    const labels = {
      One: { title: 'One', urlKeys: ['url-https://a.com'] },
      Two: { title: 'Two', urlKeys: ['url-https://a.com'] },
    };
    const targets = pageContentTargets(SCOPE_ALL_GROUPED, { ...base, labels });
    expect(targets).toHaveLength(1);
  });

  // "recent" must mean the same thing here as on the History page
  it('orders the history scope newest-first and caps it', () => {
    const allUrls = Object.keys(RECORDS);
    const targets = pageContentTargets(SCOPE_HISTORY, { ...base, allUrls });
    expect(targets.map((t) => t.title)).toEqual(['D', 'A', 'C', 'B']);
  });

  // a long-lived install holds thousands of URLs; the cap is what keeps the
  // history scope a window onto recent browsing rather than a crawl of all of it
  it('caps the history scope at the documented limit', () => {
    const allUrls = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => `url-https://x${i}.com`);
    expect(pageContentTargets(SCOPE_HISTORY, { ...base, allUrls })).toHaveLength(HISTORY_LIMIT);
  });

  // a URL with nothing known about its recency sorts last rather than poisoning
  // the comparison with a null
  it('sinks undated URLs to the end of the history scope', () => {
    const allUrls = ['url-https://undated.com', 'url-https://a.com'];
    const targets = pageContentTargets(SCOPE_HISTORY, { ...base, allUrls });
    expect(targets.map((t) => t.url)).toEqual(['https://a.com', 'https://undated.com']);
  });

  // a chrome:// page cannot be fetched or scripted, and counting it as scanned
  // would misreport the scan's coverage
  it('drops URLs that are neither http nor https', () => {
    const labels = { Odd: { title: 'Odd', urlKeys: ['url-chrome://extensions', 'url-https://a.com'] } };
    const targets = pageContentTargets(`${LABEL_PREFIX}Odd`, { ...base, labels });
    expect(targets.map((t) => t.url)).toEqual(['https://a.com']);
  });

  // the URL itself is a usable label when the record has no title
  it('falls back to the URL when a record has no title', () => {
    const labels = { L: { title: 'L', urlKeys: ['url-https://untitled.com'] } };
    expect(pageContentTargets(`${LABEL_PREFIX}L`, { ...base, labels })[0].title)
      .toBe('https://untitled.com');
  });

  // an unknown scope, a missing group, or no arguments at all must not throw
  it('returns an empty list for an unknown or missing scope', () => {
    expect(pageContentTargets('nonsense', base)).toEqual([]);
    expect(pageContentTargets(`${LABEL_PREFIX}Ghost`, base)).toEqual([]);
    expect(pageContentTargets(SCOPE_OPEN_TABS)).toEqual([]);
  });
});
