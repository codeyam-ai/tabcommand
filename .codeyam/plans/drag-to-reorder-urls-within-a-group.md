---
title: "Drag To Reorder Urls Within A Group"
mode: ui
createdAt: "2026-08-23T13:12:58Z"
source: manual
---

## Summary

Dragging a url row within a group card does nothing, and a url dropped into a group always lands at the top instead of the bottom. Both come from one line: `src/lib/pages/App/App.jsx:153` overrides the drop destination for every mouse drag with a **hardcoded `index: 0`**, discarding the position the user actually dropped at. A second, quieter defect compounds it: `applyDrag` (`src/lib/utils/dragReducer.js:36`) splices into the stored `urlKeys` array at the *displayed* row index, but `LabelCollection` renders a re-sorted list (open tabs first, under the lime "Open" header), so for any group mixing open and saved tabs the two index spaces disagree and even the keyboard drag path lands in the wrong slot. This plan resolves a real drop index from the cursor and translates display index → storage index, keeping the Open/Saved split exactly as it is today.

## Key Decisions

- **Keep the Open/Saved section split** (confirmed with the user). The active-first sort at `LabelCollection.jsx:357` and the `LabelSectionHeader label='Open'` block stay. Consequence to state plainly: an **open** tab still cannot be positioned below saved-only rows — the sort re-pins it to the Open section on the next render. If the `MG MGA 1600 roadster` row is currently an open tab, dragging it to the very bottom of the card will still snap back after this fix; it will reorder correctly *within* the Open section, and correctly anywhere in the card once the tab is closed. Fixing that residual requires dropping the split (the alternative the user declined) and can be revisited as its own plan.
- **Resolve the drop index during pointer tracking, not at drop time.** `onDragEnd` carries no coordinates, and by the time it fires the drop animation has already returned rows to flow, so hit-testing then is unreliable. The existing `onPointerMove` handler (`App.jsx:211`) already hit-tests for the drop *target*; it will resolve the *index* in the same pass and stash both in a ref.
- **Stash the live index in an App ref, not in `dragHoverStore`.** The store's documented contract is that a drag-time update must not re-render the subtree holding the dragged row. Group cards subscribe with a boolean selector so an index change would in practice bail out, but adding a fast-changing field to that store puts new weight on an invariant whose violation manifests as "the tab won't drag at all". A plain ref in `App` has no notification path and no risk.
- **Default an ambiguous drop to the END of the group, not the start.** When the cursor is over the card's title bar, the empty-state text, or below the last row, the drop appends. This is what makes "a tab I add to a group shows up at the bottom" true, and it matches the service worker's own behavior (`service_worker.js:1654` already `push`es new members onto the end).
- **Put the display↔storage translation inside `applyDrag`, fed by a new shared `labelDisplayOrder` helper.** `applyDrag` already receives `activeTabs`, so it can reconstruct the exact order the card painted. Extracting the sort into one helper means `LabelCollection` and the reducer can never drift apart — today the ordering rule is duplicated implicitly, which is how the mismatch survived.

## Implementation

### 1. Extract the group card's display ordering into a shared helper

**New file**: `src/lib/utils/labelDisplayOrder.js`

`labelDisplayOrder(urlKeys, activeTabs)` returns a new array ordered exactly as a group card paints it: open tabs first, saved-only after, with the relative order inside each section preserved (the existing sort is stable and must stay so). Lift the comparator verbatim from `LabelCollection.jsx:357-361` — behavior must not change, only its home.

### 2. Render from the shared helper

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

Replace the inline `completeUrlKeys` sort (line 357) with a call to `labelDisplayOrder(currentUrlKeys, activeTabs)`. `activeUrls` / `inactiveUrls` and the "Open" header keep working off that result unchanged — this is a pure refactor with no visible difference, and it is what guarantees the reducer's translation matches what is on screen.

### 3. Translate the drop index from display space to storage space

**File**: `src/lib/utils/dragReducer.js`

In the `ItemTypes.URL` branch, `destination.index` arrives as an index into the destination card's *displayed* rows. Before the splice at line 36:

- Build the destination label's display order with `labelDisplayOrder`, computed **after** the source removal when source and destination are the same label (`@hello-pangea/dnd` reports a same-list destination index against the post-removal list).
- Map it: if the display index is at or past the end of that list, append to `urlKeys`; otherwise find the urlKey currently occupying that display slot and insert immediately before it (`urlKeys.indexOf(thatKey)`).
- Splice at the mapped storage index instead of `destination.index`.

Guard the degenerate inputs already possible today — a missing destination label, an empty `urlKeys`, a `null`/absent `activeTabs` — by falling back to an append rather than throwing. The `ItemTypes.LABEL_COLLECTION` branch is untouched: group cards are not re-sorted between store and screen, so its index space is already correct.

### 4. Resolve a drop index from the cursor

**File**: `src/lib/utils/dropTargeting.js`

Add `dropTargetAtPoint(x, y, { doc, draggedId })` returning `{ droppableId, index }` (or `null` when the point is outside every group card). It reuses `dropTargetIdFromElement` for the id, then, within that dropzone:

- Collect the row elements via `[data-rfd-draggable-id]` (the attribute `@hello-pangea/dnd` stamps through the `draggableProps` that `Url` spreads onto its root at `Url.jsx:193-197`), skipping the element whose id equals `draggedId` — that node is the floating clone and its rect is under the cursor by definition.
- The index is the count of remaining rows whose bounding-rect vertical midpoint sits above `y`. A cursor over the title bar therefore yields `0` rows above it — so **clamp that case to the end**: when the point is not inside the `.LabelCollection-urls` region at all, return `index = rows.length`.

