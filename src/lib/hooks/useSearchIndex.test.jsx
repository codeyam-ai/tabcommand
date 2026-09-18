import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useSearchIndex } from './useSearchIndex';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const seedArchive = () => {
  seed('labels', {
    Work: {
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: ['url-https://github.com/codeyam/tabcommand'],
    },
  });
  seed('allUrls', [
    'url-https://github.com/codeyam/tabcommand',
    'url-https://news.ycombinator.com',
  ]);
  seed('url-https://github.com/codeyam/tabcommand', {
    title: 'codeyam/tabcommand — GitHub',
  });
  seed('url-https://news.ycombinator.com', {
    title: 'Hacker News',
    notes: 'Show HN thread on tab hoarding.',
  });
};

describe('useSearchIndex', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the index covers the WHOLE archive, not just grouped urls
  it('indexes labels and every tracked url', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));

    expect(result.current.search('tabcommand').map((h) => h.id))
      .toContain('url-https://github.com/codeyam/tabcommand');
    expect(result.current.search('Work').map((h) => h.id)).toContain('label-Work');
  });

  // a grouped url carries its group's title and color so results can be
  // sub-sectioned without re-reading the labels map
  it('stamps grouped urls with their group title and color', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));

    const hit = result.current.search('tabcommand')
      .find((h) => h.id === 'url-https://github.com/codeyam/tabcommand');
    expect(hit.urlLabelTitle).toBe('Work');
    expect(hit.urlLabelColor).toBe('#1873E4');
  });

  // an ungrouped url carries no group, which is the signal downstream segmenting
  // uses to route it to the archive rather than to a group sub-section
  it('leaves ungrouped urls without a group title', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));

    const hit = result.current.search('Hacker')
      .find((h) => h.id === 'url-https://news.ycombinator.com');
    expect(hit.urlLabelTitle).toBeUndefined();
  });

  // notes are searchable, and the match reports WHICH field hit — which is what
  // lets the Full Search page split a Notes section out of the same result set
  it('matches on notes as well as titles', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));

    const hit = result.current.search('hoarding')
      .find((h) => h.id === 'url-https://news.ycombinator.com');
    expect(hit).toBeTruthy();
    expect(Object.values(hit.match).flat()).toContain('notes');
  });

  // THE BUG THE REF-HELD BUILD TOKEN FIXES. StrictMode double-invokes the mount
  // effect against ONE shared MiniSearch instance. With the token scoped inside
  // the effect, both builds passed their own guard, both called addAllAsync with
  // the same ids, and the loser rejected on a duplicate id — leaving the index
  // silently half-built and indexVersion never bumping, so a page seeded with a
  // query rendered empty forever.
  it('completes its build under StrictMode double-invocation', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));
    expect(result.current.search('tabcommand').length).toBeGreaterThan(0);
  });

  // no url may be indexed twice, or two results would share a React key
  it('yields no duplicate ids after a rebuild', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));

    await act(async () => {
      chrome.storage.local.set({
        allUrls: [
          'url-https://github.com/codeyam/tabcommand',
          'url-https://news.ycombinator.com',
        ],
      });
    });
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(1));

    const ids = result.current.search('tab').map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // a newly tracked url has to become searchable without a reload
  it('re-indexes when the archive grows', async () => {
    seedArchive();
    installChromeShim();

    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));
    expect(result.current.search('overreacted')).toEqual([]);

    await act(async () => {
      chrome.storage.local.set({ 'url-https://overreacted.io': { title: 'overreacted' } });
      chrome.storage.local.set({
        allUrls: [
          'url-https://github.com/codeyam/tabcommand',
          'url-https://news.ycombinator.com',
          'url-https://overreacted.io',
        ],
      });
    });

    await waitFor(() => expect(result.current.search('overreacted').length).toBeGreaterThan(0));
  });

  // an empty archive must still settle rather than leave consumers waiting on a
  // version bump that never arrives
  it('reports a completed build for an empty archive', async () => {
    installChromeShim();
    const { result } = renderHook(() => useSearchIndex());
    await waitFor(() => expect(result.current.indexVersion).toBeGreaterThan(0));
    expect(result.current.search('anything')).toEqual([]);
  });
});
