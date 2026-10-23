import { describe, it, expect } from 'vitest';
import {
  isRawUrlTitle,
  mergeUrlDisplay,
  fillDisplayFromLiveTab,
  mergeTrackingUpdates,
} from './urlRecordDisplay';

// These helpers decide when a url-* record's title/favicon is "real" and keep a
// weaker value (the raw URL Chrome reports as a title, or an empty favicon) from
// overwriting a real one. They back every worker write path and the Url row.
describe('isRawUrlTitle', () => {
  // A missing or blank title carries nothing, so it counts as raw.
  it('treats missing and blank titles as raw', () => {
    expect(isRawUrlTitle(undefined, 'https://a.com')).toBe(true);
    expect(isRawUrlTitle('', 'https://a.com')).toBe(true);
    expect(isRawUrlTitle('   ', 'https://a.com')).toBe(true);
  });

  // The stored fallback is the url itself, verbatim.
  it('treats the exact url as raw', () => {
    expect(isRawUrlTitle('https://example.com/page', 'https://example.com/page')).toBe(true);
  });

  // Chrome shows the url without scheme or www. as a placeholder title.
  it('treats the url without scheme, www, trailing slash or hash as raw', () => {
    expect(isRawUrlTitle('example.com/page', 'https://www.example.com/page/')).toBe(true);
    expect(isRawUrlTitle('www.example.com/page', 'http://example.com/page#top')).toBe(true);
  });

  // A genuine page title, even one that mentions the domain, is real.
  it('treats a genuine title as real', () => {
    expect(isRawUrlTitle('Example Page', 'https://example.com/page')).toBe(false);
    expect(isRawUrlTitle('example.com - Home', 'https://example.com/')).toBe(false);
  });

  // Without a url to compare against, only emptiness can make a title raw.
  it('treats a non-empty title as real when the url is unknown', () => {
    expect(isRawUrlTitle('Anything', undefined)).toBe(false);
  });
});

describe('mergeUrlDisplay', () => {
  // The bug case: a raw-url title and empty favicon don't replace real ones.
  it('keeps the stored real title and favicon over raw incoming values', () => {
    const out = mergeUrlDisplay(
      { url: 'https://a.com', title: 'A Site', favicon: 'a.png' },
      { url: 'https://a.com', title: 'https://a.com', visitCount: 2 }
    );
    expect(out).toEqual({ url: 'https://a.com', title: 'A Site', favicon: 'a.png', visitCount: 2 });
  });

  // A real title change on the site (e.g. an unread-count prefix) still wins.
  it('lets a real incoming title replace a real stored one', () => {
    const out = mergeUrlDisplay(
      { url: 'https://a.com', title: 'Inbox', favicon: 'a.png' },
      { url: 'https://a.com', title: '(3) Inbox', favicon: 'b.png' }
    );
    expect(out.title).toBe('(3) Inbox');
    expect(out.favicon).toBe('b.png');
  });

  // Merging must not mutate either record; storage snapshots are shared.
  it('does not mutate its inputs', () => {
    const stored = { url: 'https://a.com', title: 'A Site' };
    const incoming = { url: 'https://a.com' };
    mergeUrlDisplay(stored, incoming);
    expect(incoming).toEqual({ url: 'https://a.com' });
    expect(stored).toEqual({ url: 'https://a.com', title: 'A Site' });
  });

  // A missing side passes the other through unchanged.
  it('returns incoming unchanged when either side is missing', () => {
    const incoming = { url: 'https://a.com' };
    expect(mergeUrlDisplay(undefined, incoming)).toBe(incoming);
    expect(mergeUrlDisplay({ title: 'X' }, undefined)).toBeUndefined();
  });
});

describe('fillDisplayFromLiveTab', () => {
  // A snapshot with no title/favicon takes them from the live tab.
  it('fills a missing title and favicon from the live tab', () => {
    const record = { url: 'https://new.com', visitCount: 1 };
    fillDisplayFromLiveTab(record, { title: 'New Site', favIconUrl: 'n.png' });
    expect(record.title).toBe('New Site');
    expect(record.favicon).toBe('n.png');
  });

  // A live tab still showing its url as the title adds nothing.
  it('does not copy a raw-url live title', () => {
    const record = { url: 'https://new.com' };
    fillDisplayFromLiveTab(record, { title: 'new.com' });
    expect(record.title).toBeUndefined();
  });

  // An existing real title/favicon is never replaced by this fill.
  it('leaves an existing real title and favicon alone', () => {
    const record = { url: 'https://a.com', title: 'Stored', favicon: 's.png' };
    fillDisplayFromLiveTab(record, { title: 'Live', favIconUrl: 'l.png' });
    expect(record.title).toBe('Stored');
    expect(record.favicon).toBe('s.png');
  });

  // A user-edited record keeps its curated display, even if empty.
  it('skips edited records', () => {
    const record = { url: 'https://a.com', edited: true };
    fillDisplayFromLiveTab(record, { title: 'Live', favIconUrl: 'l.png' });
    expect(record.title).toBeUndefined();
    expect(record.favicon).toBeUndefined();
  });
});

describe('mergeTrackingUpdates', () => {
  // The stale-snapshot case from onCreated/onUpdated: newUrl's record lacks the
  // title/favicon tabUpdates just wrote, and the merge must keep them.
  it('keeps tabUpdates display fields over a stale newUrl snapshot', () => {
    const out = mergeTrackingUpdates(
      { 'url-https://a.com': { url: 'https://a.com', title: 'A Site', favicon: 'a.png', groupId: 3 } },
      { 'url-https://a.com': { url: 'https://a.com', visitCount: 4 }, allUrls: ['url-https://a.com'] }
    );
    expect(out['url-https://a.com']).toEqual({ url: 'https://a.com', title: 'A Site', favicon: 'a.png', visitCount: 4 });
    expect(out.allUrls).toEqual(['url-https://a.com']);
  });

  // Non-url keys keep the plain spread semantics: incoming wins.
  it('lets incoming win for non-url keys', () => {
    const out = mergeTrackingUpdates({ activeTabs: [1] }, { activeTabs: [2] });
    expect(out.activeTabs).toEqual([2]);
  });

  // A url-* record present on only one side passes through as-is.
  it('passes through url records present on only one side', () => {
    const out = mergeTrackingUpdates(
      { 'url-https://a.com': { url: 'https://a.com', title: 'A' } },
      { 'url-https://b.com': { url: 'https://b.com' } }
    );
    expect(out['url-https://a.com'].title).toBe('A');
    expect(out['url-https://b.com']).toEqual({ url: 'https://b.com' });
  });

  // newUrl returns undefined for untrackable urls; the merge must tolerate it.
  it('tolerates an undefined incoming update', () => {
    expect(mergeTrackingUpdates({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});
