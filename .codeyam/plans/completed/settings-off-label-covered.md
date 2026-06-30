---
title: "Fix Covered 'Off' Label in Auto-close Slider"
mode: ui
createdAt: "2026-06-30T00:00:00Z"
source: manual
---

## Summary

In the Settings popup, the "Auto-close after" slider has a delineated **Off**
zone pinned to the right end of its track (`.Settings-autoclose-off`). The band
is positioned at `top: 0` with a fixed `14px` height, but the native range
input's track is vertically centered inside a taller input box that is also
offset by `margin-top: 2px`. The two are misaligned, so the slider track paints
through the lower portion of the Off band and visually covers the "Off" caption
(see `.codeyam/uploads/settings.png`). The fix is a CSS-only adjustment in
`Settings.css`: vertically align the Off band with the slider track and ensure
it layers above the track so the label is fully legible.

## Key Decisions

- **CSS-only fix, no JSX change** — the markup in `Settings.jsx` (the
  `.Settings-autoclose` wrapper, the `input[type="range"]`, the
  `.Settings-autoclose-off` band, and the caption row) already expresses the
  intended structure. The defect is purely visual layering/alignment, so it
  belongs in `Settings.css`.
- **Align to the track center rather than `top: 0`** — the band was placed at
  the top of the wrapper, but the native track sits at the input's vertical
  midpoint. Centering the band on the track (e.g. `top: 50%` with a
  `translateY(-50%)`, accounting for the input's `2px` top margin / row layout)
  is what removes the overlap. Considered simply shrinking the band, but that
  leaves it floating above the track instead of sitting on it as designed.
- **Guarantee stacking order** — the band must paint above the native track.
  Native range controls can render their track/thumb in ways that visually
  cover a sibling, so give `.Settings-autoclose-off` an explicit `z-index`
  (and, if needed, make the input `position: relative` with a lower `z-index`)
  while keeping `pointer-events: none` so the band never intercepts drags.
- Preserve the existing visual treatment of the band (lime tint, left divider,
  rounded right corners, mono 9px caption) — only its vertical position and
  stacking change.

## Implementation

### 1. Align and layer the Off band over the slider track

**File**: `src/lib/components/Settings/Settings.css`

Update `.Settings-autoclose-off` so it is vertically centered on the native
range track instead of pinned to `top: 0`, and ensure it renders above the
track:

- Replace `top: 0` with a track-centered position (e.g. `top: 50%` +
  `transform: translateY(-50%)`), tuned against the input's `margin: 2px 0 0`
  so the band sits squarely on the visible track line.
- Add an explicit `z-index` to the band so it paints above the native track.
- If the native track still bleeds over the band in Chrome, give
  `.Settings-autoclose input[type='range']` `position: relative` with a lower
  `z-index` to make the stacking deterministic.
- Keep `pointer-events: none`, the lime tint, the `border-left` divider, the
  rounded right corners, and the mono caption styling unchanged.

Verify the band still hugs the right end of the track and that the "Off"
caption is fully visible both when the thumb is mid-track (e.g. "2 hr") and when
the thumb is parked in the Off notch at the far right (`autoCloseMinutes === 0`,
raw position 495), where the thumb sits directly over the band.

## Reused existing code

- `Settings` component from `src/lib/components/Settings/Settings.jsx` (glossary
  entry: `Settings`) — owns the auto-close slider markup; no change needed, but
  the CSS targets its existing class names.
- `formatAutoClose` from `src/lib/utils/formatAutoClose.js` (glossary entry:
  `formatAutoClose`) — formats the `.Settings-value` readout ("2 hr", "Off");
  unaffected, but relevant to the scenarios below.
- Existing auto-close slider tests in
  `src/lib/components/Settings/Settings.test.jsx` (the "far-right Off notch"
  positioning and persistence cases) — they assert behavior, not layout, so
  they should continue to pass unchanged; use them to confirm the fix is
  visual-only.

## Scenarios to Demonstrate

- **Mid-track value** — auto-close set to "2 hr" (matching the bug report
  screenshot): thumb on the left, Off band fully legible at the right end of the
  track.
- **Off selected** — `autoCloseMinutes === 0`: thumb parked in the far-right Off
  notch directly over the band; confirm the "Off" caption remains readable and
  the band/thumb don't clip each other awkwardly.
- **Shortest interval** — auto-close at "15 min" (left extreme): thumb at far
  left, Off band undisturbed at the right.
- **Day vs Night theme** — open the panel under both light and dark themes to
  confirm the band's tint and the "Off" caption keep adequate contrast against
  the track after the alignment change.
