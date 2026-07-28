---
title: "Stabilize URL Drag-and-Drop Into Groups"
mode: ui
createdAt: "2026-07-28T00:33:09Z"
source: manual
---

## Summary

Dragging a tab into a group, back out, and in again can leave the dragged row
frozen mid-flight — stuck half inside the card, half outside, no longer following
the cursor and never dropping. The drag is not "slow"; it has been **cancelled**
by React while `@hello-pangea/dnd` was still in charge of it, leaving an orphaned
clone with its last inline transform. Three independent causes conspire, and all
three get worse the longer the drag lasts (which is exactly the in-out-in
gesture the user described):

1. **The sidebar's Draggables remount on every render.** `DraggableTabUrls` is
   declared *inside* the `Tabs` component body (`src/lib/components/Tabs/Tabs.jsx:222`),
   so every `Tabs` render produces a new component type and React unmounts and
   remounts the whole `Droppable`/`Draggable` subtree — including the row being
   dragged. `Tabs`' storage listener calls `readLoad()` on every `url-*` change,
   and the service worker writes load samples every ~5s
   (`SYSTEM_POLL_INTERVAL_MS = 5000`, plus per-process writes on the dev channel).
   Any drag lasting more than a few seconds is very likely to be interrupted.
2. **Group cards re-sort their members mid-drag.** `LabelCollection` re-renders on
   every `activeTabs` change and recomputes `completeUrlKeys` (active tabs sorted
   above inactive), which shifts `Draggable` `index` values under the library
   while a drag is in flight.
3. **The group grid shifts horizontally at drag start.** `handleDragStart` sets
   `#Labels` `style.overflowY = 'hidden'` *after* the library has captured every
   droppable's geometry, and `handleDrag` restores it to `'scroll'` — not the
   stylesheet's `auto` (`src/lib/components/Labels/Labels.css:6`). So from the
   second drag onward the scrollbar gutter is reserved at rest and removed at
   drag start: the whole grid jumps by the scrollbar width mid-drag while the
   library's cached boxes still describe the old layout. That is the "halfway
   into the group, halfway outside on the left" offset.

The fix stabilizes the drag: freeze list content for the duration of a drag,
stop remounting the sidebar's draggables, stop shifting the layout at drag
start, and add a safety net so a drag that dies anyway can never wedge the UI.

## Key Decisions

- **Extend `dragHoverStore` rather than add a new store.** It already holds
  drag-scoped state outside React (`cursorActive`, `dropId`) precisely because
  re-rendering during a drag cancels it. A `dragActive` flag belongs there,
  set for *every* drag (keyboard included, unlike `cursorActive` which is FLUID-only).
  Survey result: no other drag-lifecycle flag exists anywhere in the codebase —
  `cursorActive` is the closest and is deliberately mouse-only, so it cannot be
  reused as-is.
- **Freeze lists until drop (user-confirmed).** `Tabs` and `LabelCollection`
  buffer incoming `chrome.storage.onChanged` updates while a drag is active and
  flush them once it ends. A tab closed in the browser lingers for the seconds
  of a drag — an acceptable trade for a drag that never dies under the cursor.
  Buffering is preferred over `React.memo`-style suppression because it keeps
  the eventual state exactly consistent with storage.
- **Hoist `DraggableTabUrls` to module scope** instead of memoizing it. A
  module-level component has a stable type, so React reconciles rather than
  remounts. It needs no closure over `Tabs` state — everything it uses is
  already passed as props.
- **Stop mutating `overflowY` at drag start.** Reserve the gutter permanently
  with `scrollbar-gutter: stable` and toggle a CSS class instead of an inline
  style, so enabling/disabling scroll never changes layout geometry. Restore to
  the stylesheet value (remove the class) rather than hard-coding `'scroll'`.
- **Safety net is a fallback, not the mechanism (user-confirmed).** The real fix
  is preventing cancellation; the `pointerup`/`blur`/`Escape` recovery only
  guarantees that if a drag still dies, the UI unwedges itself.

## Implementation

### 1. Add drag-active state to the drag store

**File**: `src/lib/utils/dragHoverStore.js`

