import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDragHover,
  setDragHover,
  subscribeDragHover,
  getDragActive,
  setDragActive,
  subscribeDragActive
} from './dragHoverStore';

// The store is a module-level singleton; reset it to the idle state before each
// test so cases do not leak hover or drag state into one another.
beforeEach(() => {
  setDragHover({ cursorActive: false, dropId: null });
  setDragActive(false);
});

describe('dragHoverStore', () => {
  // setting a hover target is reflected by the next read. The snapshot also
  // carries `dragActive` — one state object, because useSyncExternalStore needs
  // a stable snapshot identity across reads.
  it('reflects an updated hover target', () => {
    setDragHover({ cursorActive: true, dropId: '1-LabelCollection-urls-Work' });
    expect(getDragHover()).toEqual({
      cursorActive: true,
      dropId: '1-LabelCollection-urls-Work',
      dragActive: false
    });
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

describe('dragActive', () => {
  // the flag starts idle and reflects what the drag lifecycle last set
  it('reflects the drag-active flag it was set to', () => {
    expect(getDragActive()).toBe(false);
    setDragActive(true);
    expect(getDragActive()).toBe(true);
    setDragActive(false);
    expect(getDragActive()).toBe(false);
  });

  // lists subscribe to this to know when to flush the updates they buffered
  it('notifies subscribers on a drag-active transition', () => {
    let calls = 0;
    const unsubscribe = subscribeDragActive(() => { calls += 1; });
    setDragActive(true);
    expect(calls).toBe(1);
    setDragActive(false);
    expect(calls).toBe(2);
    unsubscribe();
  });

  // repeated identical sets are deduped, so a list never flushes twice
  it('does not notify when the drag-active value is unchanged', () => {
    setDragActive(true);
    let calls = 0;
    const unsubscribe = subscribeDragActive(() => { calls += 1; });
    setDragActive(true);
    expect(calls).toBe(0);
    unsubscribe();
  });

  // unsubscribing stops further notifications to that listener
  it('stops notifying drag-active subscribers after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeDragActive(() => { calls += 1; });
    unsubscribe();
    setDragActive(true);
    expect(calls).toBe(0);
  });

  // clearing hover at drag end must not clear the drag-active flag: hover is
  // owned by pointer tracking, dragActive by the drag lifecycle.
  it('keeps the drag-active flag when hover is cleared', () => {
    setDragActive(true);
    setDragHover({ cursorActive: true, dropId: '1-LabelCollection-urls-Work' });
    setDragHover({ cursorActive: false, dropId: null });
    expect(getDragActive()).toBe(true);
  });

  // and the reverse: the drag lifecycle must not disturb cursor hover state
  it('leaves the hover state untouched when the drag-active flag changes', () => {
    setDragHover({ cursorActive: true, dropId: '2-LabelCollection-urls-Reading' });
    setDragActive(true);
    expect(getDragHover().cursorActive).toBe(true);
    expect(getDragHover().dropId).toBe('2-LabelCollection-urls-Reading');
  });

  // the two signals use separate listener sets, so neither wakes the other
  it('does not notify hover subscribers when only drag-active changes', () => {
    let hoverCalls = 0;
    const unsubscribe = subscribeDragHover(() => { hoverCalls += 1; });
    setDragActive(true);
    expect(hoverCalls).toBe(0);
    unsubscribe();
  });
});
