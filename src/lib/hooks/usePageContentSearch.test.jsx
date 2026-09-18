import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { usePageContentSearch } from './usePageContentSearch';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const ACTIVE_TABS = [
  { urlKey: 'url-https://a.com', tabKey: 'tab-301' },
  { urlKey: 'url-https://b.com', tabKey: 'tab-302' },
];

const seedProject = () => {
  seed('activeTabs', ACTIVE_TABS);
  seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
  seed('labels', { Work: { title: 'Work', position: 0, urlKeys: ['url-https://a.com'] } });
  seed('url-https://a.com', { title: 'A' });
  seed('url-https://b.com', { title: 'B' });
  seed('pageTexts', {
    'url-https://a.com': 'this page explains the quota in detail',
    'url-https://b.com': 'nothing relevant here',
  });
};

describe('usePageContentSearch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    vi.useRealTimers();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the default for an optional permission is OFF — nothing is requested, and
  // nothing is scanned, until the user asks
  it('starts ungranted, idle and with no results', async () => {
    seedProject();
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.labels).toHaveProperty('Work'));
    expect(result.current.granted).toBe(false);
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.results).toEqual([]);
  });

  // the scan is MANUAL: typing must never fetch a hundred pages
  it('does not scan until start is called', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.granted).toBe(true));
    expect(result.current.progress).toBeNull();
  });

  // the happy path: permission already held, one of the two pages matches
  it('scans the open tabs and collects the matching pages', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.granted).toBe(true));

    act(() => result.current.start());

    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].urlKey).toBe('url-https://a.com');
    expect(result.current.results[0].snippet.match).toBe('quota');
    expect(result.current.progress).toEqual({ scanned: 2, total: 2 });
  });

  // the permission is requested inside the click, and the scan follows the grant
  it('requests the permission on start and scans once granted', async () => {
    seedProject();
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.labels).toHaveProperty('Work'));

    act(() => result.current.start());

    await waitFor(() => expect(result.current.granted).toBe(true));
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.denied).toBe(false);
  });

  // a refusal is recorded so the panel can explain what still works
  it('records a denial when the permission is refused', async () => {
    seedProject();
    seed('denyPermissions', true);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.labels).toHaveProperty('Work'));

    act(() => result.current.start());

    await waitFor(() => expect(result.current.denied).toBe(true));
    expect(result.current.granted).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  // yesterday's snippets under today's query would highlight a term the box no
  // longer contains
  it('clears results and progress when the query changes', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result, rerender } = renderHook(
      ({ q }) => usePageContentSearch(q, { activeTabs: ACTIVE_TABS }),
      { initialProps: { q: 'quota' } }
    );
    await waitFor(() => expect(result.current.granted).toBe(true));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ q: 'something else' });

    await waitFor(() => expect(result.current.results).toEqual([]));
    expect(result.current.progress).toBeNull();
    expect(result.current.scanning).toBe(false);
  });

  // an empty query has nothing to scan for
  it('does nothing when start is called with no query', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.granted).toBe(true));

    act(() => result.current.start());

    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  // the picker needs the user's real groups
  it('exposes the stored groups for the scope picker', async () => {
    seedProject();
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.labels.Work.title).toBe('Work'));
  });

  // the scope is the user's control over how much of their browsing is touched
  it('scans the chosen group scope rather than the open tabs', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.granted).toBe(true));

    act(() => result.current.setScope('label:Work'));
    act(() => result.current.start());

    await waitFor(() => expect(result.current.scanning).toBe(false));
    // the Work group holds only a.com, so the total is 1 rather than 2
    expect(result.current.progress.total).toBe(1);
    expect(result.current.results).toHaveLength(1);
  });

  // cancel has to stop the run, not just hide it
  it('stops scanning when cancel is called', async () => {
    seedProject();
    seed('grantedPermissions', ['scripting']);
    seed('grantedOrigins', ['<all_urls>']);
    installChromeShim();
    const { result } = renderHook(() => usePageContentSearch('quota', { activeTabs: ACTIVE_TABS }));
    await waitFor(() => expect(result.current.granted).toBe(true));

    act(() => result.current.start());
    act(() => result.current.cancel());

    expect(result.current.scanning).toBe(false);
  });
});