Extend the external store's state with `dragActive` (default `false`) alongside
`cursorActive`/`dropId`, and export `getDragActive()` / `subscribeDragActive()`
plus a `setDragActive(next)` setter. Keep the existing no-op-on-unchanged guard
so subscribers only fire on real transitions. `setDragHover` must not clobber
`dragActive`, and clearing hover at drag end must not implicitly clear it —
`dragActive` is owned by the drag lifecycle, `cursorActive` by pointer tracking.

Update the module comment to say the store now carries the whole
"is a drag in flight" signal, not just hover.

### 2. Set drag-active for the whole drag lifecycle

**File**: `src/lib/pages/App/App.jsx`

- In `handleDragStart`, call `setDragActive(true)` **before** the
  `info.mode !== 'FLUID'` early return, so keyboard drags also freeze the lists.
  Remove the `info.type !== ItemTypes.URL` early return's effect on this flag —
  group-reorder drags need the freeze too.
- In `handleDrag`, call `setDragActive(false)` after `stopHoverTracking()` and
  before the early returns, so every exit path clears it.
- Replace the inline `labelsElement.style.overflowY` mutations with a class
  toggle: add `Labels-dragging` on drag start, remove it on drag end (and in the
  safety net below). No inline style is written, so the element always falls back
  to its stylesheet value.

### 3. Stop the layout shift at drag start

**File**: `src/lib/components/Labels/Labels.css`

Add `scrollbar-gutter: stable;` to `.Labels` so the gutter is reserved whether or
not the scrollbar is showing, and add a `.Labels.Labels-dragging { overflow-y: hidden; }`
rule. With the gutter stable, toggling `overflow-y` no longer reflows the grid,
so `@hello-pangea/dnd`'s captured droppable boxes stay accurate for the whole
drag.

### 4. Stop remounting the sidebar's draggable rows

**File**: `src/lib/components/Tabs/Tabs.jsx`

Move `DraggableTabUrls` out of the `Tabs` function body to module scope (above
`const Tabs = ...`). It already receives everything it needs (`name`, `urls`,
`autoClosed`) as props. This alone stops the sidebar's `Droppable`/`Draggable`
tree from being torn down and rebuilt on every `Tabs` render.

### 5. Buffer storage updates in the sidebar while dragging

**File**: `src/lib/components/Tabs/Tabs.jsx`

In the storage `handleChange` effect, when `getDragActive()` is true, merge the
computed `updates` into a pending-updates ref instead of calling
`setPartialState`, and skip the `readLoad()` refresh. Subscribe to the store
(`subscribeDragActive`) so that when `dragActive` flips back to false the
buffered updates are flushed in one `setPartialState` and `readLoad()` runs once.
Note `readLoad`'s own async callbacks must respect the same gate — a `Chrome.get`
issued before the drag started can resolve mid-drag and re-render.

### 6. Buffer storage updates in group cards while dragging

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

Apply the same gate to this component's `handleChange` (the `labels`,
`activeTabs`, and `url-*` branches) and to the `currentUrlKeys` title-loading
effect's callback. This is what keeps `completeUrlKeys` — and therefore the
`Draggable` `index` values in both the source and destination card — stable for
the whole drag. Flush on drag end via the same subscription.

Leave the existing `isCursorTarget` / `isDropTarget` hover subscription exactly
as it is: that boolean-selector subscription is intentional and is the one
re-render that must keep happening mid-drag.

### 7. Drag-abort safety net

**File**: `src/lib/pages/App/App.jsx`

Add a module-scoped helper (e.g. `endDragCleanup`) invoked from both
`handleDrag` and a set of window-level fallback listeners registered in
`handleDragStart` alongside the existing pointer tracking: `pointerup`,
`pointercancel`, `blur`, and `keydown` (Escape). Each fires the cleanup once
(idempotent, guarded by the `hoverCleanupRef`), which:

- removes the `Labels-dragging` class,
- tears down pointer tracking,
- clears `dragHover` and `dragActive` (flushing the buffered list updates).

Registered listeners are removed by the same cleanup, and the existing
`useEffect(() => stopHoverTracking, [])` unmount guard is extended to call it.
The result: even if the library loses a drag, the grid scrolls again, the group
highlight clears, and buffered updates land — no wedged UI.

## Reused existing code

