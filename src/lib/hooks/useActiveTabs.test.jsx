import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useActiveTabs } from './useActiveTabs';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const tab = (urlKey, tabKey) => ({ urlKey, tabKey, pinned: false, tabCommandPinned: false });

describe('useActiveTabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // an unseeded store must yield empty arrays, not undefined — the consumer maps
  // over both without guarding
  it('returns empty arrays when nothing is stored', async () => {
    installChromeShim();
    const { result } = renderHook(() => useActiveTabs());
    await waitFor(() => {
      expect(result.current.activeTabs).toEqual([]);
      expect(result.current.indexedUrls).toEqual([]);
    });
  });

  // both keys come back in one read, parsed — the page needs the tabs for its
  // OPEN badges and the url set for the Chrome-history dedupe
  it('reads activeTabs and allUrls on mount', async () => {
    seed('activeTabs', [tab('url-https://react.dev/learn', 'tab-304')]);
    seed('allUrls', ['url-https://react.dev/learn', 'url-https://news.ycombinator.com']);
    installChromeShim();

    const { result } = renderHook(() => useActiveTabs());
    await waitFor(() => expect(result.current.activeTabs).toHaveLength(1));
    expect(result.current.activeTabs[0].tabKey).toBe('tab-304');
    expect(result.current.indexedUrls).toHaveLength(2);
  });

  // the whole reason this is a hook and not a one-shot read: a tab closing while
  // the results are on screen must clear its OPEN badge
  it('re-reads when activeTabs changes', async () => {
    seed('activeTabs', [tab('url-https://react.dev/learn', 'tab-304')]);
    seed('allUrls', ['url-https://react.dev/learn']);
    installChromeShim();

    const { result } = renderHook(() => useActiveTabs());
    await waitFor(() => expect(result.current.activeTabs).toHaveLength(1));

    await act(async () => {
      chrome.storage.local.set({ activeTabs: [] });
    });
    await waitFor(() => expect(result.current.activeTabs).toEqual([]));
  });

  // a newly tracked url must reach the dedupe set, or Chrome history would
  // re-offer a page TabCommand just started tracking
  it('re-reads when allUrls changes', async () => {
    seed('allUrls', ['url-https://react.dev/learn']);
    installChromeShim();

    const { result } = renderHook(() => useActiveTabs());
    await waitFor(() => expect(result.current.indexedUrls).toHaveLength(1));

    await act(async () => {
      chrome.storage.local.set({
        allUrls: ['url-https://react.dev/learn', 'url-https://overreacted.io'],
      });
    });
    await waitFor(() => expect(result.current.indexedUrls).toHaveLength(2));
  });

  // an unrelated write must not churn the page
  it('ignores changes to other keys', async () => {
    seed('activeTabs', [tab('url-https://react.dev/learn', 'tab-304')]);
    installChromeShim();

    const { result } = renderHook(() => useActiveTabs());
    await waitFor(() => expect(result.current.activeTabs).toHaveLength(1));
    const before = result.current.activeTabs;

    await act(async () => {
      chrome.storage.local.set({ autoClosed: { 'url-x': 1 } });
    });
    expect(result.current.activeTabs).toBe(before);
  });

  // a listener left attached would set state on an unmounted component on every
  // subsequent tab change, for the life of the page
  it('detaches its listener on unmount', async () => {
    installChromeShim();
    const { unmount, result } = renderHook(() => useActiveTabs());
    await waitFor(() => expect(result.current.activeTabs).toEqual([]));
    unmount();

    // A write after unmount must not reach a detached listener.
    await act(async () => {
      chrome.storage.local.set({ activeTabs: [tab('url-https://x.com', 'tab-1')] });
    });
    expect(result.current.activeTabs).toEqual([]);
  });
});
