---
title: "Sidebar Header — Align Tools With Logo & Equalize Side Spacing"
mode: ui
createdAt: "2026-06-28T11:35:25Z"
source: manual
---

## Summary

The top of the left sidebar looks messy: the Settings gear and ThemeToggle
buttons don't line up vertically with the `tabcommand` logo, and they sit much
farther from the sidebar's right edge than the logo sits from the left edge.
Fix the header so the buttons are vertically centered on the logo and the inset
on the right (sidebar right edge → rightmost button) equals the inset on the
left (sidebar left edge → logo), giving the header a balanced, tidy appearance.
This is a CSS-only change — no markup or component logic changes.

## Key Decisions

- **Equalize side spacing to 16px.** The logo's left inset is the `AppBrand`'s
  `padding-left: 16px`. Make the rightmost button's inset match it at `16px`.
  Considered shrinking the logo's left padding instead, but matching the right
  side to the existing 16px keeps the established left edge that the Search box
  and Favorites below it already align to.
- **Let the header own the right inset; strip it from the ThemeToggle.**
  `ThemeToggle.css` currently sets `margin-right: 14px` *and* the header sets
  `padding-right: 14px`, so the real right gap is ~28px (doubled) — the root
  cause of the lopsided spacing. Spacing is a layout concern that belongs to the
  sidebar header, not to a reusable toggle component, so remove the toggle's own
  `margin-right` (and its now-redundant `margin-left: auto`) and let the header's
  padding be the single source of truth.
- **Vertically center the buttons on the logo, not on the logo's padded box.**
  `AppBrand` has asymmetric vertical padding (`18px` top / `6px` bottom), so with
  the header's `align-items: center` the buttons center on the full padded box
  and end up ~6px above the logo's actual glyph center. Nudge the tools down so
  their centers line up with the logo monogram/wordmark. Keep the logo's existing
  padding untouched so the vertical rhythm between the logo and the Search box
  below is preserved.

## Implementation

### 1. Equalize the header's right inset and align the tools vertically

**File**: `src/lib/pages/App/App.css`

- In `.App-sidebar-header`, change `padding-right: 14px` to `padding-right: 16px`
  so the right inset matches the logo's 16px left inset. Keep
  `justify-content: space-between` and `align-items: center`.
- Make the tools line up with the logo's glyph center. Because `AppBrand` is
  top-heavy (18px top vs 6px bottom padding), the logo's visual center is ~6px
  below the header's box center. Add a small top offset to `.App-sidebar-tools`
  (e.g. `margin-top: ~6px`, final value to be eyeballed against the live
  preview) so the 28–30px buttons center on the logo rather than floating above
  it. Confirm against the running app that the gear/toggle midline matches the
  logo midline.

### 2. Remove the duplicated right margin from the ThemeToggle

**File**: `src/lib/components/ThemeToggle/ThemeToggle.css`

In `.App-themeToggle`, remove `margin-right: 14px` and `margin-left: auto`. The
header's `space-between` already pushes the tools to the right edge, and the
header's `padding-right` (now 16px) owns the right inset. Keep the toggle's
`width`/`height`/border/background — only the margins are removed. Update the
stale comment ("aligned with the logo at the right edge of the sidebar") if it
no longer describes the rule. After this, the rightmost button's distance from
the sidebar's right edge equals the logo's distance from the left edge.

### 3. (If needed) confirm the Settings gear doesn't add its own inset

**File**: `src/lib/components/Settings/Settings.css`

The Settings gear (`.Settings-toggle`, 30×30) sits left of the ThemeToggle
inside `.App-sidebar-tools` with the header's `gap: 8px` between them. It has no
horizontal margins today, so no change is expected — but verify it contributes
no extra left/right margin that would throw off the centered group. Only adjust
if a stray margin is found.

## Reused existing code

- `AppBrand` from `src/lib/components/AppBrand/AppBrand.jsx` — the logo whose
  16px left inset defines the target spacing; left unchanged.
- `.App-sidebar-header` / `.App-sidebar-tools` rules in
  `src/lib/pages/App/App.css` — the existing fl/space-between header layout being
  tuned.
- `ThemeToggle` (`.App-themeToggle`) from
  `src/lib/components/ThemeToggle/ThemeToggle.css` and `Settings`
  (`.Settings-toggle`) from `src/lib/components/Settings/Settings.css` — the two
  buttons being aligned.

## Scenarios to Demonstrate

- **Home page (both buttons):** Settings gear + ThemeToggle visible; buttons
  vertically centered on the logo, with the right inset visually equal to the
  logo's left inset.
- **Non-home page (toggle only):** On a page where `isHome` is false, only the
  ThemeToggle renders; it should still sit at the correct right inset and align
  with the logo.
- **Light vs dark theme:** Header looks balanced in both themes (button borders
  and logo colors differ, alignment must hold).
- **Logo→tools alignment closeup:** A zoomed view of the header confirming the
  gear/toggle midline matches the logo midline (the specific defect being fixed).
