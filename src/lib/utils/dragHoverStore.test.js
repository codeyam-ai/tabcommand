import { describe, it, expect, beforeEach } from 'vitest';
import { getDragHover, setDragHover, subscribeDragHover } from './dragHoverStore';

// The store is a module-level singleton; reset it to the idle state before each
// test so cases do not leak hover state into one another.
beforeEach(() => {
  setDragHover({ cursorActive: false, dropId: null });
});

describe('dragHoverStore', () => {
  // setting a hover target is reflected by the next read
  it('reflects an updated hover target', () => {
    setDragHover({ cursorActive: true, dropId: '1-LabelCollection-urls-Work' });
    expect(getDragHover()).toEqual({ cursorActive: true, dropId: '1-LabelCollection-urls-Work' });
  });

  // subscribers are notified when the hover target changes
  it('notifies subscribers on a change', () => {
    let calls = 0;
    const unsubscribe = subscribeDragHover(() => { calls += 1; });
    setDragHover({ cursorActive: true, dropId: null });
    expect(calls).toBe(1);
    unsubscribe();
  });

  // identical updates are deduped so cards do not re-render needlessly
  it('does not notify when the value is unchanged', () => {
    setDragHover({ cursorActive: true, dropId: 'a-LabelCollection-urls-Reading' });
    let calls = 0;
    const unsubscribe = subscribeDragHover(() => { calls += 1; });
    setDragHover({ cursorActive: true, dropId: 'a-LabelCollection-urls-Reading' });
    expect(calls).toBe(0);
    unsubscribe();
  });

  // a changed dropId with the same cursorActive flag still notifies
  it('notifies when only the dropId changes', () => {
    setDragHover({ cursorActive: true, dropId: 'a-LabelCollection-urls-Reading' });
    let calls = 0;
    const unsubscribe = subscribeDragHover(() => { calls += 1; });
    setDragHover({ cursorActive: true, dropId: 'b-LabelCollection-urls-Shopping' });
    expect(calls).toBe(1);
    unsubscribe();
  });

  // unsubscribing stops further notifications to that listener
  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeDragHover(() => { calls += 1; });
    unsubscribe();
    setDragHover({ cursorActive: true, dropId: 'x-LabelCollection-urls-Work' });
    expect(calls).toBe(0);
  });

  // every active subscriber is notified on a change
  it('notifies multiple subscribers', () => {
    let a = 0;
    let b = 0;
    const unsubA = subscribeDragHover(() => { a += 1; });
    const unsubB = subscribeDragHover(() => { b += 1; });
    setDragHover({ cursorActive: true, dropId: 'y-LabelCollection-urls-Social' });
    expect(a).toBe(1);
    expect(b).toBe(1);
    unsubA();
    unsubB();
  });
});
