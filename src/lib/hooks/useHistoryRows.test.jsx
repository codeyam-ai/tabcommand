import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useHistoryRows } from './useHistoryRows';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const HOUR = 1000 * 60 * 60;
const DAY = 24 * HOUR;
const startOfToday = new Date().setHours(0, 0, 0, 0);

describe('useHistoryRows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // nothing stored at all yields no rows rather than throwing on the absent keys
  it('returns no rows when there is no history', async () => {
    installChromeShim();
    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toEqual([]));
  });

  // the bug this hook was extracted around: a page visited today that the sweep
  // never auto-closed is dated from `visits` and buckets under Today
  it('dates a visited-today row with no autoClosed entry from its visits', async () => {
    seed('allUrls', ['url-https://laughfactory.com']);
    seed('url-https://laughfactory.com', {
      title: 'Laugh Factory',
      visits: [startOfToday + 9 * HOUR],
    });
    seed('autoClosed', {});
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].ts).toBe(startOfToday + 9 * HOUR);
    expect(result.current.rows[0].bucket).toBe('Today');
  });

  // a sweep close that happened after the last visit is the more recent event,
  // so it wins — the row reads the close time, not the visit time
  it('prefers a newer autoClosed time over the last visit', async () => {
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', visits: [startOfToday + 2 * HOUR] });
    seed('autoClosed', { 'url-https://react.dev': startOfToday + 8 * HOUR });
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].ts).toBe(startOfToday + 8 * HOUR);
  });

  // rows come back newest-first, and an undated row sorts last instead of
  // keeping whatever position allUrls happened to give it
  it('sorts rows newest first with undated rows last', async () => {
    seed('allUrls', ['url-https://old.com', 'url-https://undated.com', 'url-https://new.com']);
    seed('url-https://old.com', { title: 'Old', visits: [startOfToday - 2 * DAY] });
    seed('url-https://undated.com', { title: 'Undated', visitCount: 3 });
    seed('url-https://new.com', { title: 'New', visits: [startOfToday + 10 * HOUR] });
    seed('autoClosed', {});
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.title)).toEqual(['New', 'Old', 'Undated']);
    expect(result.current.rows[2].ts).toBeNull();
  });

  // a record's group color comes from label membership so the row dot matches
  // the group the tab belongs to
  it('colors a row from its label membership', async () => {
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', visits: [startOfToday + HOUR] });
    seed('autoClosed', {});
    seed('labels', {
      Reading: { backgroundColor: '#1F8E43', urlKeys: ['url-https://react.dev'] },
    });
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].color).toBe('#1F8E43');
  });

  // a url-* record with no stored title falls back to the bare url so the row
  // is never blank
  it('falls back to the url when a record has no title', async () => {
    seed('allUrls', ['url-https://untitled.com']);
    seed('url-https://untitled.com', { visits: [startOfToday + HOUR] });
    seed('autoClosed', {});
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].title).toBe('https://untitled.com');
  });

  // the hook stays live: a tab closed while the page is mounted shows up
  // without a remount, via the storage.onChanged listener
  it('reloads when a watched storage key changes', async () => {
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', visits: [startOfToday + HOUR] });
    seed('autoClosed', {});
    installChromeShim();

    const { result } = renderHook(() => useHistoryRows());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    chrome.storage.local.set({
      'url-https://vite.dev': { title: 'Vite', visits: [startOfToday + 2 * HOUR] },
      allUrls: ['url-https://react.dev', 'url-https://vite.dev'],
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows[0].title).toBe('Vite');
  });

  // reopen strips the url- prefix and opens the real url in a new tab
  it('reopens a row by creating a tab for its url', async () => {
    installChromeShim();
    chrome.tabs = { create: vi.fn() };

    const { result } = renderHook(() => useHistoryRows());
    result.current.reopen('url-https://react.dev');

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://react.dev' });
  });

  // the listener is removed on unmount so an unmounted page can't keep
  // re-loading rows in the background
  it('removes its storage listener on unmount', async () => {
    installChromeShim();
    const removeListener = vi.spyOn(chrome.storage.onChanged, 'removeListener');

    const { unmount } = renderHook(() => useHistoryRows());
    unmount();

    expect(removeListener).toHaveBeenCalled();
  });
});
