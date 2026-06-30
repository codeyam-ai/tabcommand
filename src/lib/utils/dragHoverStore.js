// External store for cursor-based ("hover") drop-target highlighting.
//
// Deliberately kept OUTSIDE React state: updating the hovered group during an
// @hello-pangea/dnd drag must NOT re-render App / Labels / Tabs. Re-rendering
// the subtree that holds the tab being dragged makes the library cancel the
// drag mid-flight ("the tab won't drag"). Group cards subscribe to this store
// individually (via a boolean selector), so only the card gaining or losing the
// highlight repaints as the cursor moves between groups — the dragged tab's
// tree never churns.

let state = { cursorActive: false, dropId: null };
const listeners = new Set();

export const getDragHover = () => state;

export const setDragHover = (next) => {
  if (next.cursorActive === state.cursorActive && next.dropId === state.dropId) return;
  state = next;
  listeners.forEach((listener) => listener());
};

export const subscribeDragHover = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
