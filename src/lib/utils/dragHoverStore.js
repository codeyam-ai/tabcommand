// External store for the whole "is a drag in flight" signal: cursor-based
// ("hover") drop-target highlighting, plus a `dragActive` flag the lists read to
// hold their updates until the drag ends.
//
// Deliberately kept OUTSIDE React state: updating the hovered group during an
// @hello-pangea/dnd drag must NOT re-render App / Labels / Tabs. Re-rendering
// the subtree that holds the tab being dragged makes the library cancel the
// drag mid-flight ("the tab won't drag"). Group cards subscribe to this store
// individually (via a boolean selector), so only the card gaining or losing the
// highlight repaints as the cursor moves between groups — the dragged tab's
// tree never churns.
//
// `dragActive` is that same concern one level up: a background storage write
// (a load sample, a tab closing) would otherwise re-render — and re-order — a
// list mid-drag. It is set for EVERY drag, keyboard included, unlike
// `cursorActive`, which is FLUID-mouse-only by design. The two are owned by
// different things: `cursorActive` by pointer tracking, `dragActive` by the
// drag lifecycle, so neither clears the other.

let state = { cursorActive: false, dropId: null, dragActive: false };
const listeners = new Set();
const dragActiveListeners = new Set();

export const getDragHover = () => state;

export const setDragHover = (next) => {
  if (next.cursorActive === state.cursorActive && next.dropId === state.dropId) return;
  // Merge, don't replace: clearing hover at drag end must not clobber
  // `dragActive`, which is still true until the lifecycle itself clears it.
  state = { ...state, cursorActive: next.cursorActive, dropId: next.dropId };
  listeners.forEach((listener) => listener());
};

export const subscribeDragHover = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDragActive = () => state.dragActive;

export const setDragActive = (next) => {
  if (next === state.dragActive) return;
  state = { ...state, dragActive: next };
  dragActiveListeners.forEach((listener) => listener());
};

// Separate listener set from the hover subscription: flipping `dragActive` must
// not wake every group card's hover selector, and vice versa.
export const subscribeDragActive = (listener) => {
  dragActiveListeners.add(listener);
  return () => dragActiveListeners.delete(listener);
};
