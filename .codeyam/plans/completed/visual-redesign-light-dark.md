---
title: "Visual Redesign — Light/Dark Theme & Layout"
mode: ui
createdAt: "2026-06-25T21:05:00Z"
source: prototype
step: 10
---

# Visual Redesign — Light/Dark Theme & Layout

Prototyped a move toward two new design mockups (`lighttabcommand.png` and
`darktabcommand.png`), starting from the structural/foundational layer (colors,
sidebar widths, spacing) and iterating outward based on live feedback. The work
was deliberately scoped to layout + theming + per-row affordances; the right-rail
content restyle and the sidebar gauge legend / "Getting busy" status card were
explicitly **deferred** (not done this session).

## Theme token system (new)

Introduced a CSS custom-property theme layer in `src/index.css`:

- A light `:root` palette: neutral warm-gray surfaces (`--app-bg #f1f1f2`,
  `--sidebar-bg`/`--rail-bg #f4f4f5`), white group cards (`--card-bg #ffffff`),
  text tokens, border/search/gauge tokens, brand wordmark colors
  (`--brand-tab`, `--brand-command #e05a3b`), elevation (`--shadow-card`),
  shape (`--radius-card`), and layout dims (`--sidebar-width 260px`,
  `--rail-width 320px`, `--gap 16px`, `--content-pad 20px`).
- A `[data-theme="dark"]` block overriding the surface/text/line tokens with the
  dark mockup's near-black surfaces (`#0e0e10` / `#090909`), dark cards
  (`#1b1b1d`), and lighter text — layout dims shared.

Components were migrated off raw hex onto these tokens so the whole UI re-themes
from one place.

## Layout (structural)

- `src/lib/pages/App/App.{jsx,css}`: converted the float/percentage layout to
  flexbox. `.App` is a flex row; left sidebar and right rail are **fixed width**
  (260px / 320px) and the center flexes. Home content wrapped in a new
  `.App-home` flex row (`<Labels />` then `<Tabs />`). `body`/surfaces use theme
  tokens.
- `src/lib/components/Labels/Labels.{jsx,css}`: center grid is flexible; cards
  lay out in a **2-column** grid (was 3) via `chunkLength` default `2` and a
  simplified media-query mapping (2 cols ≥900px, 1 col below). Added a
  `.Labels-header` row (Add-group pill + "All Groups" label) with extra spacing
  and a visible bottom divider.
- `src/lib/components/Tabs/Tabs.css`: right rail converted to fixed width + theme
  surfaces; section header bars restyled from dark-gray bars to light uppercase
  muted labels with a bottom border.

## Group cards

- `src/lib/components/LabelCollection/{jsx,css}`: white card body, theme border +
  shadow, `--radius-card`. Card width via `flex: 1 1 calc(50% - gap/2)` so a lone
  card takes half-width. Header made **compact + left-aligned** with a **count
  badge** (translucent pill showing `urlKeys.length`) and the menu button; tab
  rows tightened.

## Brand wordmark + theme toggle

- `src/images/icon.svg` (new): extracted the 4-color TabCommand mark from
  `logo.svg` (the original logo's wordmark text was light-gray, built for the old
  dark sidebar).
- `App.jsx`: replaced the `logo.svg` `<img>` with the colored `icon.svg` + a
  "TabCommand" text wordmark (`Tab` in `--brand-tab`, `Command` in
  `--brand-command`). Removed the unused `logo` import.
- Theme toggle: added `theme` state that sets `document.documentElement.dataset.theme`,
  a `toggleTheme` handler, and a button in a new `.App-sidebar-header` row —
  aligned with the logo at the **far-right edge of the left panel**. Uses inline
  **sun/moon** SVG glyphs (`MoonIcon` in light mode → switch to dark, `SunIcon`
  in dark mode → switch to light); Ant's icon set has no sun/moon.

## Tab rows (`Url`)

- `src/lib/components/Url/{jsx,css}`:
  - **Persistent gray ✕** on the far right of every row to remove it
    (`removeHandler = onRemove || (closed ? handleRemove : handleClose)`,
    shown whenever there's something to remove). The redundant remove/close
    icons were dropped from the hover action row, which now holds only pin +
    edit (edit stays hover-only to preserve existing behavior/tests).
  - **Favicon fallback** replaced the dated `defaultFavicon.png` blue-circle-x
    placeholder with a **colored monogram tile** (first letter, color chosen
    deterministically per-url from an 8-color palette). Also triggers on
    `<img onError>` so broken favicon URLs degrade gracefully. Removed the
    `defaultFavicon` import; initial favicon state is now `''`.
  - Row title gradient text-fill changed from hardcoded `black` to
    `var(--text-primary)` (fixed a dark-mode bug where titles vanished).

## Scenario seed data

- `.codeyam/scenarios/home-grouped.json`: populated the empty `favicon` fields
  for all seeded URLs with Google favicon-service URLs so the grouped preview
  shows real site icons (GitHub, Figma, Notion, React, MDN, Gmail, Hacker News).
  Other scenarios (e.g. `home-unorganized`) still have empty favicons and now
  exercise the monogram fallback.

## Tests

- `src/lib/components/Url/Url.test.jsx`: updated the favicon test to seed a real
  favicon URL (asserts `<img>` renders, no fallback) and added a new test
  asserting the monogram fallback (`.Url-favFallback`, letter `Q`) when a url has
  no favicon. All 9 Url tests pass. The hover test (edit appears only on hover)
  still holds.

## Verified live

Captured across light + dark (toggle click) and the grouped / unorganized /
empty states. Confirmed: flex layout + fixed sidebars, 2-column grid, neutral
grays, white cards with compact colored headers + count badges, wordmark + icon,
sidebar sun/moon toggle, persistent ✕, real favicons, and monogram fallback.

## Deferred (not done — candidates for follow-up)

- Right-rail content restyle: "UNGROUPED TABS" + count + "Drag onto a group to
  file it.", "AUTOMATICALLY CLOSED" short subtitle, History footer with arrow,
  and the dark-mode "drag me" (`encourageDrag`) highlight pill that still reads
  as a light gray pill on dark surfaces.
- Sidebar gauge legend (CPU/Mem dots + %), the "Getting busy / Looks good"
  status card, and the TABS / GROUPS footer counts.
- Theme preference persistence (currently in-memory state; not stored to
  `uxSettings`).
