// Cursor-based ("hover") drop targeting for dragging URLs onto group cards.
//
// @hello-pangea/dnd decides the drop target from the CENTER of the dragged
// item, which forces the user to drag deep into a card before it registers.
// These helpers instead resolve the group whose card sits directly under the
// pointer, so a tab drops into whichever group the MOUSE is over. They read the
// droppableId @hello-pangea/dnd stamps on each droppable container
// (`data-rfd-droppable-id`), so the destination still flows through the existing
// `applyDrag` reducer unchanged.

// The full-card URL drop zone rendered by LabelCollection. Its element is the
// URL Droppable's ref, so it carries `data-rfd-droppable-id`.
export const GROUP_DROPZONE_SELECTOR = '.LabelCollection-dropzone';

// Walk up from an element to the group card drop zone it lives in and return
// that zone's droppableId, or null when the element is not inside a group card.
export const dropTargetIdFromElement = (element) => {
  if (!element || typeof element.closest !== 'function') return null;
  const dropzone = element.closest(GROUP_DROPZONE_SELECTOR);
  return dropzone ? dropzone.getAttribute('data-rfd-droppable-id') : null;
};

// Resolve the group droppableId under a viewport point (clientX/clientY). The
// dragged clone is `pointer-events: none` during a drag, so elementFromPoint
// reports the card beneath the cursor rather than the clone.
export const dropTargetIdAtPoint = (x, y, doc = (typeof document !== 'undefined' ? document : null)) => {
  if (!doc || typeof doc.elementFromPoint !== 'function') return null;
  return dropTargetIdFromElement(doc.elementFromPoint(x, y));
};

export default dropTargetIdAtPoint;
