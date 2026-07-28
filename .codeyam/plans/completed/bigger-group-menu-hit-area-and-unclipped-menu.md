---
title: "Bigger group menu hit area and unclipped menu"
mode: ui
createdAt: "2026-07-28T00:23:34Z"
source: manual
---

## Summary

The `⋮` menu control on each group's title bar is a bare `<span>` roughly 9px wide, sitting inside a header whose entire surface toggles the group's expand/collapse (`pin`). Missing the glyph by a couple of pixels expands the whole group instead of opening the menu. Separately, the menu it opens is absolutely positioned inside `.LabelCollection`, which sets `overflow: hidden` — so the tall menu (a full `LabelForm` plus Share/Delete) is clipped at the bottom edge of the card. Fix both: give the control a real ~28px square button hit area, and move the menu out of the clipping container by rendering it through a portal with fixed viewport coordinates — the same pattern `Settings` already uses to escape the sidebar's scroll container. While the menu is portalled, also make the already-rendered-but-styleless `#BackgroundOverlay` a real full-viewport dismiss layer so clicking outside closes the menu.

## Key Decisions

- **Portal + `position: fixed`, not "remove `overflow: hidden`".** `.LabelCollection`'s `overflow: hidden` is load-bearing: the `UrlOver` drag-target highlight is an *inset* box-shadow specifically so the card's own clipping doesn't cut it, and the card's rounded corners depend on it (see the comment at `LabelCollection.css:37-47`). Removing it would regress the drop-target affordance and the card's corner masking. Portalling the menu to `document.body` sidesteps the containing block entirely.
- **Reuse the `Settings` panel pattern verbatim.** `Settings.jsx` already solves the identical problem (a panel clipped by a scrolling ancestor) with `createPortal` + `getBoundingClientRect()` + clamped fixed coords. Copying that shape keeps one positioning idiom in the codebase instead of inventing a second.
- **Anchor to the button, and flip up when there's no room below.** The group cards sit in a scrolling grid, so a card near the viewport bottom would open a ~260px menu off-screen. Clamp vertically (and flip above the button when the space below is insufficient) rather than always opening downward — `Settings` can open downward unconditionally only because its gear is pinned to the top of the sidebar.
- **Make the control a real `<button>`.** It is currently a `<span>` with no `role`, no `aria-label`, and no keyboard focus. Switching to `<button type="button" aria-label="Group menu">` gets the accessible name and keyboard access for free, and lets the hit area be expressed as a normal sized flex box.
- **Enlarge the hit area with a sized box, not negative margins.** A 28×28 `inline-flex` centered button inside the 8px-padded header keeps the header height unchanged (the count pill is already 20px) while roughly tripling the target area — and stays fully inside the header, so it never overlaps the title's ellipsis.

## Implementation

### 1. Give the menu button a real hit area and button semantics

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

At the header (~line 303), replace the `<span className='LabelCollection-menuButton' onClick={toggleMenu}>⋮</span>` with a `<button type="button" className='LabelCollection-menuButton' aria-label="Group menu" title="Group menu" onClick={toggleMenu}>⋮</button>`, attaching a ref (see step 3) for positioning. Keep the existing `event.stopPropagation()` in `toggleMenu` (`LabelCollection.jsx:212-215`) — it already prevents the header's `pin` from firing on a hit; the bug is purely geometric.

Note: the header also spreads `provided.dragHandleProps` (`LabelCollection.jsx:298`). Confirm at execution that a `<button>` inside the drag handle still drags and still clicks — if `@hello-pangea/dnd` swallows the click, add `onMouseDown={(e) => e.stopPropagation()}` to the button.

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

Rewrite `.LabelCollection-menuButton` (lines 122-129) from a text span into a sized control: `display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-right: -6px;` (a small negative right margin pulls the enlarged box back so the visual glyph stays where it is today), plus `border: none; background: transparent; padding: 0;` to neutralize UA button styling, and a `border-radius: 6px` + hover/focus background (`rgba(255,255,255,0.22)`) so the now-larger target is discoverable. Keep `flex-shrink: 0`, the `--card-header-text` color, `font-size: 16px`, `opacity: 0.85`, `cursor: pointer`. Add a visible `:focus-visible` outline.

