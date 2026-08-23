import { describe, it, expect } from 'vitest';
import {
  dropTargetIdFromElement,
  dropTargetIdAtPoint,
  dropTargetAtPoint,
  GROUP_DROPZONE_SELECTOR,
  GROUP_URLS_SELECTOR
} from './dropTargeting';

// A fake element whose `closest` returns `dropzone` only when asked for the
// group dropzone selector, mirroring how the real DOM resolves an ancestor.
const elementClosestTo = (dropzone) => ({
  closest: (selector) => (selector === GROUP_DROPZONE_SELECTOR ? dropzone : null)
});

const dropzoneWithId = (id) => ({
  getAttribute: (name) => (name === 'data-rfd-droppable-id' ? id : null)
});

describe('dropTargetIdFromElement', () => {
  // an element inside a group card resolves to that card's droppableId
  it('returns the droppableId of the enclosing group dropzone', () => {
    const dropzone = dropzoneWithId('2-LabelCollection-urls-Work');
    const element = elementClosestTo(dropzone);
    expect(dropTargetIdFromElement(element)).toBe('2-LabelCollection-urls-Work');
  });

  // an element not inside any group card resolves to nothing
  it('returns null when the element has no group dropzone ancestor', () => {
    const element = elementClosestTo(null);
    expect(dropTargetIdFromElement(element)).toBeNull();
  });

  // a missing element is tolerated rather than throwing
  it('returns null for a null element', () => {
    expect(dropTargetIdFromElement(null)).toBeNull();
  });

  // a non-element value without closest is tolerated rather than throwing
  it('returns null when the value has no closest method', () => {
    expect(dropTargetIdFromElement({})).toBeNull();
  });

  // a dropzone missing the data attribute yields null, not undefined
  it('returns null when the dropzone has no droppable id attribute', () => {
    const dropzone = { getAttribute: () => null };
    expect(dropTargetIdFromElement(elementClosestTo(dropzone))).toBeNull();
  });
});

describe('dropTargetIdAtPoint', () => {
  // the point resolves through elementFromPoint to the group under it
  it('returns the droppableId of the group under the point', () => {
    const dropzone = dropzoneWithId('0-LabelCollection-urls-Social');
    const doc = { elementFromPoint: () => elementClosestTo(dropzone) };
    expect(dropTargetIdAtPoint(120, 80, doc)).toBe('0-LabelCollection-urls-Social');
  });

  // a point over empty space resolves to nothing
  it('returns null when no element is under the point', () => {
    const doc = { elementFromPoint: () => null };
    expect(dropTargetIdAtPoint(0, 0, doc)).toBeNull();
  });

  // a point over a non-group element resolves to nothing
  it('returns null when the element under the point is outside any group', () => {
    const doc = { elementFromPoint: () => elementClosestTo(null) };
    expect(dropTargetIdAtPoint(5, 5, doc)).toBeNull();
  });

  // an absent document is tolerated rather than throwing
  it('returns null when no document is available', () => {
    expect(dropTargetIdAtPoint(10, 10, null)).toBeNull();
  });

  // a document without elementFromPoint is tolerated rather than throwing
  it('returns null when the document cannot hit-test points', () => {
    expect(dropTargetIdAtPoint(10, 10, {})).toBeNull();
  });
});

// A group card stub: a dropzone carrying `id`, holding draggable rows at the
// given vertical bands, plus a `.LabelCollection-urls` region covering `urls`.
// Rects are the only geometry the resolver reads, so bands are enough.
const rect = ({ top, bottom, left = 0, right = 200 }) => ({
  top, bottom, left, right, height: bottom - top
});

const groupCard = ({ id, rows, urls }) => {
  const rowNodes = rows.map(({ draggableId, top, bottom }) => ({
    getAttribute: (name) => (name === 'data-rfd-draggable-id' ? draggableId : null),
    getBoundingClientRect: () => rect({ top, bottom })
  }));

  const urlsRegion = urls ? { getBoundingClientRect: () => rect(urls) } : null;

  return {
    getAttribute: (name) => (name === 'data-rfd-droppable-id' ? id : null),
    querySelectorAll: (selector) =>
      (selector === '[data-rfd-draggable-id]' ? rowNodes : []),
    querySelector: (selector) =>
      (selector === GROUP_URLS_SELECTOR ? urlsRegion : null)
  };
};

