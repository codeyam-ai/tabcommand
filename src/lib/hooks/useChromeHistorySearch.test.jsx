import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useChromeHistorySearch } from './useChromeHistorySearch';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const HISTORY = [
  { url: 'https://developer.chrome.com/docs/extensions/reference/tabs/',
    title: 'chrome.tabs | Chrome Extensions', lastVisitTime: 2 },
  { url: 'https://news.ycombinator.com', title: 'Hacker News', lastVisitTime: 1 },
];

describe('useChromeHistorySearch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the default for an optional permission is OFF — nothing is requested until
  // the user asks for it
  it('is inactive and ungranted by default', async () => {
    installChromeShim();
    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(result.current.granted).toBe(false);
    expect(result.current.hits).toEqual([]);
  });

  // the happy path: both halves agree, so the section renders and queries run
  it('is active when the preference is set and the permission is held', async () => {
    seed('settings', { includeChromeHistory: true });
    seed('grantedPermissions', ['history']);
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.active).toBe(true));
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    expect(result.current.hits[0].urlTitle).toBe('chrome.tabs | Chrome Extensions');
  });

  // THE REVOCATION CASE: preference says yes, Chrome says no. The feature must
  // fall back cleanly rather than calling an API it no longer holds.
  it('stays inactive when the preference is set but the permission was revoked', async () => {
    seed('settings', { includeChromeHistory: true });
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.granted).toBe(false));
    expect(result.current.active).toBe(false);
    expect(result.current.hits).toEqual([]);
  });

  // a url TabCommand already tracks is dropped — the tracked record carries the
  // group, the notes and the open-tab state a raw history entry has none of
  it('drops hits for urls already in the index', async () => {
    seed('settings', { includeChromeHistory: true });
    seed('grantedPermissions', ['history']);
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch(
      'tab', ['url-https://developer.chrome.com/docs/extensions/reference/tabs/']
    ));
    await waitFor(() => expect(result.current.active).toBe(true));
    // Both entries match "tab"; the tracked one is deduped away.
    await waitFor(() => expect(result.current.hits).toEqual([]));
  });

  // an empty query must not fetch the user's entire browsing history
  it('returns no hits for an empty query', async () => {
    seed('settings', { includeChromeHistory: true });
    seed('grantedPermissions', ['history']);
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch('', []));
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.hits).toEqual([]);
  });

  // turning it on for the first time asks for the permission and, once granted,
  // persists the preference so the next visit does not re-ask
  it('requests the permission and persists the preference when switched on', async () => {
    seed('chromeHistory', HISTORY);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.active).toBe(false));

    await act(async () => { result.current.toggle(); });
    await waitFor(() => expect(result.current.granted).toBe(true));
    await waitFor(() => expect(result.current.active).toBe(true));

    expect(JSON.parse(window.localStorage.getItem('settings')).includeChromeHistory).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('grantedPermissions'))).toContain('history');
  });

  // switching off writes the preference but LEAVES the grant — revoking is the
  // user's to do in Chrome, and dropping it here would re-prompt on re-enable
  it('keeps the permission when switched off', async () => {
    seed('settings', { includeChromeHistory: true });
    seed('grantedPermissions', ['history']);
    installChromeShim();

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.active).toBe(true));

    await act(async () => { result.current.toggle(); });
    await waitFor(() => expect(result.current.active).toBe(false));

    expect(JSON.parse(window.localStorage.getItem('settings')).includeChromeHistory).toBe(false);
    expect(result.current.granted).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('grantedPermissions'))).toContain('history');
  });

  // re-enabling when the grant is already held must not prompt again
  it('does not re-request an already-held permission', async () => {
    seed('grantedPermissions', ['history']);
    installChromeShim();
    let requests = 0;
    const realRequest = chrome.permissions.request;
    chrome.permissions.request = (...args) => { requests += 1; return realRequest(...args); };

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.granted).toBe(true));

    await act(async () => { result.current.toggle(); });
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(requests).toBe(0);
  });

  // the preference must not be written when the user dismisses Chrome's prompt
  it('leaves the preference off when the permission request is denied', async () => {
    installChromeShim();
    chrome.permissions.request = (_query, cb) => Promise.resolve().then(() => cb(false));

    const { result } = renderHook(() => useChromeHistorySearch('tab', []));
    await waitFor(() => expect(result.current.active).toBe(false));

    await act(async () => { result.current.toggle(); });
    await waitFor(() => expect(result.current.granted).toBe(false));
    expect(result.current.active).toBe(false);
    expect(window.localStorage.getItem('settings')).toBeNull();
  });
});