- `getDragHover` / `setDragHover` / `subscribeDragHover` from
  `src/lib/utils/dragHoverStore.js` (glossary entries: `getDragHover`,
  `setDragHover`, `subscribeDragHover`) — extended, not replaced.
- `dropTargetIdAtPoint` from `src/lib/utils/dropTargeting.js` (glossary entry:
  `dropTargetIdAtPoint`) — cursor-based targeting is unchanged; this plan only
  makes the geometry it competes with stop shifting.
- `applyDrag` from `src/lib/utils/dragReducer.js` (glossary entry: `applyDrag`)
  — untouched; the drop transform is correct, it is the drag lifecycle that fails.
- `describeDragRemoval` from `src/lib/utils/describeDragRemoval.js` (glossary
  entry: `describeDragRemoval`) — untouched.
- `installChromeShim` from `src/lib/utils/chromeShim/chromeShim.js` and the
  `seed()` + `DragDropContext`-wrapper patterns already used in
  `src/lib/components/Tabs/Tabs.test.jsx` and
  `src/lib/components/LabelCollection/LabelCollection.test.jsx`.

**Existing-implementation survey**: grepped for any pre-existing drag-lifecycle
flag, mid-drag update suppression, or `scrollbar-gutter` usage. None exists —
`cursorActive` in `dragHoverStore` is the only drag-scoped state, and it is
FLUID-mouse-only by design, so `dragActive` is a genuinely new dimension rather
than a duplicate of it.

## Reproduction Test

Pins the remount that cancels an in-flight drag: a background load-stat write
tears down and rebuilds the sidebar's draggable rows.

**Target**: `src/lib/components/Tabs/Tabs.test.jsx` — run with
`codeyam-editor editor refresh-tests --test Tabs`.

```jsx
// a background url-* storage write must not remount the sidebar's draggable
// rows — a remount mid-drag cancels the drag and strands the dragged row
it('keeps the sidebar row mounted across a background load-stat update', async () => {
  seed('activeTabs', [{ urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false }]);
  seed('allUrls', ['url-https://react.dev']);
  seed('url-https://react.dev', { title: 'React', favicon: '' });
  installChromeShim();
  renderTabs();

  const rowBefore = (await screen.findByText('React')).closest('.Url');

  await new Promise((resolve) =>
    chrome.storage.local.set(
      { 'url-https://react.dev': { title: 'React', favicon: '', processes: { samples: [1] } } },
      resolve
    )
  );

  await waitFor(() => {
    expect(screen.getByText('React').closest('.Url')).toBe(rowBefore);
  });
});
```

Status: PROPOSED — confirm red at execution. Expected failure: because
`DraggableTabUrls` is redeclared on each `Tabs` render, the `url-*` change
triggers `readLoad()` → `setPartialState` → a new component type → React
unmounts and remounts the row, so the node returned after the update is a
different element and `toBe(rowBefore)` fails.

A second test for the freeze-while-dragging behaviour (§5/§6) should be added at
execution: with `setDragActive(true)`, an `activeTabs` write must not change the
rendered row order until `setDragActive(false)` flushes it. The layout-shift fix
(§3) and the safety net (§7) are verified in the running extension and via the
scenarios below rather than in jsdom, where scrollbars and real pointer input do
not exist.

## Scenarios to Demonstrate

- **Long drag across groups** — pick up a tab from the sidebar, hover it over
  group A, out into empty space, back into group A, and drop. It lands in A;
  nothing freezes, even when a load sample lands mid-drag.
- **Drag during a background update** — a tab closes in the browser while a drag
  is in flight. The dragged row keeps following the cursor; the sidebar updates
  the moment the drop completes.
- **Second and third consecutive drags** — the group grid does not jump
  horizontally when each drag begins (the regression that produced the offset
  ghost).
- **Drag between two groups** — move a member out of group A into group B; A's
  count drops, B's rises, and the Chrome tab is ungrouped as before.
- **Escape mid-drag** — press Escape while dragging; the drag cancels cleanly,
  the grid scrolls again, no group stays highlighted.
- **Keyboard drag** — space to lift, arrows to move, space to drop still works
  and uses the library's own center-based targeting and highlight.
- **Group reorder drag** — dragging a whole group card to a new position still
  reorders the grid and persists `position`.