Keep `dropTargetIdAtPoint` exported and behaviorally unchanged — it is the cheap id-only path the drop-target highlight uses, and its five existing tests should keep passing untouched.

### 5. Use the resolved index instead of hardcoding zero

**File**: `src/lib/pages/App/App.jsx`

- Add a `cursorDropRef` alongside `hoverCleanupRef` (line 64) holding the most recent `{ droppableId, index }`.
- In `onPointerMove` (line 211), call `dropTargetAtPoint` once, write the result to `cursorDropRef`, and feed its `droppableId` into the existing `setDragHover` call so the highlight behavior is unchanged.
- In `handleDrag` (line 153), replace `{ droppableId: cursorDropId, index: 0 }` with the ref's `{ droppableId, index }`, still gated on `cursorDropId` being present so a release in empty space remains a no-op. Reset the ref in `endDragCleanup` so a stale index from the previous drag can never be read.
- `handleDragStart` seeds the ref to `null` next to the existing `setDragHover({ cursorActive: true, dropId: null })`.

### 6. Cover the ordering rules with tests

**File**: `src/lib/utils/dragReducer.test.js`

Add the reproduction test below, plus: a reorder inside an all-saved group (display and storage agree — proves no regression), a cross-group drop landing at a mid-list index, and a drop index past the end appending.

**New file**: `src/lib/utils/labelDisplayOrder.test.js` — open-first ordering, stability within each section, empty and no-active-tabs inputs.

**File**: `src/lib/utils/dropTargeting.test.js` — `dropTargetAtPoint`: index from row midpoints, the dragged clone excluded, a point over the title bar resolving to the end, a point outside every card returning `null`.

## Reused existing code

- `applyDrag` from `src/lib/utils/dragReducer.js` (glossary entry: `applyDrag`) — the single reducer behind `onDragEnd`; the translation belongs here rather than in the component.
- `dropTargetIdFromElement` and `GROUP_DROPZONE_SELECTOR` from `src/lib/utils/dropTargeting.js` — the new resolver reuses both instead of re-deriving the dropzone.
- `getDragHover` / `setDragHover` / `getDragActive` from `src/lib/utils/dragHoverStore.js` (glossary entries: `getDragHover`, `setDragHover`, `subscribeDragHover`) — read only; the plan deliberately does not extend this store.
- The active-first comparator currently inline at `src/lib/components/LabelCollection/LabelCollection.jsx:357` — moved, not rewritten.
- **Existing-implementation survey**: no shared display-ordering helper exists today. `src/lib/utils/` has no `order`/`sort` module, and the only other ordering code is unrelated (`sortLabels` in `src/lib/utils/importExport.js` sorts *groups* by position/title; `src/lib/components/Labels/Labels.jsx:171` repeats that group sort; `src/lib/components/Tabs/Tabs.jsx:96` sorts sidebar tabs by load). The url-within-group ordering rule is implemented in exactly one place, and step 1 is its first extraction.

## Reproduction Test

Pins the display-index/storage-index mismatch: in a group mixing an open tab with saved-only rows, dragging a saved row up one slot is a silent no-op because the reducer splices at the displayed index.

**Target**: `src/lib/utils/dragReducer.test.js` — run with `codeyam-editor editor refresh-tests --test applyDrag`.

```js
  // a group card renders open tabs above saved ones, so the drop index the
  // library reports is an index into that DISPLAYED order — reordering the
  // saved rows must move the right key in the stored urlKeys array
  it('maps the displayed drop index onto the stored urlKeys order', () => {
    // stored order [a, b, c]; c is open, so the card paints [c, a, b]
    const labels = { Personal: { title: 'Personal', position: 0, urlKeys: ['url-a', 'url-b', 'url-c'] } };
    const activeTabs = [{ urlKey: 'url-c', tabKey: 'tab-3' }];

    // drag url-b (displayed index 2) up to displayed index 1, just under url-c
    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Personal-url-b',
        source: { droppableId: '0-LabelCollection-urls-Personal', index: 2 },
        destination: { droppableId: '0-LabelCollection-urls-Personal', index: 1 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Personal.urlKeys).toEqual(['url-b', 'url-a', 'url-c']);
  });
```

Status: PROPOSED — confirm red at execution. Expected failure: today the reducer removes `url-b` (leaving `['url-a', 'url-c']`) and splices it back at raw index `1`, so it receives `['url-a', 'url-b', 'url-c']` — the array is byte-identical to the input and the card repaints unchanged, which is exactly the "the row won't move" symptom.

Note the App-level half of the bug (the hardcoded `index: 0` at `App.jsx:153`) has no unit-level repro — `App.test.jsx` carries no drag coverage, and driving `@hello-pangea/dnd` pointer drags in jsdom is the brittleness `applyDrag` was extracted to avoid. It is pinned instead by the new `dropTargetAtPoint` tests in step 6 plus the scenarios below.

## Scenarios to Demonstrate

- Personal group, mixed open + saved: a saved row dragged from the top of the saved section to the bottom, landing where it was dropped.
- A tab dragged from the sidebar onto a group's **title bar** — appends to the bottom of the group, not the top.
- A tab dragged from the sidebar and released precisely between two existing saved rows — lands in that slot.
- An all-saved group reordered top → bottom (the plain case, display and storage identical).
- An all-open group reordered within the Open section.
- An open tab dragged below the saved rows — documents the accepted residual: it returns to the Open section.
- A tab dragged across groups, dropping at a mid-list position in the destination.
- Drop released outside every group card — no change to any group.
- A group with a single url; a group with none (the empty-state drop).