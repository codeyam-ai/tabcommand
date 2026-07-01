---
title: "Ungrouped Active Tabs Last"
mode: ui
createdAt: "2026-07-01T00:23:11Z"
source: manual
---

## Summary

In the "Active Tabs" section of the Tabs page, the "Ungrouped" bucket currently
renders **above** the grouped (labeled) tabs. This reorders it so grouped tabs
come first and the ungrouped remainder appears **last**, keeping organized
groups at the top of the list and pushing the loose, un-triaged tabs to the
bottom.

## Key Decisions

- **Scope to the "Active Tabs" section only.** The request was specifically
  about Active Tabs. The "Automatically Closed" section has the same
  Ungrouped-then-grouped structure but is intentionally left unchanged to match
  the ask. (If we later want parity there, it's the mirror edit in the same
  file.)
- **Pure JSX reorder — no logic change.** Both `ungroupedTabUrls()` and
  `activeTabUrlLabels()` already exist and are unchanged; we only swap the order
  in which their blocks are rendered inside `.Tabs-section-urls`. The empty-state
  explainer and all drag/drop wiring stay exactly as they are.

## Implementation

### 1. Render grouped labels before the ungrouped block in Active Tabs

**File**: `src/lib/components/Tabs/Tabs.jsx`

In the `Tabs-section Tabs-active` block (currently around lines 312–342), the
children of `.Tabs-section-urls` render in this order:

1. empty-state explainer (`activeTabUrls.length === 0`)
2. Ungrouped block (`ungroupedTabUrls().length > 0` → `<DraggableTabUrls name='ungrouped' … />`)
3. grouped labels (`activeTabUrlLabels().map(…)`)

Move the Ungrouped block (the `{ ungroupedTabUrls().length > 0 && … }` fragment,
including its `Tabs-section-ungrouped` wrapper and "Ungrouped" `<h4>`) so it
renders **after** the `activeTabUrlLabels().map(…)` grouped-labels block. Keep
the empty-state explainer first. Final order becomes: explainer → grouped labels
→ Ungrouped.

Leave the "Automatically Closed" section (`Tabs-autoClosed`) untouched.

### 2. Update / add ordering coverage

**File**: `src/lib/components/Tabs/Tabs.test.jsx`

The existing test `groups labeled tabs under headings and leaves the rest
ungrouped` (around line 72) already seeds one grouped tab (`Work`) and one
ungrouped tab and asserts both the `Work` heading and the `Ungrouped` heading are
present, but does **not** assert their relative order. Strengthen it (or add a
sibling test) to assert that within the Active Tabs section the grouped label
heading (`Work`) appears **before** the `Ungrouped` heading in DOM order — e.g.
compare `compareDocumentPosition` of the two heading nodes, or query all
`.Tabs-active .Tabs-section-labelTitle` and assert the group title precedes
`Ungrouped`. This locks in the new ordering so a future refactor can't silently
flip it back.

## Reused existing code

- `ungroupedTabUrls` from `src/lib/components/Tabs/Tabs.jsx` — the ungrouped
  filter, unchanged; only its render position moves.
- `activeTabUrlLabels` / `generateTabUrlLabels` from
  `src/lib/components/Tabs/Tabs.jsx` — the grouped-label builder, unchanged.
- `DraggableTabUrls` (local component in `Tabs.jsx`) — reused as-is for both the
  grouped and ungrouped blocks.
- `Tabs` glossary entry (`src/lib/components/Tabs/Tabs.jsx`, test
  `src/lib/components/Tabs/Tabs.test.jsx`).

## Scenarios to Demonstrate

- **Groups + ungrouped mix (happy path):** several labeled groups plus a few
  loose tabs — groups render at the top, "Ungrouped" heading and its tabs render
  at the bottom.
- **Only ungrouped tabs:** no labels applied — the single "Ungrouped" block still
  shows (now it's simply the only block, position unchanged visually).
- **Only grouped tabs:** every active tab belongs to a label — no "Ungrouped"
  heading appears; groups fill the section.
- **Empty state:** no active tabs — the explainer ("Active tabs that are not
  pinned…") shows, unchanged.
- **Automatically Closed unaffected:** confirm its Ungrouped-then-grouped order
  is still as before (regression guard on the intentionally-unchanged section).
