---
title: "Settings Popup — Open Above & Center On Gear"
mode: ui
createdAt: "2026-06-28T13:05:34Z"
source: manual
---

## Summary

The sidebar Settings popover currently opens **downward** from the gear button, so it overlaps and hides the Search input and the first tab group below it. It is also **left-clamped** to the gear's right edge, so it reads as left-aligned to the button rather than centered. This change flips the panel to open **upward** — fully visible above the search input and groups — and horizontally **centers** it on the gear so the button sits directly under the middle of the popover.

## Key Decisions

- **Anchor the panel's bottom edge above the button, not its top edge below it.** The current code sets `top: r.bottom + 6`, which grows the panel downward over the search field. Switching to a `bottom` anchor (`bottom: window.innerHeight - r.top + 6`) makes the panel grow upward from just above the gear. Using `bottom` rather than computing `top - panelHeight` avoids needing to measure the panel's rendered height (which varies because the two per-tab sliders are conditionally rendered) — the browser lays it out upward automatically and it stays fully visible.
- **Center horizontally on the gear instead of right-aligning.** Replace `left: Math.max(8, r.right - PANEL_WIDTH)` with `left: r.left + r.width / 2 - PANEL_WIDTH / 2`, so the button's horizontal center matches the panel's center. Keep a viewport clamp so it never runs off the left/right edge.
- **Keep `position: fixed`.** Fixed positioning is still required so the sidebar's scroll/overflow container can't clip the popover; only the anchor edges change.

## Implementation

### 1. Compute an upward, centered anchor when opening

**File**: `src/lib/components/Settings/Settings.jsx`

In `toggleOpen` (the `getBoundingClientRect` block), change the `setCoords` call so the panel anchors above and centered on the gear:

- Replace the `top`/`left` computation with a `bottom`/`left` pair:
  - `bottom: window.innerHeight - r.top + 6` — anchors the panel's bottom edge 6px above the top of the gear button so it opens upward.
  - `left: r.left + r.width / 2 - PANEL_WIDTH / 2` — centers the panel on the button's horizontal midpoint.
  - Clamp `left` into the viewport with both a left and right guard, e.g. `Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8))`, so the centered panel never overflows either edge on a narrow popup.
- Update the `coords` state shape from `{ top, left }` to `{ bottom, left }` (initial state at the top of the component and the `useState` default).

### 2. Apply the new anchor edges to the panel style

**File**: `src/lib/components/Settings/Settings.jsx`

Update the inline `style` on the `.Settings-panel` div (currently `style={{ top: coords.top, left: coords.left }}`) to use the bottom anchor: `style={{ bottom: coords.bottom, left: coords.left }}`. Since `.Settings-panel` is `position: fixed`, `bottom` is measured from the viewport bottom and the panel grows upward from there.

### 3. Update the explanatory comment

**File**: `src/lib/components/Settings/Settings.jsx`

Revise the comment above `toggleOpen` (lines ~61–63) that currently says "Right-align to the gear, then clamp into the viewport." to describe the new behavior: anchor the panel **above** the gear (open upward so it never covers the search input / groups) and **center** it on the button, then clamp into the viewport.

## Reused existing code

- `Settings` component from `src/lib/components/Settings/Settings.jsx` (glossary entry: `Settings`) — the popover whose anchor math is being changed. Note its docstring already states it is "Anchored via fixed positioning so the sidebar's overflow cannot clip it."
- `PANEL_WIDTH` constant (already defined in `Settings.jsx`) — reused for the centering offset.
- `.Settings-panel` rule in `src/lib/components/Settings/Settings.css` — no CSS change needed; it already uses `position: fixed` with a fixed `width: 214px` matching `PANEL_WIDTH`, so switching the inline anchor from `top` to `bottom` is sufficient.
- `Settings.test.jsx` — existing tests assert only which rows render, not positioning, so they continue to pass unchanged. No `getBoundingClientRect` is exercised in jsdom (it returns zeros), so the new math is purely additive at runtime.

## Scenarios to Demonstrate

- **Open with all three sliders (processes source)** — tallest panel; confirm it opens fully above the gear and the Search input below remains uncovered.
- **Open with only Auto-close (stable Chrome / system source)** — shorter panel; confirm it still anchors just above the gear and stays centered.
- **Centered alignment** — gear button sits directly beneath the horizontal center of the open popover.
- **Edge case: gear near the right edge of the sidebar** — centered panel clamps inside the viewport's right edge rather than overflowing.
- **Edge case: gear near the left edge** — left clamp keeps the panel ≥ 8px from the viewport's left edge.
