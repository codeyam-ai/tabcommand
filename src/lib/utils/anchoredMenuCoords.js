// Viewport coordinates for a menu/panel anchored to a button, for the case where
// the menu is rendered through a portal with `position: fixed` to escape an
// ancestor's `overflow: hidden`.
//
// Right-aligns the menu to the anchor's right edge, clamps it inside the
// viewport horizontally, and flips it ABOVE the anchor when there isn't room
// below — a control sitting low in a scrolling grid would otherwise open its
// menu off the bottom of the screen. A menu taller than the viewport still
// starts on screen rather than above it.
//
// Pure arithmetic: `rect` is any {top, bottom, right}, so callers pass a real
// getBoundingClientRect() and tests pass a literal.
const DEFAULT_MARGIN = 8;
const DEFAULT_GAP = 6;

const anchoredMenuCoords = (
  rect,
  { width, height, margin = DEFAULT_MARGIN, gap = DEFAULT_GAP } = {}
) => {
  const left = Math.max(
    margin,
    Math.min(rect.right - width, window.innerWidth - width - margin)
  );

  const below = rect.bottom + gap;
  const top = below + height > window.innerHeight - margin
    ? Math.max(margin, rect.top - height - gap)
    : below;

  return { top, left };
};

export default anchoredMenuCoords;
