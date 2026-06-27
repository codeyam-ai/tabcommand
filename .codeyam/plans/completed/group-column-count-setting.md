---
title: "Group Column Count Setting"
mode: ui
createdAt: "2026-06-27T00:00:00Z"
source: manual
---

## Summary

Add a control to the Settings popover that lets the user choose how many
columns of groups (`LabelCollection` cards) are shown in the center area: 2,
3, or 4. The chosen count is the column count at full/comfortable width and
collapses responsively as the center pane gets narrower (the existing
single-column collapse on very narrow widths is preserved). The choice
persists in the existing `settings` storage key and takes effect live, like
the other settings. Default stays at 2 columns to match today's behavior.

## Key Decisions

- **Reuse the existing `settings` storage key** (not a new key) — `Settings.jsx`,
  `Triage`, and `LoadMeter` already read/write it, and `Chrome.js` already
  special-cases the `settings` key. Add a `columns` field alongside `warnAt`,
  `heavyThreshold`, and `autoCloseMinutes`.
- **Drive both the row chunking and the card width from one value.** Today
  `Labels.jsx` chunks groups into rows of `chunkLength` (2, or 1 when narrow)
  and `LabelCollection.css` hardcodes card width to `calc(50% - gap/2)`. These
  two must agree, so the effective column count will feed both the chunk size
  and a CSS variable that the card width is computed from.
- **Width via a CSS custom property**, not per-count modifier classes — set
  `--label-columns` on the `#Labels` container from the effective column count,
  and compute `flex-basis`/`max-width` from it. Keeping `max-width` (rather than
  letting `flex-grow` fill the row) means a lone card in the last row stays at
  1/N width instead of stretching, matching today's 50%-max-width behavior.
- **Segmented 2 / 3 / 4 button control** in the popover (per user choice),
  rather than a range slider, matching the "toggle" intent.
- **Responsive, treating the setting as the full-width count** (per user
  choice). The setting is the maximum column count at comfortable width; as the
  pane narrows the effective count steps down (and still collapses to a single
  column at the existing narrow breakpoint). The persisted value is unchanged by
  resizing — only the rendered/effective count adapts.
- **Default of 2** (new `ColumnsDefault` constant) so existing users and the
  `settings-default` scenario render exactly as before.

## Implementation

### 1. Add a Columns default constant

**File**: `src/Constants.jsx`

Add `export const ColumnsDefault = 2;` near `WarnAtDefault` /
`HeavyThresholdDefault` / `AutoCloseMinutes`.

### 2. Add the segmented Columns control to Settings

**File**: `src/lib/components/Settings/Settings.jsx`

- Import `ColumnsDefault` from `../../../Constants`.
- Seed `columns: ColumnsDefault` into the initial `settings` state object.
- Render a new always-visible `Settings-row` (place it with the "Auto-close
  after" row, which is also always shown — the Columns control is **not**
  per-tab-load data, so it must NOT be gated behind `source === 'processes'`).
- The control is a segmented group of three buttons labeled `2`, `3`, `4`. The
  active button reflects `settings.columns`. Clicking a button calls the
  existing `update('columns', value)` helper (which already coerces to `Number`
  and persists via `Chrome.set`), so persistence and live propagation come for
  free.
- Use a row label like "Group columns".

**File**: `src/lib/components/Settings/Settings.css`

Add styles for the segmented button group (e.g. `.Settings-segment` wrapper and
`.Settings-segment button` / active state), following the existing popover
tokens (`--border`, `--card-bg`, `--c-lime` accent used elsewhere in this
file). The control should fit the 214px panel width and align with the
`Settings-row` grid.

### 3. Read the setting and drive responsive column count in Labels

**File**: `src/lib/components/Labels/Labels.jsx`

- Read `settings` alongside the existing `Chrome.get('Labels1', ['labels',
  'uxSettings'], ...)` call (add `'settings'` to the key list) to obtain the
  configured `columns` value (fall back to `ColumnsDefault`). Store the
  configured count in component state.
- Subscribe to `chrome.storage.onChanged` for the `settings` key (the existing
  listener already handles `labels` / `uxSettings`; extend it) so changing the
  setting re-renders the grid live without reopening the page.
- Replace the hardcoded `chunkLength` logic. The current `useLayoutEffect` uses
  two media queries (`min-width: 900px` → 2, `max-width: 900px` → 1). Generalize
  this so the **effective** `chunkLength` is the configured column count capped
  by what the pane width can fit, stepping down to 1 at the existing narrow
  breakpoint. Concretely: derive effective columns from `min(configuredColumns,
  columnsThatFitAtCurrentWidth)`, where the per-width thresholds are computed
  from the configured count (e.g. require roughly a comfortable minimum card
  width per column). Keep the matchMedia-based approach so it stays test-able
  and avoids layout thrash; recompute when either the viewport crosses a
  breakpoint or the configured `columns` setting changes.
- Set the effective column count as a CSS variable on the container:
  `<div id="Labels" className="Labels" style={{ '--label-columns':
  effectiveChunkLength }} ...>`. The existing `index` math
  (`(chunkLength * chunkIndex) + index`) already keys off `chunkLength`, so
  drag-reorder global indexing continues to work for any column count.

### 4. Compute card width from the column count

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

- Replace the hardcoded two-column width:
  - `flex: 1 1 calc(50% - (var(--gap) / 2));`
  - `max-width: calc(50% - (var(--gap) / 2));`
  with an N-column form driven by `--label-columns` (with a fallback of 2),
  e.g. basis/`max-width` of
  `calc((100% - (var(--label-columns) - 1) * var(--gap)) / var(--label-columns))`.
- Leave the `.LabelCollections-selected .LabelCollection` override (full-width
  expanded view) untouched — the expanded single-group view is independent of
  the column count.

## Reused existing code

- `Settings` component and its `update(key, value)` + `Chrome.set` persistence
  pattern from `src/lib/components/Settings/Settings.jsx` (glossary entry:
  `Settings`) — the new control rides the same storage-write path.
- The `settings` storage key already consumed by `Triage`, `LoadMeter`, and
  special-cased in `src/lib/utils/Chrome/Chrome.js` — no new storage key needed.
- The `chunkLength` chunking + `LabelCollections-row` Droppable rows in
  `src/lib/components/Labels/Labels.jsx`, and the global drag index
  `(chunkLength * chunkIndex) + index` — extended, not rewritten.
- `--gap`, `--card-bg`, `--border`, `--c-lime` CSS tokens already used across
  `LabelCollection.css` / `Settings.css` / `Labels.css`.

## Scenarios to Demonstrate

- Default (2 columns) — confirms existing layout and `settings-default` parity.
- 3 columns selected — center area reflows group cards into three per row.
- 4 columns selected — four per row; last row with fewer cards stays at 1/4
  width (cards do not stretch to fill the row).
- Setting change is live — switching 2 → 4 reflows immediately without a reload.
- Responsive step-down — with 4 selected, a narrower center pane renders fewer
  columns, collapsing to a single column at the narrow breakpoint.
- Last-row partial fill — an odd number of groups (e.g. 5 groups at 3 columns)
  renders a full first row and a 2-card second row at correct widths.
- Settings popover on stable Chrome (`source !== 'processes'`) — the Columns
  control still shows even though the per-tab-load sliders are hidden.
