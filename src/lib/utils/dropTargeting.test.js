import { describe, it, expect } from 'vitest';
import { dropTargetIdFromElement, dropTargetIdAtPoint, GROUP_DROPZONE_SELECTOR } from './dropTargeting';

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
