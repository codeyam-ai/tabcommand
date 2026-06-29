---
title: "Default Group Columns to 3"
mode: ui
createdAt: "2026-06-29T01:16:37Z"
source: manual
---

## Summary

Change the default number of URL group columns shown in a row from 2 to 3.
This is the count used when a user has never explicitly chosen a column setting
(or has an invalid/missing stored value). New users — and anyone who hasn't
touched the "Group columns" setting — will see three group cards per row by
default at comfortable desktop widths, instead of two.

## Key Decisions

- Change the single source of truth `ColumnsDefault` in `src/Constants.jsx`
  from `2` to `3` rather than hardcoding `3` anywhere. Every consumer
  (`Labels`, `Settings`, `effectiveColumns`) already imports this constant, so
  the one-line change propagates everywhere automatically.
- The viewport-fit logic in `effectiveColumns` is unchanged: 3 columns still
  require ≥1000px to render fully and gracefully step down on narrower windows.
  At the standard desktop width (~1440px) the new default of 3 renders fully
  (the pane fits up to 4).
- Update the unit tests that assert the fallback default value, since they
  encode the old default of 2.

## Implementation

### 1. Bump the default column count

**File**: `src/Constants.jsx`

Change `ColumnsDefault` from `2` to `3` (line 40). Update the adjacent comment
(lines 37–39) so it no longer says "Default 2 preserves the original layout" —
reword to describe the new default of 3 (the user-selectable 2 / 3 / 4 range is
unchanged).

### 2. Update the fallback-default unit tests

**File**: `src/lib/utils/effectiveColumns.test.js`

The "falls back to the default for invalid input" test (lines 49–54) asserts the
default is 2. With the new default of 3 and a fitting width (1440px, which fits
up to 4 columns), these should now expect 3:

- `effectiveColumns(undefined, 1440)` → `3`
- `effectiveColumns(0, 1440)` → `3`
- `effectiveColumns(null, 1440)` → `3`
- Update the preceding comment to say "default of 3".

The "caps the fallback default on a narrow viewport" test
(`effectiveColumns(undefined, 500)` → `1`, lines 57–58) stays correct as-is: a
500px viewport collapses to a single column regardless of the default, so no
change is needed there. All `columnsForWidth` tests and the explicit-value
`effectiveColumns` tests are unaffected.

## Reused existing code

- `ColumnsDefault` from `src/Constants.jsx` — the single source of truth for the
  default column count, already imported by all consumers.
- `effectiveColumns` from `src/lib/utils/effectiveColumns.js` (glossary entry:
  `effectiveColumns`) — caps the configured/default count by viewport fit; no
  change required, only the dependent tests.
- `columnsForWidth` from `src/lib/utils/effectiveColumns.js` (glossary entry:
  `columnsForWidth`) — viewport breakpoint logic, unchanged.
- `Settings` (`src/lib/components/Settings/Settings.jsx`) and `Labels`
  (`src/lib/components/Labels/Labels.jsx`) both fall back to `ColumnsDefault`,
  so they pick up the new default with no edits.

## Scenarios to Demonstrate

- Fresh user with no stored `columns` setting at desktop width (~1440px) — sees
  3 group columns per row.
- Stored setting with an explicit value of 2 — still renders 2 (user choice is
  respected, not overridden by the new default).
- Invalid/missing stored value (0, null, undefined) — falls back to 3.
- Narrow viewport (~800px) with the new default — gracefully steps down to 2
  columns.
- Very narrow viewport (~500px) — collapses to a single column.
