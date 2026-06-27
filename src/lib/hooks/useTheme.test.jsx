import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { installChromeShim } from '../utils/chromeShim';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    delete document.documentElement.dataset.theme;
  });

  // dark is the default (the CodeYam home) and mirrors onto the document element
  it('defaults to dark and sets data-theme on the document', async () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('dark');
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark')
    );
  });

  // a persisted theme in storage is hydrated on mount
  it('hydrates a persisted theme from storage', async () => {
    window.localStorage.setItem('theme', JSON.stringify('light'));
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  // toggling flips dark to light, updates the attribute, and persists the choice
  it('toggles from dark to light and persists', async () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get('theme', ({ theme }) => {
            expect(theme).toBe('light');
            resolve();
          })
        )
    );
  });

  // toggling twice returns to the original theme
  it('toggles back to dark after two flips', () => {
    installChromeShim();
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]());
    act(() => result.current[1]());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
