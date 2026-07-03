---
title: "Vertically Center Drag-Hint Arrows"
mode: ui
createdAt: "2026-07-03T00:00:00Z"
source: manual
---

## Summary

The little left-pointing triangle arrows that appear on the first ungrouped
tab in the **Active Tabs** and **Automatically Closed** rail sections are not
vertically centered on their row — they sit low, anchored near the bottom. These
arrows are the "encourage drag" hint drawn by the `.Url.Url-encourageDrag::before`
CSS triangle. This plan re-anchors that pseudo-element to the vertical center of
its `.Url` row so the arrow lines up with the row's title text.

## Key Decisions

- **Center rather than remove** — the user prefers centering, and it's a one-line
  positioning change (removal is only the fallback if centering were hard, which
  it isn't). The arrow still serves its purpose as a drag affordance, so we keep it.
- **Anchor via `top: 50%` + `translateY(-50%)`** — the `.Url` row is
  `position: relative` (set in `Tabs.css`) and the arrow is `position: absolute`
  inside it, so centering vertically is a matter of swapping the current
  `bottom: 6px` anchor for a `top: 50%` anchor plus a `translateY(-50%)` offset.
  The existing `translateZ(-10px)` (which tucks the arrow behind the row) must be
  preserved by combining both transforms.

## Implementation

### 1. Re-anchor the drag-hint arrow to vertical center

**File**: `src/lib/components/Url/Url.css`

The current rule (around lines 156–166):

```css
.Url.Url-encourageDrag::before {
  position: absolute;
  bottom: 6px;
  height: 0;
  width: 0;
  left: -19px;
  border: 11px solid transparent;
  border-right-color: inherit;
  content: "";
  transform: translateZ(-10px);
}
```

Change the vertical anchor from `bottom: 6px` to a centered `top: 50%`, and fold
the centering offset into the existing transform:

```css
.Url.Url-encourageDrag::before {
  position: absolute;
  top: 50%;
  height: 0;
  width: 0;
  left: -19px;
  border: 11px solid transparent;
  border-right-color: inherit;
  content: "";
  transform: translateY(-50%) translateZ(-10px);
}
```

This centers the 22px-tall triangle (11px transparent top border + 11px bottom
border, with the right border colored) against the middle of the `.Url` row
regardless of the row's height, so it aligns with the title text instead of
riding low. No JSX changes are needed — the arrow is purely CSS, driven by the
`Url-encourageDrag` class that `Tabs.jsx` already applies to the first ungrouped
row in each section (`encourageDrag={name.indexOf('ungrouped') > -1}`).

## Reused existing code

- `.Url.Url-encourageDrag::before` triangle rule in
  `src/lib/components/Url/Url.css` — the existing arrow being repositioned.
- `.Tabs .Url { position: relative; }` in
  `src/lib/components/Tabs/Tabs.css` — the positioning context the absolute
  arrow is centered within (unchanged, relied upon).
- `Url` component in `src/lib/components/Url/Url.jsx`, rendered via
  `DraggableTabUrls` in `src/lib/components/Tabs/Tabs.jsx` with the
  `encourageDrag` prop — the mechanism that adds the `Url-encourageDrag` class
  (unchanged).

## Reproduction Test

Pins the buggy behavior: the drag-hint arrow on the encourage-drag row is
anchored to the bottom of the row instead of its vertical center.

**Target**: no unit-level reproduction. This is a pure CSS visual-alignment
regression — the arrow is a `::before` triangle whose position is not asserted by
any component/DOM test, and there is no rendered geometry to assert against in
jsdom (which does not lay out or compute pseudo-element box positions). Verifying
"the arrow is vertically centered" requires real layout, so it is demonstrated
via the scenarios below rather than a fabricated red test.

Status: PROPOSED — confirm visually via the "Ungrouped active tabs" scenario at
execution.

## Scenarios to Demonstrate

- Active Tabs section with a mix of grouped labels and at least one ungrouped
  tab — the encourage-drag arrow appears on the first ungrouped row, centered.
- Automatically Closed section with ungrouped auto-closed tabs — the arrow on
  its first row is likewise centered.
- A single-line (short-title) ungrouped row and a taller row — the arrow stays
  centered against the row in both, confirming it tracks row height rather than a
  fixed bottom offset.
- Rail with no ungrouped tabs (all grouped) — no encourage-drag arrow renders,
  unchanged from today.