// Three rows stacked 100-140, 140-180, 180-220 inside a urls region of 100-300,
// so the midpoints the resolver counts against are 120, 160 and 200.
const threeRowCard = (id = '0-LabelCollection-urls-Work') => groupCard({
  id,
  urls: { top: 100, bottom: 300 },
  rows: [
    { draggableId: 'row-a', top: 100, bottom: 140 },
    { draggableId: 'row-b', top: 140, bottom: 180 },
    { draggableId: 'row-c', top: 180, bottom: 220 }
  ]
});

const docOver = (dropzone) => ({
  elementFromPoint: () => (dropzone ? elementClosestTo(dropzone) : null)
});

describe('dropTargetAtPoint', () => {
  // the index counts the rows whose vertical midpoint the cursor has passed
  it('resolves the index from the row midpoints under the cursor', () => {
    const doc = docOver(threeRowCard());

    expect(dropTargetAtPoint(50, 105, { doc })).toEqual({
      droppableId: '0-LabelCollection-urls-Work', index: 0
    });
    expect(dropTargetAtPoint(50, 145, { doc })).toEqual({
      droppableId: '0-LabelCollection-urls-Work', index: 1
    });
    expect(dropTargetAtPoint(50, 185, { doc })).toEqual({
      droppableId: '0-LabelCollection-urls-Work', index: 2
    });
  });

  // the dragged row's own clone sits under the cursor by definition, so it is
  // excluded — the count describes the list the row is landing in
  it('excludes the dragged row from the index count', () => {
    const doc = docOver(threeRowCard());

    // y=185 is past row-a's and row-b's midpoints; dragging row-a leaves only
    // row-b above the cursor, so the drop is index 1 rather than 2
    expect(dropTargetAtPoint(50, 185, { doc, draggedId: 'row-a' })).toEqual({
      droppableId: '0-LabelCollection-urls-Work', index: 1
    });
  });

  // over the title bar the drop is ambiguous, and appending is what makes
  // "a tab added to a group shows up at the bottom" true
  it('appends when the point is above the rows region, over the title bar', () => {
    const doc = docOver(threeRowCard());

    // y=40 sits outside the 100-300 rows region entirely
    expect(dropTargetAtPoint(50, 40, { doc })).toEqual({
      droppableId: '0-LabelCollection-urls-Work', index: 3
    });
  });

  // an empty group has no rows and no midpoints, so any drop appends at zero
  it('appends at zero for a group with no rows', () => {
    const doc = docOver(groupCard({
      id: '1-LabelCollection-urls-Empty',
      urls: { top: 100, bottom: 300 },
      rows: []
    }));

    expect(dropTargetAtPoint(50, 150, { doc })).toEqual({
      droppableId: '1-LabelCollection-urls-Empty', index: 0
    });
  });

  // a card with no rows region at all still resolves, appending rather than throwing
  it('appends when the card has no rows region', () => {
    const doc = docOver(groupCard({
      id: '2-LabelCollection-urls-Odd',
      urls: null,
      rows: [{ draggableId: 'row-a', top: 100, bottom: 140 }]
    }));

    expect(dropTargetAtPoint(50, 120, { doc })).toEqual({
      droppableId: '2-LabelCollection-urls-Odd', index: 1
    });
  });

  // a point outside every group card is not a drop at all
  it('returns null when the point is over no group card', () => {
    expect(dropTargetAtPoint(5, 5, { doc: docOver(null) })).toBeNull();
    expect(
      dropTargetAtPoint(5, 5, { doc: { elementFromPoint: () => elementClosestTo(null) } })
    ).toBeNull();
  });

  // an unusable document is tolerated rather than throwing
  it('returns null when the document cannot hit-test points', () => {
    expect(dropTargetAtPoint(10, 10, { doc: null })).toBeNull();
    expect(dropTargetAtPoint(10, 10, { doc: {} })).toBeNull();
  });
});
