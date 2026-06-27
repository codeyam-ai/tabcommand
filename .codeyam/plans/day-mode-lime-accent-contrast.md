---
title: "Day-Mode Lime Accent Contrast"
mode: ui
createdAt: "2026-06-27T23:06:31Z"
source: manual
---

## Summary

In day (light) mode the lime "highlighter green" accent (`--c-lime: #c7f04a`)
is too subtle. It's a single color defined as constant across both themes in
`theme.css`, so it carries from the near-black dark surfaces — where it pops —
onto the light surfaces (`#fafafa` page, `#f4f4f4` sidebar, `#eee` raised),
where lime-on-grey is barely legible. The most visible offenders are the
**Import/Export** link in the sidebar footer and the **pin** icons on URL rows;
the Settings value readout uses the same accent. This plan introduces a
theme-aware *foreground* variant of the lime accent that darkens to a
higher-contrast green in day mode, and repoints every place lime is used as a
text/icon color at it — while leaving the bright lime *fills* on solid CTA
buttons (Import, Save, range slider) untouched, since those carry dark text and
already read fine in day mode.

## Key Decisions

- **New foreground token, not a global lime change** — `--c-lime` is used both
  as a foreground color (links/icons/text) and as a solid fill behind dark text
  on CTA buttons. Darkening `--c-lime` globally would muddy those button fills.
  Instead add a dedicated foreground token (`--c-lime-fg` + hover
  `--c-lime-fg-hover`) that equals the current lime in dark mode and a darker,
  higher-contrast green in light mode. This satisfies the user's "foreground
  only" scope choice.
- **Define the new token in `src/index.css`** — that file already hosts the
  theme-aware semantic layer with both `:root,[data-theme="dark"]` and
  `[data-theme="light"]` blocks. `--c-lime` itself stays in `theme.css` as the
  constant brand lime (still used for button fills); the new theme-varying
  foreground token belongs alongside the other per-theme tokens in `index.css`.
- **Day-mode green value** — start with `#1a8f4d` for `--c-lime-fg` and a
  slightly darker `#147a40` for the hover, both chosen to clear AA contrast on
  the light surfaces (page/sidebar/raised). Reuse/relationship to the existing
  `--c-group-1: #1e9e57` green keeps the palette coherent; the editor may
  fine-tune the exact hex to hit the contrast target on the smallest text
  (the 11.5px sidebar link).
- **Dark mode is unchanged** — `--c-lime-fg` resolves to `var(--c-lime)` in the
  dark block, so the dark theme renders pixel-identical to today.

## Implementation

### 1. Add the theme-aware foreground accent tokens

**File**: `src/index.css`

- In the `:root, [data-theme="dark"]` block, add `--c-lime-fg: #c7f04a;` and
  `--c-lime-fg-hover: #a9d437;` (mirroring the current dark lime + hover so dark
  mode is unchanged).
- In the `[data-theme="light"]` block, add `--c-lime-fg: #1a8f4d;` and
  `--c-lime-fg-hover: #147a40;` (darker, higher-contrast greens for light
  surfaces).

### 2. Strengthen the Import/Export sidebar link

**File**: `src/lib/pages/App/App.css`

- `.App-sidebar-footer .App-sidebar-link` — change `color: var(--c-lime)` to
  `color: var(--c-lime-fg)`.
- `.App-sidebar-footer .App-sidebar-link:hover` — change
  `color: var(--c-lime-hover)` to `color: var(--c-lime-fg-hover)`.

### 3. Strengthen the pin icons on URL rows

**File**: `src/lib/components/Url/Url.css`

- `.Url-actions .Url-action.Url-pinned` — change `color: var(--c-lime)` to
  `color: var(--c-lime-fg)`.
- `.Url-tabCommandPinned` — change `color: var(--c-lime)` to
  `color: var(--c-lime-fg)`.

### 4. Strengthen the Settings value readout

**File**: `src/lib/components/Settings/Settings.css`

- `.Settings-value` — change `color: var(--c-lime)` to `color: var(--c-lime-fg)`.
- Leave the `accent-color: var(--c-lime)` on the range input (line 64) and the
  `background: var(--c-lime)` fill (line 100) as-is — those are fills, not
  foreground text.

### 5. Leave solid lime fills untouched (verification note)

These intentionally keep `var(--c-lime)` / `var(--c-lime-hover)` because they're
filled CTAs with dark text and read fine in day mode — confirm none are changed:
`UrlDetails.css` (74, 82), `LabelForm.css` (186, 196), `ImportExport.css`
(100, 108), `Settings.css` (64, 100), `UrlField.css` (41 border), and the
`--brand-command`-based usages (search-match highlight, wordmark, focus rings),
which are already gray (not lime) in light mode and out of scope here.

## Reused existing code

- Theme token layer in `src/index.css` — the existing
  `:root,[data-theme="dark"]` / `[data-theme="light"]` structure is where the
  new `--c-lime-fg` tokens slot in, matching every other theme-varying token.
- `--c-lime` / `--c-lime-hover` from `src/lib/styles/theme.css` — kept as the
  constant brand lime for button fills; the new foreground token references the
  dark value to stay in sync.
- `--c-group-1: #1e9e57` (theme.css) — existing palette green that anchors the
  chosen day-mode foreground green for coherence.
- Components affected (glossary entries): `App` (`src/lib/pages/App/App.jsx`),
  `Url` (`src/lib/components/Url/Url.jsx`), `Settings`
  (`src/lib/components/Settings/Settings.jsx`).

## Scenarios to Demonstrate

- **Day mode — sidebar footer**: Import/Export link now renders in a legible
  darker green against the light sidebar, clearly readable and clickable.
- **Day mode — pinned URL row**: a URL pinned in TabCommand shows its pin
  icon / pinned action in the stronger green, no longer washed out on the light
  card.
- **Day mode — Settings**: the Settings value readout reads clearly in the
  darker green.
- **Night mode — regression check**: the same surfaces in dark mode look
  identical to before (lime `#c7f04a`), confirming the change is light-mode only.
- **Solid CTA buttons (both themes)**: Import button, Save button, and range
  slider keep the bright lime fill with dark text — unchanged.
