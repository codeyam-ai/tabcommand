---
title: "Rail Surface Elevation Hierarchy"
mode: ui
createdAt: "2026-06-29T12:00:00Z"
source: manual
---

## Summary

The left sidebar (268px), right tab rail (312px), and load rail (340px) were
blending into the main canvas — the rails sat only 4 points lighter than the
`#0a0a0a` canvas and their dividing borders used the near-invisible `.08`
hairline. This change establishes a clear three-tier elevation hierarchy by
raising the rail surfaces, brightening cards/raised/track surfaces, and giving
the three rails a dedicated, stronger divider token. Net effect: darkest canvas
(focal) → lighter side rails (chrome) → brighter cards, with visible rail
dividers — all staying within the design system's near-black + hairline
vocabulary.

## Key Decisions

- **Update both token files in sync.** Surface values are mirrored across two
  files: `src/lib/styles/theme.css` (the `--c-*` CodeYam names the handoff spec
  uses) and `src/index.css` (the `--sidebar-bg`/`--rail-bg`/`--card-bg`/
  `--border`/`--gauge-track`/`--search-bg` names the rail/card components
  actually render from). Changing only `theme.css` would leave the visible rails
  unchanged, because `.App-sidebar`/`.Tabs`/`.LoadProcesses` read the
  `index.css` surface tokens. Both files are bumped to the same new values to
  keep them consistent.
- **New token `--c-rail-divider` lives in `theme.css`** alongside the other
  `--c-*` neutrals. Both token files are imported globally, so all three rail
  component stylesheets can reference it regardless of which file defines it.
- **Search input follows cards.** `--search-bg` (dark) equals the old card value
  `#161616`; it moves to `#1e1e1e` with cards so inputs stay at the new card
  elevation rather than reading as recessed. (Confirmed with user.)
- **Only the three outer rail-to-canvas dividers change** to `--c-rail-divider`.
  Internal rail hairlines (e.g. `.App-sidebar-footer` border-top, `.App-gauge`
  border-bottom, `.LoadProcesses` section separators) keep `--border`/
  `--c-border` — they separate content *within* a rail, not rail from canvas.
- **Canvas and light/dark white cards are untouched.** Dark `--app-bg`/`--c-page`
  stays `#0a0a0a` (the focal backdrop); light `--card-bg`/`--search-bg` stays
  `#ffffff` (already maximal).

## Implementation

### 1. Bump `--c-*` surface tokens + add rail-divider token

**File**: `src/lib/styles/theme.css`

Dark block (`:root, [data-theme='dark']`):
- `--c-panel`: `#0e0e0e` → `#151515`
- `--c-card`: `#161616` → `#1e1e1e`
- `--c-raised`: `#1c1c1c` → `#252525`
- `--c-track`: `#2a2a2a` → `#2f2f2f`
- add `--c-rail-divider: rgba(255, 255, 255, 0.16);`

Light block (`[data-theme='light']`):
- `--c-page`: `#fafafa` → `#fbfbfc`
- `--c-panel`: `#f4f4f4` → `#ebedf0`
- `--c-raised`: `#eeeeee` → `#e3e5e9`
- `--c-track`: `#e2e2e2` → `#dcdee2`
- add `--c-rail-divider: rgba(0, 0, 0, 0.14);`

(`--c-card` light stays `#ffffff`; `--c-page` dark stays `#0a0a0a`.)

### 2. Bump the mirrored surface tokens in the legacy-named set

**File**: `src/index.css`

Dark block (`:root, [data-theme="dark"]`):
- `--sidebar-bg`: `#0e0e0e` → `#151515`
- `--rail-bg`: `#0e0e0e` → `#151515`
- `--card-bg`: `#161616` → `#1e1e1e`
- `--search-bg`: `#161616` → `#1e1e1e`
- `--gauge-track`: `#2a2a2a` → `#2f2f2f`
- `--app-bg` stays `#0a0a0a`

Light block (`[data-theme="light"]`):
- `--app-bg`: `#fafafa` → `#fbfbfc`
- `--sidebar-bg`: `#f4f4f4` → `#ebedf0`
- `--rail-bg`: `#f4f4f4` → `#ebedf0`
- `--gauge-track`: `#e2e2e2` → `#dcdee2`
- `--card-bg` and `--search-bg` stay `#ffffff`

### 3. Apply the rail divider — left sidebar (268px)

**File**: `src/lib/pages/App/App.css`

`.App-sidebar` `border-right: 1px solid var(--border);` →
`border-right: 1px solid var(--c-rail-divider);`

Leave `.App-sidebar-footer` border-top and `.App-gauge` border-bottom on
`var(--border)`.

### 4. Apply the rail divider — right tab rail (312px)

**File**: `src/lib/components/Tabs/Tabs.css`

`.Tabs` `border-left: 1px solid var(--border);` →
`border-left: 1px solid var(--c-rail-divider);`

### 5. Apply the rail divider — load rail (340px)

**File**: `src/lib/components/LoadProcesses/LoadProcesses.css`

`.LoadProcesses` `border-left: 0.5px solid var(--c-border);` →
`border-left: 0.5px solid var(--c-rail-divider);`

Leave the internal `border-bottom: 0.5px solid var(--c-border)` section
separators unchanged.

## Reused existing code

- `src/lib/styles/theme.css` — authoritative `--c-*` neutral token table
  (dark + light), where the new `--c-rail-divider` token is added.
- `src/index.css` — mirrored surface token set (`--sidebar-bg`, `--rail-bg`,
  `--card-bg`, `--search-bg`, `--gauge-track`, `--border`) that the rail/card
  components actually consume.
- Existing theme-swap mechanism via the `data-theme` attribute on `.App`
  (glossary: `useTheme` / `ThemeToggle`) — no logic change; both themes pick up
  the new values automatically.

## Scenarios to Demonstrate

- Dark theme, full app: canvas reads clearly darker than the three rails, rails
  read clearly darker than cards, and all three rail dividers are visible.
- Light theme, full app: same three-tier separation with the cooler-gray rails
  (`#ebedf0`) against the near-white page and white cards.
- Load page (340px load rail) in both themes: the load rail's left divider is
  visibly stronger while its internal section separators stay subtle.
- Search input in dark theme: input surface matches card elevation (`#1e1e1e`),
  not recessed below it.
- Hover/raised states (group cards, rows): `--c-raised` brightening still reads
  as a step above the new brighter card surface.
