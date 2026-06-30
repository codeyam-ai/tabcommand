---
title: "Improve URL Drag-and-Drop onto Groups"
mode: ui
createdAt: "2026-06-29T00:00:00Z"
source: manual
---

## Summary

Dragging a URL/tab onto a group card is harder than it should be: the drop
zone is only the scrollable URL body (`.LabelCollection-urls`), which sits
below the colored title bar, so you have to drag deep into the middle of a
card before `@hello-pangea/dnd` registers it as the drop target. On top of
that, the "ready to receive" feedback is a single subtle `background-color`
swap on that body, which is easy to miss. This plan enlarges the effective
drop target to cover the **entire card** (title bar included) and makes the
hover feedback **dramatic**, tinted with each group's own color so the target
the URL will land in is unmistakable.

## Key Decisions

- **Why the "reach the middle" problem exists** — `@hello-pangea/dnd`
  (react-beautiful-dnd fork) uses *center-based* collision detection: a
  droppable only becomes active when the **center of the dragged item** lands
  inside the droppable's bounding box. The library exposes no threshold/margin
  knob, so the only lever is to make the droppable's box bigger. Today the
  droppable is just `.LabelCollection-urls` (the body under the header), so the
  dragged card's center must travel well into the card body. Expanding the
  droppable to span the full card (header + body) means the center crosses the
  drop zone as soon as it reaches the top of the card — fixing the "middle"
  feel without fighting the library.
- **Expand the droppable to the whole card, not a new approach** — keep
  `@hello-pangea/dnd`; do not introduce native HTML5 DnD or a second library.
  The fix is structural (where the `Droppable` `innerRef` lives) plus CSS, so
  the `applyDrag` reducer and `droppableId` scheme stay untouched.
- **Keep the same `droppableId`** — `applyDrag` in `dragReducer.js` parses the
  destination droppableId via the regex `/[^-]*-LabelCollection-urls-/`. The
  `Droppable`'s `droppableId` must remain `${index}-LabelCollection-urls-${title}`
  exactly, only its `innerRef` element changes. This keeps the reducer and its
  unit tests untouched.
- **Highlight uses the group's own color** (per user) — drive the hover border
  and glow from each group's `backgroundColor` rather than a fixed accent. To
  stay visible even for dark group colors, pair the colored border/glow with a
  strong, consistent body tint and a clear dashed-or-solid accent ring so the
  feedback reads dramatically in both light and dark themes.
- **Highlight the whole card, not just the body** — move the `isDraggingOver`
  styling hook up to the full-card drop zone so the entire card lights up,
  reinforcing the enlarged hit area visually.

## Implementation

### 1. Make the entire card the drop target

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

In `content(provided)`, the outer `.LabelCollection` div already carries the
LABEL_COLLECTION `Draggable`'s `provided.innerRef` (for reordering), so the
URL `Droppable`'s `innerRef` cannot live on that same node. Introduce a single
wrapper element *inside* `.LabelCollection` that the URL `Droppable` owns and
that spans both the title bar and the URL body:

- Wrap the existing `.LabelCollection-title` header **and** the
  `.LabelCollection-urls` body together inside the URL `Droppable`'s render
  prop. The `Droppable`'s `provided.innerRef` + `provided.droppableProps` go on
  a new full-card dropzone wrapper (e.g. `.LabelCollection-dropzone`) that
  contains the header followed by the body.
- Keep the existing `droppableId` (`${index}-LabelCollection-urls-${title}`),
  `direction="vertical"`, and `type={ItemTypes.URL}` exactly as-is so
  `applyDrag` is unaffected.
- The URL `Draggable`s and their active/inactive sections stay where they are
  inside the scrollable `.LabelCollection-urls` body. Render
  `{provided.placeholder}` at the end of the URL list inside that body (as
  today) so insertion spacing still appears in the right place.
- The title bar keeps its `{...provided.dragHandleProps}` from the parent
  LABEL_COLLECTION `Draggable` — a drag handle nested inside an unrelated
  (different `type`) `Droppable` is fine and does not conflict.
- Apply the drag-over class from the URL droppable's `snapshot.isDraggingOver`
  to the full-card dropzone wrapper (replacing today's `UrlOver` toggle on the
  body), so the whole card reflects the hover state.

Watch-outs to verify during implementation:
- The header now sits inside a droppable list. Confirm the placeholder still
  renders only in the body and the header does not visually shift when a URL is
  dragged over (the header is static content, not a `Draggable`, so it should
  not be reordered).
