import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useTheme } from './useTheme';

// Install a controllable matchMedia mock for '(prefers-color-scheme: dark)'.
// Returns helpers to flip the system theme and assert listener cleanup.
const mockMatchMedia = (initialDark) => {
  let matches = initialDark;
  const listeners = new Set();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => mql);
  return {
    setDark: (dark) => {
      matches = dark;
      for (const fn of listeners) fn({ matches });
    },
    listenerCount: () => listeners.size,
  };
};

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    delete document.documentElement.dataset.theme;
    // jsdom has no matchMedia by default; ensure each test starts without it
    // unless it opts in via mockMatchMedia.
    delete window.matchMedia;
  });

  afterEach(() => {
    delete window.matchMedia;
  });

  // The default preference is 'system'; with no matchMedia it falls back to dark
  // (the CodeYam home) and mirrors onto the document element.
  it('defaults to system, resolves dark without matchMedia, and sets data-theme', async () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark')
    );
  });

  // A persisted themePreference is hydrated on mount and pins the resolved theme.
  it('hydrates a persisted themePreference from storage', async () => {
    window.localStorage.setItem('themePreference', JSON.stringify('light'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  // Migration: an explicit legacy `theme: 'light'` seeds a Day (light) preference.
  it('migrates a legacy light theme to a light preference', async () => {
    window.localStorage.setItem('theme', JSON.stringify('light'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('light'));
    await waitFor(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get('themePreference', ({ themePreference }) => {
            expect(themePreference).toBe('light');
            resolve();
          })
        )
    );
  });

  // The toggle is a temporary in-memory override: it flips the resolved theme
  // WITHOUT writing the preference (or any theme value) to storage.
  it('toggles the resolved theme in-memory without persisting', async () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('dark'));

    act(() => result.current[1]());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    // No themePreference (and no legacy theme) was written by the toggle.
    await new Promise((resolve) =>
      chrome.storage.local.get(['themePreference', 'theme'], (stored) => {
        expect(stored.themePreference).toBeUndefined();
        resolve();
      })
    );
  });

  // Toggling twice returns to the base resolved theme.
  it('returns to the base resolved theme after two flips', async () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('dark'));
    act(() => result.current[1]());
    act(() => result.current[1]());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  // An explicit light/dark preference resolves directly, ignoring the system.
  it('resolves an explicit light preference regardless of system theme', async () => {
    mockMatchMedia(true); // system is dark
    window.localStorage.setItem('themePreference', JSON.stringify('light'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('light'));
  });

  // System preference follows matchMedia, and a `change` event updates the
  // resolved theme live AND clears any active override.
  it('follows matchMedia in system mode and a change clears the override', async () => {
    const media = mockMatchMedia(false); // system starts light
    window.localStorage.setItem('themePreference', JSON.stringify('system'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('light'));

    // Temporary override flips the display to dark...
    act(() => result.current[1]());
    expect(result.current[0]).toBe('dark');

    // ...and a real OS transition both follows the system and clears the override.
    act(() => media.setDark(true));
    expect(result.current[0]).toBe('dark');
    act(() => media.setDark(false));
    expect(result.current[0]).toBe('light');
  });

  // Changing themePreference in storage updates the resolved theme and clears an
  // active override (cross-surface sync from the Settings panel).
  it('reacts to a themePreference storage change and clears the override', async () => {
    mockMatchMedia(true); // system dark
    window.localStorage.setItem('themePreference', JSON.stringify('system'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('dark'));

    // Active override flips display to light.
    act(() => result.current[1]());
    expect(result.current[0]).toBe('light');

    // Settings writes 'dark' → preference updates and the override is dropped.
    await act(async () => {
      chrome.storage.local.set({ themePreference: 'dark' });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current[0]).toBe('dark'));
  });

  // Listener cleanup: the matchMedia change listener is removed on unmount.
  it('removes the matchMedia listener on unmount', async () => {
    const media = mockMatchMedia(false);
    installChromeShim();
    const { unmount } = renderHook(() => useTheme());
    await waitFor(() => expect(media.listenerCount()).toBe(1));
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