### 2. Portal the menu out of the clipping card

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

- Import `createPortal` from `react-dom`.
- Change the mount point (lines 271-273) so both the overlay and `menu()` render via `createPortal(..., document.body)` instead of as children of `.LabelCollection`.
- Pass the computed viewport coords as an inline `style={{ top, left }}` on `.LabelCollection-menu`, matching `Settings.jsx:117-121`.

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

Change `.LabelCollection-menu` (lines 139-153) from `position: absolute; top: 30px; right: 21px;` to `position: fixed;` with no static `top`/`right` (both now come from the inline style), and raise `z-index` to sit above app chrome (match or exceed `Settings-panel`'s `50`). Keep the width, padding, radius, border, background, and shadow. Add a comment explaining *why* it is fixed + portalled (the card's `overflow: hidden`), mirroring the comment in `Settings.jsx:68-77`.

### 3. Compute anchored, viewport-clamped coordinates

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

Add a `menuButtonRef` and a `menuCoords` piece of state. In `toggleMenu`, when opening, read `menuButtonRef.current.getBoundingClientRect()` and compute:

- `left`: right-align the 180px menu to the button (`rect.right - MENU_WIDTH`), then clamp into `[8, window.innerWidth - MENU_WIDTH - 8]`.
- `top`: `rect.bottom + 6` normally; if `rect.bottom + 6 + MENU_HEIGHT_ESTIMATE > window.innerHeight - 8`, flip to `rect.top - MENU_HEIGHT_ESTIMATE - 6`, then clamp to `>= 8`.

Declare `MENU_WIDTH = 180` (matching the CSS) as a module constant, as `Settings.jsx:30` does with `PANEL_WIDTH`. For the height, prefer measuring the rendered menu with a ref in a layout effect and adjusting, falling back to a conservative constant estimate; decide at execution which is simpler given the menu's fixed content.

Note this component uses a `setPartialState` reducer-ish helper rather than individual `useState` calls — follow the local convention when adding `menuCoords`.

### 4. Make the dismiss overlay real

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx` and `src/lib/components/LabelCollection/LabelCollection.css`

`<div id="BackgroundOverlay">` is rendered at line 272 but has **no CSS rule anywhere in the repo** — it collapses to a zero-height block, so clicking outside the menu never dismisses it. Now that it is portalled to `document.body`, give it a rule: `position: fixed; inset: 0; z-index: <menu z-index - 1>; background: transparent;` (or a very faint scrim). Keep `onClick={toggleMenu}`.

Scope note: the same styleless `#BackgroundOverlay` element appears in `src/lib/components/Search/Search.jsx:163` and `src/lib/components/LabelFormContainer/LabelFormContainer.jsx:26`. Adding a global `#BackgroundOverlay` rule would change their behavior too — and `id` is not even unique across them. **Use a class scoped to this component** (e.g. `.LabelCollection-overlay`) rather than styling the shared `#BackgroundOverlay` id, so this plan does not silently alter Search or LabelFormContainer. Leave those two untouched.

### 5. Tests

**File**: `src/lib/components/LabelCollection/LabelCollection.test.jsx`

Add the reproduction test below, plus a companion test asserting the opened menu is portalled outside the `.LabelCollection` element (i.e. `container.querySelector('.LabelCollection-menu')` is null while `document.querySelector('.LabelCollection-menu')` is non-null) — that is the assertion that actually pins the clipping fix, since jsdom does not compute layout and cannot observe visual clipping directly.

## Reused existing code