- The body retains its fixed height + `overflow-y: scroll`; the dropzone
  wrapper should not introduce a second scrollbar (let the wrapper be a plain
  flex column: static header, then the scrolling body).

### 2. Make the hover feedback dramatic and group-colored

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

Replace the current minimal rule:

```css
.LabelCollection .LabelCollection-urls.UrlOver {
  background-color: var(--app-bg);
}
```

with a full-card "ready to receive" treatment on the new dropzone wrapper's
drag-over class:

- A thick, high-visibility **accent ring** around the card (e.g. an inset
  `box-shadow` / `outline` of 2–3px) plus an outer **glow** so the active
  target pops away from its neighbors.
- Drive the ring + glow color from the group's own color. Since each group's
  color is only available in JS (`currentBackgroundColor`), pass it into CSS as
  a custom property (e.g. set `style={{ '--group-color': currentBackgroundColor }}`
  on the card or dropzone wrapper in `LabelCollection.jsx`) and reference
  `var(--group-color, var(--c-lime-fg))` in the drag-over rule. Fall back to the
  lime accent (`--c-lime-fg`) when a group has no color set.
- Add a clearly different **body tint** while hovering so the interior also
  signals readiness (a translucent wash of the group color over `--card-bg`,
  strong enough to read in both themes — guard against unreadable results for
  very dark group colors by layering the wash over a neutral base rather than
  replacing the background outright).
- Add a short `transition` on border/box-shadow/background so the highlight
  animates in rather than snapping, making the state change feel deliberate and
  dramatic.
- Keep the existing `.LabelCollection { overflow: hidden }` in mind: an outer
  glow may be clipped by the card's own `overflow: hidden`. If the glow is
  clipped, apply the ring as an inset shadow/inner border (which is not
  clipped) and/or relax overflow only while dragging-over, whichever preserves
  the rounded corners. Verify the rounded card corners still look correct with
  the ring applied.

### 3. Update the component test for the new structure

**File**: `src/lib/components/LabelCollection/LabelCollection.test.jsx`

The existing test queries `.LabelCollection-urls-active` / `-inactive`, which
remain inside the body and should keep passing. If any assertion depends on the
`Droppable` wrapper element or the drag-over class location, update it to the
new `.LabelCollection-dropzone` wrapper. Add/adjust a test asserting the
full-card dropzone wrapper exists and carries the URL droppable so the enlarged
hit area is covered by a registered test.

## Reused existing code

- `applyDrag` from `src/lib/utils/dragReducer.js` (glossary entry: `applyDrag`)
  — unchanged; the destination `droppableId` format is preserved so URL moves
  still resolve to the right label.
- `LabelCollection` from `src/lib/components/LabelCollection/LabelCollection.jsx`
  (glossary entry: `LabelCollection`) — the card being restructured.
- `Labels` from `src/lib/components/Labels/Labels.jsx` (glossary entry:
  `Labels`) — renders the grid of `LabelCollection` cards; no change needed but
  it is where cards are laid out in columns.
- Theme tokens from `src/index.css` — `--c-lime-fg` (lime accent fallback),
  `--card-bg`, `--app-bg`, `--border` — reused for the highlight so it tracks
  the light/dark themes automatically.
- `DragDropContext` wiring in `src/lib/pages/App/App.jsx` (`handleDrag` /
  `handleDragStart`) — unchanged; the drop still flows through `applyDrag`.

## Scenarios to Demonstrate

- **Hover over a group from the top edge** — drag a sidebar tab so its center
  reaches the *title bar* of a group; the whole card lights up and the drop is
  accepted (previously this was a dead zone).
- **Dramatic group-colored highlight** — a group with a vivid color (e.g. a
  bright/blue group) shows a bold ring + glow + body tint in that color while
  hovering.
- **Dark / low-contrast group color** — a group whose color is very dark still
  shows a clearly visible "ready" state (ring + tint remain legible in both
  light and dark themes).
- **No-color group fallback** — a group with no `backgroundColor` falls back to
  the lime accent ring/glow.
- **Drop into a populated group** — dragging over a group that already has
  active + inactive URLs shows the placeholder inserting in the body while the
  full card stays highlighted.
- **Empty group** — dragging over a group showing the "Drag tabs from the
  sidebar…" empty state highlights the whole card and accepts the drop.
- **Reordering still works** — dragging a group card by its title bar reorders
  the grid as before (the nested URL droppable does not interfere with the
  LABEL_COLLECTION drag handle).
- **Leaving the card** — moving the dragged URL off a card cleanly removes the
  highlight (no stuck "over" state on the neighbor).
