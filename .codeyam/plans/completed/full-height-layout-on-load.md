---
title: "Full-Height Layout on Load"
mode: ui
createdAt: "2026-06-25T15:45:00Z"
source: manual
---

## Summary

When the extension first loads, the navy left sidebar and the gray right
"Active Tabs" panel only span their natural content height (~410px) instead of
filling the viewport, leaving a large empty white area below them. The cause is
a broken CSS height chain: `App.css` sets `body { height: 100% }` and the layout
elements (`.App`, `.App-sidebar`, `.App-content`, `.Tabs`, `.Labels`) all use
`height: 100%`, but neither the `html` element nor the React mount node `#root`
has a height. A percentage height resolves against the parent's height, so
`body`'s `100%` collapses against `html`'s `auto` height, and every descendant
collapses with it. The fix is to establish a full-height chain from `html` →
`body` → `#root` so the existing `height: 100%` rules resolve to the full
viewport.

## Key Decisions

- **Fix the height chain rather than rewrite the layout.** The layout already
  expects a full-height ancestor — `.App`, `.App-sidebar`, `.App-content`,
  `.Tabs`, and `.Labels` all use `height: 100%`. The only missing links are
  `html` and `#root`. Adding `html, body, #root { height: 100% }` is the minimal,
  least-risky fix and leaves the rest of the layout untouched.
- **Anchor the chain to `100vh` at the root, then `100%` below.** Set the root
  (`html`, or equivalently use `height: 100vh` / `min-height: 100vh` on the App
  shell) so the chain has a concrete viewport-based height to resolve against,
  rather than relying on percentage-of-auto which is what currently fails.
  Keep the descendants on `height: 100%` to match the existing pattern.
- **Consolidate the body height rule.** `body` height is currently declared in
  `App.css`; `src/index.css` also styles `body` (margin/font) but sets no
  height. Keep the height-chain rule in one place so the two stylesheets don't
  drift. Prefer `App.css` since it already owns the layout's `body { height }`.

## Implementation

### 1. Establish the full-height root chain

**File**: `src/lib/pages/App/App.css`

Extend the existing `body { height: 100% }` rule so the entire ancestor chain
has a resolved height. Add `html` and `#root` to the full-height set, and give
the chain a concrete viewport anchor so percentage heights resolve correctly:

- `html, body, #root { height: 100%; margin: 0; }`
- Ensure `.App` continues to inherit a real `100%` (it already declares
  `height: 100%`). Optionally back it with `min-height: 100vh` so the shell
  never collapses below the viewport even if a descendant's height resolution
  is interrupted.

Keep `.App-sidebar`, `.App-content`, `.Tabs`, and `.Labels` as-is — once the
ancestor chain has height, their existing `height: 100%` rules fill the screen.

### 2. Verify no competing/duplicate body rules

**File**: `src/index.css`

`src/index.css` (imported in `src/index.jsx`) sets `body { margin: 0; font… }`
but no height, so it does not conflict. Confirm there is no stray `height` on
`#root` or `html` elsewhere that would override the new rule. If desired, the
`html, body, #root` height rule could live here instead of `App.css` since this
is the global stylesheet loaded for every render — pick one location and keep
the body height declaration out of the other to avoid drift (see Key Decisions).

## Reused existing code

- `App` component from `src/lib/pages/App/App.jsx` (glossary entry: `App`) —
  renders `.App` → `.App-sidebar` + `.App-content`, the elements that already
  expect a full-height ancestor.
- Existing `App.css` layout rules (`.App`, `.App-sidebar`, `.App-content`) that
  already use `height: 100%` — the fix makes these resolve correctly rather than
  changing them.
- `Tabs` (`.Tabs`) and `Labels` (`.Labels`) component stylesheets that also use
  `height: 100%` and will fill correctly once the chain is fixed.

## Scenarios to Demonstrate

- **Empty state on first load** — no groups yet ("Click the 'Add Group' icon…"
  placeholder). Both sidebars must span the full viewport height, not stop at
  ~410px. This is the exact state in the reported screenshot.
- **Populated state** — several groups/labels and a full Active Tabs list. The
  center grid and right panel scroll within a full-height shell.
- **Short viewport** — a small/short browser window where content is shorter
  than the viewport: sidebars still reach the bottom (no white gap below).
- **Tall content / overflow** — Active Tabs list long enough to scroll: the
  panel fills the height and scrolls internally rather than pushing the layout.
