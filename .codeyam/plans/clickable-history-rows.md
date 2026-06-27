---
title: "Clickable History Rows"
mode: ui
createdAt: "2026-06-27T20:08:44Z"
source: manual
---

## Summary

On the History page, each `HistoryRow` currently only responds to clicks on its
small "↻ Reopen" button. The rest of the row has a hover background but no
pointer cursor and no click target, so users who click the title, favicon, or
timestamp get no response. Make the entire row a click target that reopens the
tab, with a pointer cursor on hover, while keeping the explicit "Reopen" button
as a discoverable affordance.

## Key Decisions

- **Whole row clickable** — Attach `onClick` to the `.HistoryRow` container so a
  click anywhere on the row calls `onReopen(row.urlKey)`. This matches the
  user's request and the existing hover-highlight already implies the row is
  interactive.
- **Keep the Reopen button** — Per scope decision, the "↻ Reopen" button stays
  as an explicit, discoverable affordance. To avoid firing `onReopen` twice
  (once from the button, once from the row), the button's `onClick` calls
  `e.stopPropagation()` before invoking `onReopen`.
- **Pointer cursor on the row** — Add `cursor: pointer` to `.HistoryRow` so the
  whole row signals clickability on hover, consistent with the button's existing
  `cursor: pointer`.
- **Accessibility** — Add `role="button"` and `tabIndex={0}` to the row, plus a
  keyboard handler so Enter/Space also reopen the tab, keeping the new click
  target reachable without a mouse.

## Implementation

### 1. Make the row container clickable

**File**: `src/lib/components/HistoryRow/HistoryRow.jsx`

- Add `onClick={() => onReopen(row.urlKey)}` to the outer `.HistoryRow` div.
- Add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that calls
  `onReopen(row.urlKey)` when the key is `Enter` or `' '` (Space), preventing the
  default scroll on Space.
- Update the existing Reopen button's `onClick` to `(e) => { e.stopPropagation();
  onReopen(row.urlKey); }` so the row's handler doesn't also fire, preventing a
  duplicate reopen.

### 2. Add the pointer cursor

**File**: `src/lib/components/HistoryRow/HistoryRow.css`

- Add `cursor: pointer;` to the `.HistoryRow` rule (alongside the existing
  hover-background transition). The `.HistoryRow:hover` background rule already
  exists and needs no change.

### 3. Update tests for the new row-level interaction

**File**: `src/lib/components/HistoryRow/HistoryRow.test.jsx`

- Add a test: clicking the row container (e.g. on the title text) calls
  `onReopen` with the row's `urlKey`.
- Add a test: clicking the Reopen button calls `onReopen` exactly once (verifies
  `stopPropagation` prevents a double-fire from the row's `onClick`).
- Keep the existing tests for title rendering, timestamp omission, and the
  monogram fallback.

## Reused existing code

- `HistoryRow` component from `src/lib/components/HistoryRow/HistoryRow.jsx`
  (glossary entry: `HistoryRow`) — the row being made fully clickable.
- `History` page from `src/lib/pages/History/History.jsx` (glossary entry:
  `History`) — already passes `reopen` as `onReopen`; no change needed there.
- Existing `onReopen` contract (`onReopen(urlKey)`) and the `reopen` handler in
  `History.jsx` are reused as-is.

## Scenarios to Demonstrate

- Happy path — a row with title, favicon, color dot, and timestamp; clicking
  anywhere on the row reopens the tab; pointer cursor shows on hover.
- Reopen button — clicking the "↻ Reopen" button reopens the tab exactly once
  (no duplicate from the row handler).
- Keyboard — focusing a row and pressing Enter (or Space) reopens the tab.
- No-timestamp row — a row without a `ts` still renders and is fully clickable.
- No-favicon row — a row falling back to the monogram tile is still fully
  clickable.
