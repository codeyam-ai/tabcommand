import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import KeyDown from '../utils/KeyDown';
import event from '../utils/event';
import { useListKeyboardNav } from './useListKeyboardNav';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const press = (key, over = {}) => act(() => { KeyDown.trigger(event({ key, ...over })); });

describe('useListKeyboardNav', () => {
  beforeEach(() => {
    KeyDown.functions.length = 0;
    document.onkeydown = null;
  });

  afterEach(() => {
    KeyDown.functions.length = 0;
  });

  // the first row is the default target, so Enter with no arrowing opens it
  it('starts on the first row', () => {
    const { result } = renderHook(() => useListKeyboardNav(rows, () => {}));
    expect(result.current.selectedIndex).toBe(0);
  });

  // the basic walk — and the case that broke when the subscription re-ran on
  // every render, freezing the highlight on the first row
  it('moves down and up with the arrow keys', () => {
    const { result } = renderHook(() => useListKeyboardNav(rows, () => {}));
    press('ArrowDown');
    expect(result.current.selectedIndex).toBe(1);
    press('ArrowDown');
    expect(result.current.selectedIndex).toBe(2);
    press('ArrowUp');
    expect(result.current.selectedIndex).toBe(1);
  });

  // arrowing past either end must stay put rather than wrap or go out of bounds
  it('clamps at both ends of the list', () => {
    const { result } = renderHook(() => useListKeyboardNav(rows, () => {}));
    press('ArrowUp');
    expect(result.current.selectedIndex).toBe(0);
    press('ArrowDown'); press('ArrowDown'); press('ArrowDown'); press('ArrowDown');
    expect(result.current.selectedIndex).toBe(2);
  });

  // THE INVARIANT: Enter activates the row the highlight is on, not another
  it('activates the selected row on Enter', () => {
    const onActivate = vi.fn();
    renderHook(() => useListKeyboardNav(rows, onActivate));
    press('ArrowDown');
    press('Enter');
    expect(onActivate).toHaveBeenCalledWith(rows[1], false);
  });

  // meta-Enter is forwarded, not interpreted — the caller decides what it means
  it('forwards the meta modifier to the activation handler', () => {
    const onActivate = vi.fn();
    renderHook(() => useListKeyboardNav(rows, onActivate));
    press('Enter', { metaKey: true });
    expect(onActivate).toHaveBeenCalledWith(rows[0], true);
  });

  // a held index would point at whatever now occupies that slot in a new result
  // set, so a changed list starts over at the top
  it('resets the selection when the row list changes', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useListKeyboardNav(list, () => {}),
      { initialProps: { list: rows } }
    );
    press('ArrowDown');
    expect(result.current.selectedIndex).toBe(1);

    rerender({ list: [{ id: 'x' }] });
    expect(result.current.selectedIndex).toBe(0);
  });

  // Escape is the caller's to interpret — on the page it blurs the query field
  // rather than navigating away
  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useListKeyboardNav(rows, () => {}, { onEscape }));
    press('Escape');
    expect(onEscape).toHaveBeenCalled();
  });

  // Alt and Ctrl combinations belong to the browser and the OS
  it('ignores alt and ctrl combinations', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useListKeyboardNav(rows, onActivate));
    press('ArrowDown', { ctrlKey: true });
    press('Enter', { altKey: true });
    expect(result.current.selectedIndex).toBe(0);
    expect(onActivate).not.toHaveBeenCalled();
  });

  // an empty list must not activate an undefined row or move the selection
  it('does nothing on an empty list', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useListKeyboardNav([], onActivate));
    press('ArrowDown');
    expect(result.current.selectedIndex).toBe(0);
    press('Enter');
    expect(onActivate).toHaveBeenCalledWith(undefined, false);
  });

  // a handler left attached would keep stealing keystrokes after the page is gone
  it('detaches its handler on unmount', () => {
    const onActivate = vi.fn();
    const { unmount } = renderHook(() => useListKeyboardNav(rows, onActivate));
    unmount();
    press('Enter');
    expect(onActivate).not.toHaveBeenCalled();
  });
});
