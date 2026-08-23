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

// The rows region inside a card's drop zone. The zone deliberately spans the
// title bar too (so a tab registers as soon as it reaches the card), but a
// cursor up there is not pointing at any particular slot.
export const GROUP_URLS_SELECTOR = '.LabelCollection-urls';

// @hello-pangea/dnd stamps this on every draggable row through the
// draggableProps that Url spreads onto its root.
const DRAGGABLE_ROW_SELECTOR = '[data-rfd-draggable-id]';

const containsPoint = (element, x, y) => {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

// Resolve BOTH the group under the cursor and the slot within it, as
// `{ droppableId, index }` — or null when the point is outside every card.
//
// `onDragEnd` carries no coordinates, and by the time it fires the drop
// animation has already returned the rows to flow, so hit-testing then is
// unreliable. This runs during pointer tracking instead, while the rows are
// still where the user sees them.
//
// `index` is an index into the card's DISPLAYED rows (open tabs first) — the
// same space @hello-pangea/dnd reports — so `applyDrag` translates it onto the
// stored urlKeys order. `draggedId` is the id of the row being dragged; its
// floating clone sits under the cursor by definition, so it is excluded and the
// count describes the list the row is landing in rather than the one it left.
export const dropTargetAtPoint = (x, y, { doc, draggedId } = {}) => {
  const ownerDoc = doc || (typeof document !== 'undefined' ? document : null);
  if (!ownerDoc || typeof ownerDoc.elementFromPoint !== 'function') return null;

  const element = ownerDoc.elementFromPoint(x, y);
  const droppableId = dropTargetIdFromElement(element);
  if (!droppableId) return null;

  const dropzone = element.closest(GROUP_DROPZONE_SELECTOR);
  const rows = Array.from(dropzone.querySelectorAll(DRAGGABLE_ROW_SELECTOR)).filter(
    (row) => row.getAttribute('data-rfd-draggable-id') !== draggedId
  );

  // Over the title bar, the empty-state text, or the slack below the last row:
  // the drop is ambiguous, and appending is what makes "a tab I add to a group
  // shows up at the bottom" true. Landing at 0 is what it used to do.
  const urlsRegion = dropzone.querySelector(GROUP_URLS_SELECTOR);
  if (!urlsRegion || !containsPoint(urlsRegion, x, y)) return { droppableId, index: rows.length };

  // Insert after every row the cursor has passed the middle of.
  const index = rows.filter((row) => {
    const rect = row.getBoundingClientRect();
    return rect.top + rect.height / 2 < y;
  }).length;

  return { droppableId, index };
};

export default dropTargetIdAtPoint;
