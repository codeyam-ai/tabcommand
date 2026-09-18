import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { usePersistedPageQuery } from './usePersistedPageQuery';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
const storedPage = () => JSON.parse(window.localStorage.getItem('uxSettings')).page;

describe('usePersistedPageQuery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the point of the hook: a reload lands back on the same search
  it('persists a changed query to uxSettings.page', async () => {
    seed('uxSettings', { page: { name: 'Search', query: 'tab' } });
    installChromeShim();

    const { rerender } = renderHook(({ q }) => usePersistedPageQuery(q, 1), {
      initialProps: { q: 'tab' },
    });
    await act(async () => { rerender({ q: 'tabs' }); });

    await waitFor(() => expect(storedPage().query).toBe('tabs'));
    expect(storedPage().name).toBe('Search');
  });

  // writing back the query we were just handed would fire a storage change
  // event before the user has typed a thing — and the search index listens to it
  it('does not write on the first render', async () => {
    seed('uxSettings', { page: { name: 'Search', query: 'tab' } });
    installChromeShim();
    window.localStorage.removeItem('uxSettings');

    renderHook(() => usePersistedPageQuery('tab', 1));
    await new Promise((r) => setTimeout(r, 20));
    expect(window.localStorage.getItem('uxSettings')).toBeNull();
  });

  // THE NAVIGATION RACE: a debounce still pending when the user clicks a result
  // must not drag them back to search on the next reload
  it('does not write once the app has navigated off the search page', async () => {
    seed('uxSettings', { page: { name: 'Search', query: 'tab' } });
    installChromeShim();

    const { rerender } = renderHook(({ q }) => usePersistedPageQuery(q, 5), {
      initialProps: { q: 'tab' },
    });
    await act(async () => { rerender({ q: 'tabs' }); });

    // The user activates a result: the app routes Home before the debounce fires.
    await act(async () => {
      chrome.storage.local.set({ uxSettings: { page: { name: 'Home' } } });
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(storedPage().name).toBe('Home');
    expect(storedPage().query).toBeUndefined();
  });

  // a burst of keystrokes must cost one write, not one per character
  it('debounces rapid query changes into a single write', async () => {
    seed('uxSettings', { page: { name: 'Search', query: '' } });
    installChromeShim();

    let writes = 0;
    const realSet = chrome.storage.local.set;
    chrome.storage.local.set = (...args) => { writes += 1; return realSet(...args); };

    const { rerender } = renderHook(({ q }) => usePersistedPageQuery(q, 20), {
      initialProps: { q: '' },
    });
    await act(async () => { rerender({ q: 't' }); });
    await act(async () => { rerender({ q: 'ta' }); });
    await act(async () => { rerender({ q: 'tab' }); });

    await waitFor(() => expect(storedPage().query).toBe('tab'));
    expect(writes).toBe(1);
  });

  // an absent uxSettings must not throw — a fresh profile has no page yet
  it('tolerates missing uxSettings', async () => {
    installChromeShim();
    const { rerender } = renderHook(({ q }) => usePersistedPageQuery(q, 1), {
      initialProps: { q: 'tab' },
    });
    await act(async () => { rerender({ q: 'tabs' }); });
    await new Promise((r) => setTimeout(r, 20));
    expect(window.localStorage.getItem('uxSettings')).toBeNull();
  });
});
