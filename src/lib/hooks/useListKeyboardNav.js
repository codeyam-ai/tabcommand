import { useState, useEffect, useRef, useCallback } from 'react';

import { KeyDown } from '../utils';

// Arrow/Enter/Escape navigation over a flat list of rows, and the selected index
// the list renders its highlight from.
//
// It takes the SAME flat row array the caller renders, which is the whole point:
// the overlay's original arrangement — a running index incremented during render
// beside a separately-assembled activation array — is the shape where arrowing to
// one row and pressing Enter opens another. Here there is one list, so selection
// and activation cannot disagree.
//
// The keydown subscription is made ONCE and reads the current rows and handlers
// through refs. Subscribing on `[rows, onActivate]` instead looks equivalent and
// is not: a caller passing an inline `onActivate` gets a new identity on every
// render, so each arrow keypress re-runs the effect and resets the selection to
// 0 — the selection appears frozen on the first row. The refs make the hook
// correct for any caller rather than only for one that memoises.
//
// The selection resets when the ROW LIST changes, because an index held across a
// new result set points at whatever happens to occupy that slot now.
//
// `meta` is forwarded to `onActivate` rather than interpreted here: what a
// meta-Enter means (open in a background tab) belongs to the caller, not to a
// keyboard-navigation primitive.
export const useListKeyboardNav = (rows, onActivate, { onEscape } = {}) => {
  const [selectedIndex, setSelectedIndexState] = useState(0);

  const selectedRef = useRef(0);
  const rowsRef = useRef(rows);
  const activateRef = useRef(onActivate);
  const escapeRef = useRef(onEscape);

  rowsRef.current = rows;
  activateRef.current = onActivate;
  escapeRef.current = onEscape;

  // Mouse hover and keyboard share one selection, so the pointer has to move the
  // same cursor the arrow keys read — not just the rendered highlight.
  const setSelectedIndex = useCallback((index) => {
    selectedRef.current = index;
    setSelectedIndexState(index);
  }, []);

  useEffect(() => {
    selectedRef.current = 0;
    setSelectedIndexState(0);
  }, [rows]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt/Ctrl combinations belong to the browser and the OS.
      if (e.altKey || e.ctrlKey) return;

      if (e.key === 'Escape') {
        if (escapeRef.current) escapeRef.current();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(Math.min(rowsRef.current.length - 1, selectedRef.current + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(Math.max(0, selectedRef.current - 1));
      } else if (e.key === 'Enter') {
        // Coerced to a real boolean: a synthetic event carries no `metaKey` at
        // all, and handing a caller `undefined` for "was meta held" makes every
        // downstream `=== false` check quietly wrong.
        activateRef.current(rowsRef.current[selectedRef.current], !!e.metaKey);
      }
    };

    KeyDown.add(handleKeyDown);
    return () => KeyDown.remove(handleKeyDown);
  }, [setSelectedIndex]);

  return { selectedIndex, setSelectedIndex };
};

export default useListKeyboardNav;
