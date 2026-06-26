import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  // defaults to light and mirrors it onto the document element
  it('defaults to light and sets data-theme on the document', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  // an explicit initial theme is honored
  it('honors an explicit initial theme', () => {
    const { result } = renderHook(() => useTheme('dark'));
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  // toggling flips light to dark and updates the document attribute
  it('toggles from light to dark', () => {
    const { result } = renderHook(() => useTheme('light'));
    act(() => result.current[1]());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  // toggling twice returns to the original theme
  it('toggles back to light after two flips', () => {
    const { result } = renderHook(() => useTheme('light'));
    act(() => result.current[1]());
    act(() => result.current[1]());
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
