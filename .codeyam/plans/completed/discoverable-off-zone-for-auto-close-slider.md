---
title: "Discoverable Off Zone for Auto-Close Slider"
mode: ui
createdAt: "2026-06-28T16:00:00Z"
source: manual
---

## Summary

The Settings popover already lets you disable auto-closing — but it's
undiscoverable. Today the "Auto-close after" slider's left end (`min="0"`)
is the Off position, and "Off" only appears in the value readout once you've
already dragged all the way to zero. Users naturally look for "off" *beyond*
the maximum time ("never auto-close" = wait forever), not before the minimum,
so they never find it and assume there's no way to turn it off. This plan
moves the Off position to the **far right** of the slider and gives it a
clearly delineated, labeled zone on the track so it reads as an obvious,
deliberate option. The stored model and engine are unchanged: Off still
persists as `autoCloseMinutes === 0`, which `formatAutoClose` renders as
"Off" and the Closer engine treats as disabled — only the slider's
position↔value mapping and presentation change.

## Key Decisions

- **Off lives at the far right, not the left** — this matches the user's
  mental model ("beyond the max time limit = never close"). The slider's real
  time range now runs left→right from the shortest interval up to the maximum,
  with one extra notch past the maximum reserved for Off.
- **Keep `0` as the stored/disabled value** — `service_worker.js`
  (`autoCloseThresholdMinutes`) and `formatAutoClose.js` already treat `<= 0`
  as disabled. We only decouple the slider's raw position from the stored
  minutes; we do NOT change storage, the engine, or the format helper's logic.
  This means existing users who previously set Off (stored `0`) automatically
  show Off at the new right-end position — no migration needed.
- **The left end becomes the shortest real interval (15 min), not 0** — since
  `0` now maps to the far-right Off notch, keeping `min="0"` would create a
  second, redundant "Off" at the left. Raise `min` to `15` so every left-side
  position is a real duration.
- **A delineated visual zone, per the user's request** — rather than a bare
  end-label, add a visually distinct region (a divider line plus a subtly
  shaded band and an "Off" caption) at the right end of the track, so it's
  obvious before you drag there that the far right means disabled.
- **Considered and rejected**: a separate on/off toggle/checkbox. It adds a
  second control for one concept and doesn't match the "off is past the max"
  intuition the user described. The remap keeps a single control.

## Implementation

### 1. Remap the Auto-close slider position ↔ stored value

**File**: `src/lib/components/Settings/Settings.jsx`

In the "Auto-close after" `<label className="Settings-row">` block
(currently lines 158–169):

- Change the range input to `min="15"`, `max="495"`, `step="15"`. The `495`
  is `480` (8 hr, the real max) plus one `15`-minute step that serves as the
  Off sentinel notch at the far right.
- Decouple the displayed position from the stored value:
  - **value (store → position)**: when `settings.autoCloseMinutes > 0`, use it
    directly; otherwise (disabled / `0` / non-positive) position the thumb at
    `495` (far-right Off). e.g. a small local helper or inline expression:
    `settings.autoCloseMinutes > 0 ? settings.autoCloseMinutes : 495`.
  - **onChange (position → store)**: read the raw slider value; if it is at the
    Off sentinel (`>= 495`), call `update('autoCloseMinutes', 0)`; otherwise
    `update('autoCloseMinutes', raw)`. The existing `update` helper already
    coerces with `Number(...)`, so passing `0` persists Off correctly.
- The value readout (`<span className="Settings-value">`) keeps calling
  `formatAutoClose(settings.autoCloseMinutes)`, so it shows "Off" when the
  thumb is in the Off notch and the formatted time otherwise — no change there.
- Wrap the `<input type="range">` in a small positioned container (e.g.
  `<span className="Settings-autoclose">`) so the Off-zone overlay and end
  captions (next step) can be layered over the track. Keep the wrapper inside
  the existing `.Settings-row` grid so layout is preserved.
- Add the delineated Off zone markup inside that wrapper: a right-aligned
  region (`.Settings-autoclose-off`) carrying the divider + shaded band + an
  "Off" caption, plus optional end captions under the track (left: shortest
  interval such as "15 min"; right: "Off"). Mark it `aria-hidden` since the
  live value readout and the input's own value already convey state to AT.