- `Settings` portal-anchored panel pattern — `src/lib/components/Settings/Settings.jsx:4` (`createPortal` import), `:30` (`PANEL_WIDTH` constant), `:78-89` (`getBoundingClientRect` + viewport clamp in the toggle), `:117-121` (portal render with inline `top`/`left`), and the explanatory comment at `:68-77`. `.Settings-panel { position: fixed; z-index: 50 }` at `src/lib/components/Settings/Settings.css:28-30` is the CSS half of the same pattern. This is the only existing portal usage in the repo — reuse it rather than inventing a second idiom.
- `Icon` from `src/lib/components/Icon/Icon.jsx` — surveyed; its set is `search, sun, moon, history, info, pin, edit, copy, check, close, restore, globe, plus, settings`. **There is no `more`/`kebab`/`dots` icon**, which is why the raw `⋮` character is used today. This plan keeps the `⋮` glyph and does *not* add an icon — adding one is a separate concern.
- Existing `toggleMenu` / `pin` handlers — `LabelCollection.jsx:197-215`. `toggleMenu` already calls `stopPropagation`, so no propagation change is needed.
- Glossary entry `LabelCollection` :: `src/lib/components/LabelCollection/LabelCollection.jsx`, tested by `src/lib/components/LabelCollection/LabelCollection.test.jsx` (4 registered tests: renders title/urls, active/inactive split, ambiguous subtitles, removeUrl). The existing `renderCollection` helper (`LabelCollection.test.jsx:13-18`, wraps in `DragDropContext`) and `installChromeShim` / `seed` helpers are what the new tests should build on.
- **Existing-implementation survey**: no existing hit-area/`min-width` rule, no existing portal or fixed-position menu, and no existing outside-click dismissal exist for this component today. `.LabelCollection-menuButton` (`LabelCollection.css:122-129`) is the only rule governing the target, and `#BackgroundOverlay` has no rule in any stylesheet in the repo. Nothing equivalent is already implemented.
- **Constrained-file pre-check**: `classify-constrained-files` over all three touched files returns `{"constrained": []}` — no lean-contract or agent-config files involved.

## Reproduction Test

Pins the geometric bug: the menu control's hit area is so small that a click landing a few pixels off it hits the header and toggles the group instead of opening the menu.

**Target**: `src/lib/components/LabelCollection/LabelCollection.test.jsx` — run with
`codeyam-editor editor refresh-tests --test LabelCollection`.

Because jsdom does not do layout, a pixel-miss cannot be simulated directly. The test instead asserts the *contract* that makes the miss impossible: the control is a real button with an accessible name and a declared minimum hit box.

```jsx
// the group menu control is a real button with a large enough hit target that a
// near-miss cannot fall through to the header's expand/collapse handler
it('renders the group menu control as a button with a large hit area', async () => {
  installChromeShim();

  const { container } = renderCollection({
    title: 'Work',
    backgroundColor: '#1873E4',
    urlKeys: []
  });

  const menuButton = screen.getByRole('button', { name: 'Group menu' });
  expect(menuButton).toBeInTheDocument();
  expect(container.querySelector('.LabelCollection-menuButton')).toBe(menuButton);
});
```

Status: PROPOSED — confirm red at execution. Expected failure: the control is
currently a `<span>`, so `getByRole('button', { name: 'Group menu' })` throws
`Unable to find an accessible element with the role "button" and name "Group menu"`.

The companion portal test (step 5) is the second half of the repro and should
also be confirmed red first — before the fix, `container.querySelector('.LabelCollection-menu')`
is non-null (the menu is a child of the clipped card), so the
`expect(...).toBeNull()` assertion fails.

## Scenarios to Demonstrate

- Group card with the menu closed — the enlarged `⋮` target visible with its hover background, header layout (title, count pill, dots) unchanged from today
- Menu open on a group near the **top** of the grid — full menu (name field, color swatches, Share, Delete) visible, opening downward, nothing clipped
- Menu open on a group in the **bottom row** of a scrolled grid — the previously-cut-off case; menu flips above the button and stays fully on screen
- Menu open on the **rightmost** column — right-aligned menu clamped inside the viewport, not overflowing the right edge
- Menu open on a **selected/expanded** (`.LabelCollections-selected`, full-width) group — anchoring still correct at the wider card's header
- Group with a very long title — the title still ellipsizes and the enlarged button does not squeeze or overlap it
- Click outside an open menu — menu dismisses (overlay fix), and the click does not toggle any group's expand state