Also update the component's header comment (lines ~17–23) which currently
describes the gear opening "to just 'Auto-close after'": clarify that the
Auto-close slider's right end is the Off position with a delineated zone.

### 2. Style the delineated Off zone

**File**: `src/lib/components/Settings/Settings.css`

Add styles for the new wrapper and overlay, reusing existing popover tokens
(`var(--border)`, `var(--c-lime)`, `var(--text-secondary)`, `var(--font-mono)`)
so it matches the other controls:

- `.Settings-autoclose` — `position: relative;` track wrapper spanning the
  full row width (mirror the existing `.Settings-row input[type='range']`
  full-width rule).
- `.Settings-autoclose-off` — an absolutely-positioned band pinned to the
  right end of the track with a left-edge divider line (`border-left`), a
  subtle background tint, and a small mono "Off" caption. It must sit visually
  behind/around the native thumb (use `pointer-events: none` so it never
  intercepts drags). Width should be generous enough to read as a distinct
  zone (the Off notch is the rightmost ~3% of the value range, so the band
  should be a fixed, slightly wider strip — e.g. a small fixed px width — so
  the label fits, rather than exactly one step wide).
- Optional `.Settings-autoclose-caption` end labels row beneath the slider
  (left/right justified) for "15 min" … "Off".

Keep additions minimal; the file is currently 115 lines and unconstrained.

### 3. Documentation comment touch-up (no logic change)

**File**: `src/lib/utils/formatAutoClose.js`

The header comment says "0 is the 'Off' end of the slider". Update the wording
to "0 is the Off position (now the far-right end) of the slider" so the comment
matches the new UI. The function body and return values are unchanged.

## Reused existing code

- `formatAutoClose` from `src/lib/utils/formatAutoClose.js` (glossary entry:
  `formatAutoClose`) — already renders `0` / non-positive as "Off"; reused
  verbatim for the value readout.
- `autoCloseThresholdMinutes` / `isAutoCloseEligible` / `autoCloseSweep` in
  `service_worker.js` (glossary entries of the same names) — already treat a
  stored `0` as disabled; no change required, confirming the remap is
  UI-only.
- `update(key, value)` helper in `Settings.jsx` — reused for persisting the
  remapped value (it coerces with `Number(...)` and writes the `settings`
  storage key).
- `AutoCloseMinutes` default (`120`) from `src/Constants.jsx` — ensures the
  slider defaults to a real interval (2 hr), not Off.
- Existing scenario `settings-auto-close-control.json` (and `settings-default`)
  under `.codeyam/scenarios/` — the demonstration surface for the Auto-close
  control; extend/add scenarios below.

## Tests to update

- `src/lib/utils/formatAutoClose.test.js` — existing assertions
  (`formatAutoClose(0) === 'Off'`, negatives/non-numeric → "Off") remain valid
  and should keep passing unchanged; they document the stored-value contract
  the remap relies on.
- `service_worker.test.js` (`autoCloseThresholdMinutes`) — unchanged contract
  (`0` → disabled); confirm still green.
- If a Settings component/interaction test exists, add coverage that the
  far-right notch persists `autoCloseMinutes: 0` and that a stored `0`
  positions the thumb at the Off end.

## Scenarios to Demonstrate

- **Default (auto-close on)** — `autoCloseMinutes: 120`, thumb mid-track,
  value reads "2 hr", the Off zone clearly visible at the right but not
  selected.
- **Off selected** — `autoCloseMinutes: 0`, thumb resting in the delineated
  right-end Off zone, value reads "Off".
- **Shortest interval** — `autoCloseMinutes: 15`, thumb at the far left, value
  reads "15 min" (demonstrates the left end is now a real duration, not Off).
- **Maximum interval** — `autoCloseMinutes: 480`, thumb just before the Off
  zone, value reads "8 hr" (shows the boundary between the time range and Off).
- **Stable Chrome (no per-tab data)** — `loadDataSource: 'system'`, so the
  "Warn at" / "Heavy tab ≥" sliders are hidden and Auto-close (with its new
  Off zone) is the primary load control.
