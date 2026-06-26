---
title: "dani: TabCommand CodeYam Redesign"
mode: ui
createdAt: "2026-06-26T13:26:04Z"
source: manual
prefix: "dani"
---

## Summary

Re-skin and UX-tighten the entire TabCommand UI in the **CodeYam design language** —
a near-black dark workspace (default) with a lime identity accent, IBM Plex type,
hairline-separated panels, and a matching `#fafafa` light theme toggled by a
`data-theme` attribute. This is a **visual + organizational redesign over the
existing data model**, not a data-model change: storage keys, the `chrome` shim,
the service worker, the DnD reducer, search, and the per-tab/process load math all
stay authoritative. The work introduces a CSS custom-property token layer (none
exists today), restyles the three-column shell and every component/page, rebuilds
the Browser Load gauge as two stroke-dashoffset rings, and adds four
organizational surfaces over data the app already has: a **theme toggle**, a
**load-aware triage panel + Heaviest-Tabs rail**, an inline **Add-group form** with
a custom color picker, and a dedicated **History page**. Two new tunables
(`warnAt`, `heavyThreshold`) and a `theme` preference are persisted to
`chrome.storage.local`. The authoritative spec is the handoff at
`/Users/nani/Downloads/design_handoff_tabcommand_redesign/README.md` (token tables,
typography, logo geometry, gauge math, interaction table) — treat its colors, type,
spacing, radii, and interaction states as final and exact.

## Key Decisions

- **One comprehensive plan, sequenced internally** by the handoff's suggested
  implementation order (tokens → shell/cards/rows → gauge/triage → secondary views
  → add-group/rail → DnD/search/re-capture). The Implementation section is ordered
  so each block builds on the prior.
- **Inline SVG icons, no new dependency.** The handoff calls for "Lucide-style line
  icons" (1.9px stroke, `currentColor`, round joins). Build a tiny local
  `Icon` set as inline SVG React components and **remove `@ant-design/icons`** usage.
  This honors the handoff's "no new framework / no new styling layer" guidance and
  avoids adding `lucide-react`. (Confirm at editor time whether dropping the
  `@ant-design/icons` dependency from `package.json` is in scope, or just stop
  importing it.)
- **Token layer is greenfield and foundational.** Investigation confirmed zero CSS
  custom properties, zero `var(--…)`, and no `data-theme` hook anywhere; ~19 CSS
  files use raw hex. A single `src/lib/styles/theme.css` (imported once) defines the
  dark defaults on `:root`/`[data-theme="dark"]` and the light overrides on
  `[data-theme="light"]`, and every component CSS migrates from hardcoded hex to
  `var(--…)`. This is the highest-leverage first step.
- **Gauge swaps `gradient-path` → plain stroke-dashoffset arcs.** The two-ring spec
  (CPU outer / Memory inner, `-90deg` start) is far simpler with `stroke-dasharray
  = 2πr` + animated `stroke-dashoffset` than the current 100-segment gradient-path
  approach, and removes a runtime that no-ops under jsdom anyway. `gradient-path`
  can stay in `package.json` until cleanup is confirmed, but the new gauge does not
  use it. Keep the pure math (`deriveGaugeTotals`, `gaugeFillPercent`,
  `deriveSystemTotals`) — only the rendering changes.
- **Navigation stays storage-driven.** Routing is decentralized through
  `uxSettings.page` (no router). The redesign restyles the sidebar and adds a
  `HISTORY` route to the `Pages` enum + a render branch in `App.jsx`; it does **not**
  rewire navigation.
- **Map redesign surfaces to existing components** rather than rebuild: `labels` =
  groups (`Labels` grid), the `Tabs` component already renders the right-rail
  sections (Active / Auto-closed / History) and gains a new **Heaviest Tabs**
  section, `Url` is the shared 38px tab row, `LabelForm`/`LabelFormContainer` become
  the inline Add-group form, `LoadMeter` becomes the two-ring gauge.
- **Keep load-severity thresholds in sync.** Per-tab bar colors live in CSS
  (`Url.css`, `LoadUrl.css`) and logic in `processLoad.js`; the redesign keeps the
  fixed cutoffs (`<40%` green / `40–69%` amber / `≥70%` red) and threads them
  through the new tokens, while `warnAt`/`heavyThreshold` (new settings) drive the
  gauge/triage red state and the heavy-tab list.

## Implementation

### 1. Theme-token layer + `data-theme` switching (foundation)

**New file**: `src/lib/styles/theme.css`

Define every token from the handoff's "Theme tokens" tables as CSS custom
properties. Dark on `:root` (and `[data-theme="dark"]`), light overrides on
`[data-theme="light"]`. Tokens (see README lines 58–97 for exact values):
`--c-page, --c-panel, --c-card, --c-raised, --c-track, --c-border, --c-border2,
--c-t1…--c-t5, --c-blue, --c-logo-accent`, plus theme-constant tokens
(`--c-lime #c7f04a`, `--c-lime-hover #a9d437`, load `--c-load-light/med/high`,
`--c-mem #b48ead`), the 9 group hues, and radii/motion constants (cards 16,
rows/inputs 11, tiles 6–9, badges 20, bars 3; transitions `.12–.18s`, gauge `.6s`).
Also pull in IBM Plex Sans (400–800) + IBM Plex Mono via the existing font approach
(self-host under `public/` or `@font-face`; do not add a build-time font framework).
`--c-logo-accent` is lime in dark, dark-gray `#3a3a3a` in light.

**File**: `src/index.css` and `src/lib/pages/App/App.jsx`

Import `theme.css` once (from `App.jsx` or `index.jsx`). Set `font-family` to IBM
Plex Sans on `body`. Read the persisted `theme` from storage on mount and write
`data-theme` onto the `.App` root (absent/`""` = dark default, `"light"` = light).

**File**: `src/Constants.jsx`

- Add `HISTORY: 'History'` to `Pages`.
- Replace `Colors` with the handoff's 9-hue group palette (README line 96):
  `#1e9e57 #2f7de1 #e07d1e #c2278a #d8352a #168f8f #7c3aed #5b6470 #cf9f1c`
  (no two groups repeat a hue). Keep `ItemTypes`, `AutoCloseMinutes`,
  `MaxAutoClosedTime`.
- Add settings defaults: `WarnAtDefault = 70`, `HeavyThresholdDefault = 60`.

**New storage keys** (hydrate defaults in `src/lib/utils/Chrome/Chrome.js` and add
to `KNOWN_KEYS` in `src/lib/utils/chromeShim/chromeShim.js`):
- `theme` → `""` (dark)
- `settings` → `{ warnAt: 70, heavyThreshold: 60 }`

### 2. Logo (SVG monogram + lowercase wordmark)

**New file**: `src/lib/components/Logo/Logo.jsx` (+ `Logo.css`, `index.js`)

Build the blocky "TC" monogram as inline SVG on a `0 0 24 24` grid exactly per the
handoff "The logo" section (README lines 122–134): a `currentColor` crossbar rect +
three stepped `--c-logo-accent` blocks forming the stepped "C". Render ~22px.
Wordmark `tabcommand` to its right: Sans 17/800, lowercase, `letter-spacing:-.03em`,
"tab" in `--c-t1`, "command" in `--c-logo-accent`. Replace the current
`images/logo.svg` `<img>` in the sidebar with `<Logo/>`.

### 3. Three-column shell + sidebar

**File**: `src/lib/pages/App/App.jsx`, `src/lib/pages/App/App.css`

Replace the float layout with a flex/grid shell: **sidebar 268px**, **main column**
(swaps views), **right rail 312px shown only on Home**. The sidebar contains, top to
bottom: `<Logo/>` + **theme toggle** (30px square sun-in-dark / moon-in-light
button), `<Search/>`, the `<LoadMeter/>` gauge (clickable → LOAD), the **Triage
panel** (Home only), and a footer (`N tabs · N groups` on Home + an ↕ Import/Export
link → IO). Add the `HISTORY` render branch (`page.name === Pages.HISTORY → <History/>`).
Theme toggle writes `theme` to storage and flips `data-theme`.

**New file**: `src/lib/components/ThemeToggle/ThemeToggle.jsx` (+ css, index) —
reads/writes `theme`, renders the sun/moon inline-SVG icon.

**New file**: `src/lib/components/Triage/Triage.jsx` (+ css, index) — a tinted card
whose color tracks the overall load level vs `settings.warnAt` (red "Running hot"
with a **"Review N heavy tabs"** CTA when `load ≥ warnAt`; amber "Getting busy" /
green "Comfortable" as status-only, no button). The CTA toggles **review mode**
(shared UI state — see step 5). The live dot pulses (1.8s, honor
`prefers-reduced-motion`). "N heavy tabs" counts tabs with per-tab `load ≥
heavyThreshold`.

### 4. Group grid, group card, tab row (the home surface)

**File**: `src/lib/components/Labels/Labels.jsx`, `Labels.css`

Restyle the grid to `grid-template-columns: repeat(auto-fill, minmax(270px,1fr));
gap:18px` (replacing the `matchMedia` chunked-row layout; keep the DnD `Droppable`
wiring — reorder still works, just over a CSS-grid layout). Add the **First-run /
Populated** demo toggle and a transient flash message slot in the home header, plus
the **+ Add group** button. First-run state: centered empty hero (logo mark, "No
groups yet", guidance, "Add your first group"); gauge reads "Idle"; rail shows
onboarding copy.

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`, `.css`

Restyle to the group card: `--c-card`, radius 16, hairline; a **colored header**
(collapse chevron, name Sans 14/600 white ellipsis, mono count badge on
`rgba(0,0,0,.18)`, `⋮` menu) over tab rows. Wire the existing collapse state and the
`⋮` menu (edit → URL details, delete) to the new look. Group color = one of the 9
hues.

**File**: `src/lib/components/Url/Url.jsx`, `Url.css`

Make the row a **fixed 38px height** so the hover swap causes no layout shift:
favicon (14px, left) + title (`--c-t2`, 13/400, single-line ellipsis, full title+URL
in the native `title` tooltip) + a right slot that shows the **load bar by default**
and **swaps to pin / edit / close on row hover** (`.tc-acts` hidden→shown, load bar
hides). Replace `@ant-design/icons` imports with the new inline-SVG `Icon` set. Pin
shows a lime pin glyph when pinned (`tabCommandPinned`). Hover action colors: open
`--c-blue`, close `#ef6f6f`, restore `#9bd35a`, pin `#c7f04a`. Keep all existing
handlers (`handleClose`, `pin`, `editUrl`, `handleClick`, `handleRemove`) and the
`summarizeProcessLoad` load-bar math; only the markup/CSS change. Favicon: prefer the
real tab favicon with a globe-glyph fallback (keep `defaultFavicon` fallback).

**New file**: `src/lib/components/Icon/Icon.jsx` (+ index) — inline-SVG Lucide-style
icons (search, sun, moon, history, info, import/export, pin, pencil/edit, copy,
check, close, restore, chevrons). 1.9px stroke, `currentColor`, round joins.
Typographic glyphs (`← × ↺ ↻ → ⋮ ▾ ▸`) stay as text.

### 5. Browser Load gauge (two-ring) + review-mode loop

**File**: `src/lib/components/LoadMeter/LoadMeter.jsx`, `LoadMeter.css`

Rebuild as two concentric SVG rings in a 200×200 box, group rotated `-90deg`:
- **Outer CPU**: `r=84`, `stroke-width=9`, round caps, track `--c-track`, progress
  colored by CPU's load level (green/amber/red vs `warnAt`), `stroke-dashoffset`
  animates `.6s`.
- **Inner Memory**: `r=66`, `stroke-width=9`, track `--c-track`, progress `--c-blue`.
- Center: "Browser Load" caption (`--c-t3`) above overall **load %** (mono 26/600,
  colored by `max(cpu,mem)` level). First-run: rings on track, "Idle".
- Legend: `■ CPU NN%` (load color) + `■ Mem NN%` (`--c-blue`).
- `dasharray = 2πr`; `dashoffset = circ × (1 − value)`.

Keep reading `processTotals` and the `deriveGaugeTotals` / `deriveSystemTotals`
math; drop the `gradient-path` rendering path. Update `LoadMeterCaption` styling.

**Review-mode + close-heavy → gauge-drop loop**: when the Triage CTA fires, the
Heaviest-Tabs rail section highlights (red inset bar + tint) and the CTA flips to
"Done reviewing". Closing a heavy tab from that list closes it **and drops the gauge
live** (CPU −`load×0.5`, Mem −`load×0.42`) so the "close something → load falls →
back to green" loop is visible. Share review-mode state between `Triage` and `Tabs`
(rail) — lift it to `App` or a small shared store-key; persisting to storage is
fine and consistent with the rest of the app.

### 6. Right rail (Home) — Heaviest Tabs / Active / Auto-closed / History footer

**File**: `src/lib/components/Tabs/Tabs.jsx`, `Tabs.css`

The `Tabs` component already renders Active / Automatically Closed / History
sections — restyle them and **add a new top section "Heaviest Tabs"**: tabs with
per-tab `load ≥ heavyThreshold`, sorted desc; each row = group-color dot + title +
load bar + `NN% · ≈NNN MB` + close button; **highlighted while review mode is
active**. Active Tabs (ungrouped): hollow-gray "ungrouped" dot, title, load bar ↔
hover actions, "Drag onto a group to file it." Automatically Closed: dimmed rows,
group-color dot, idle caption, restore ↺ / forget ×. History footer: pinned button
→ History page. Keep the existing derivation logic (`ungroupedTabUrls`,
`autoClosedTabUrlLabels`, `allUrls`) and DnD source wiring.

### 7. Secondary views

**File**: `src/lib/pages/Load/Load.jsx`, `Load.css`

Back link + **Load** H1 + a **Processes / Chrome fallback** segmented toggle.
Per-tab cards `grid auto-fill minmax(300px,1fr)`: real favicon (~20px, no tile),
title, CPU bar + `CPU N%` / `Memory NM`. Chrome-fallback variant: info banner (per-tab
stats need Chrome Dev `chrome.processes`), cards hide bars, gauge caption →
"Whole-browser load" (drive from existing `loadDataSource` marker + `LoadPerTabNote`).
Restyle `LoadProcesses` (340px Processes rail): per-process `PID`, name, CPU bar
(`--c-blue`), Private-Memory bar (`#b48ead`). Restyle `LoadUrl` per-tab card.

**File**: `src/lib/pages/UrlDetails/UrlDetails.jsx`, `.css`

Back link + tab title H1, then the form: **Title**, **Url** (mono), **Favicon**
(mono), **Notes** (mono textarea), **Groups** (removable color-dot chips via
`UrlLabel`; empty state "Not in any group yet."), **Save / Cancel**. Keep
`urlDetails.js` logic and `UrlField`/`UrlLabel`.

**File**: `src/lib/pages/ImportExport/ImportExport.jsx`, `.css`

Back link + **Import / Export** H1 + recovery intro. Import groups: paste textarea +
Import button. Export groups: **Current** (read-only JSON) + **Previous (most recent
first)** snapshots from `previousLabels`, each a read-only field with a **Copy**
button (clipboard write → flips to green "Copied ✓" ~1.6s). Keep `importExport.js`.

**New file**: `src/lib/pages/History/History.jsx` (+ `History.css`, `index.js`);
export from `src/lib/pages/index.js`

Back link + **History** H1 + "nothing is ever lost" intro. Closed/visited tabs
(from `allUrls` + `autoClosed` timestamps) grouped by **Today / Yesterday / Earlier
this week**; each row: group-color dot, favicon, title (full title+URL tooltip),
mono timestamp, **↻ Reopen** button (reuse `Url`'s reopen/create handler). Wire the
`HISTORY` route added in step 1.

### 8. Add-group inline form (swatches + custom color picker)

**File**: `src/lib/components/LabelForm/LabelForm.jsx`, `.css` and
`src/lib/components/LabelFormContainer/LabelFormContainer.jsx`, `.css`

Restyle into the inline Add-group card at the top of the grid when adding: neutral
header, a **color dot + bordered name input** (good contrast), a **"Pick a color"**
row of the 9 group swatches **plus a custom-color picker** (rainbow swatch wrapping a
native `<input type=color>`), and **Create group / Cancel**. Create prepends a new
empty group in the chosen/custom color (keep the existing create/edit logic and the
`title.length % Colors.length` auto-pick as a fallback).

### 9. Settings (warnAt / heavyThreshold)

**File**: a small settings affordance reachable from the sidebar (e.g. a gear by the
theme toggle, or a section in the gauge area)

Two sliders persisted to the `settings` storage key: `warnAt` (default 70, 50–95
step 5; medium band begins at `warnAt × 0.6`) and `heavyThreshold` (default 60,
40–90 step 5). These feed the gauge red state, the Triage copy/count, and the
Heaviest-Tabs filter. Per-tab bar colors keep fixed cutoffs (`<40` green / `40–69`
amber / `≥70` red) in `processLoad.js` + CSS.

### 10. Confirm behaviors + re-capture scenarios

- Verify `@hello-pangea/dnd` still moves a tab between groups and an ungrouped tab
  onto a group with the new 38px rows / grid layout (handlers + `dragReducer.js`
  unchanged).
- Verify `minisearch` search still filters across groups + ungrouped with the new
  sidebar input (empty groups hide; header label → "Filtering · N groups").
- Re-capture `.codeyam/scenarios/*` so all states reflect the new look (home-empty /
  -grouped / -overflowing / -unorganized, load-*, labelform-*, search-*, etc.), and
  add captures for the new surfaces (triage hot/busy/comfortable, heaviest-tabs,
  add-group form, history page, both themes).
- Run `npm test` + `npm run lint`; update component tests whose markup/queries
  changed (most `*.test.jsx` assert data binding, not exact classNames, but the icon
  swap and row restructure will touch some).

## Reused existing code

- `Chrome.get/set/remove` from `src/lib/utils/Chrome/Chrome.js` (glossary: `Chrome`)
  — all storage I/O, plus new `theme`/`settings` keys.
- `createChromeShim` / `KNOWN_KEYS` from `src/lib/utils/chromeShim/chromeShim.js`
  (glossary: `createChromeShim`, `installChromeShim`) — register new keys.
- `applyDrag` from `src/lib/utils/dragReducer.js` (glossary: `applyDrag`) — DnD
  transform, unchanged.
- `MiniSearch` wiring: `buildSearchDocuments` / `buildUrlDocuments`
  (`src/lib/utils/buildSearchDocuments.js`), `segmentSearchResults`
  (`src/lib/utils/segmentSearchResults.js`), `searchNotesSnippet` — unchanged.
- Gauge math: `deriveGaugeTotals` (`src/lib/utils/deriveGaugeTotals.js`),
  `gaugeFillPercent` (`src/lib/utils/gaugeFillPercent.js`), `deriveSystemTotals`
  (`src/lib/utils/deriveSystemTotals.js`) — kept; only rendering changes.
- `summarizeProcessLoad` from `src/lib/utils/processLoad.js` (glossary:
  `summarizeProcessLoad`) — per-tab load level/width for rows + heavy-tab filter.
- `humanReadableNumber` (`src/lib/utils/humanReadableNumber.js`) — memory formatting
  on Load / Heaviest-Tabs.
- URL form logic: `deriveUrlLabels`, `buildUrlInfo`, `removeUrlFromLabel`
  (`src/lib/utils/urlDetails.js`) — UrlDetails, unchanged.
- Import/Export logic: `buildImportUpdates`, `resolveLabelUrls`, `sortLabels`
  (`src/lib/utils/importExport.js`) — IO page, unchanged.
- Existing components reused as the redesign's surfaces: `Url` (tab row),
  `Tabs` (right rail), `Labels`/`LabelCollection` (group grid + card),
  `LabelForm`/`LabelFormContainer` (Add-group form), `Search`/`SearchResults`,
  `LoadProcesses`/`LoadUrl`/`LoadPerTabNote`, `UrlField`/`UrlLabel`.

## Scenarios to Demonstrate

- **Home · Populated · dark** — several colored groups in the grid, gauge mid-load
  ("Getting busy" amber triage, no CTA), right rail with Active + Auto-closed.
- **Home · First run · dark** — empty hero, "No groups yet", gauge "Idle", rail
  onboarding copy.
- **Home · Running hot** — gauge red (load ≥ warnAt), red Triage with "Review N
  heavy tabs" CTA, Heaviest-Tabs populated; then **review mode** active (rail
  highlighted, CTA "Done reviewing").
- **Close-heavy loop** — close a heavy tab and show the gauge dropping back toward
  green.
- **Light theme** — the same Home with `data-theme="light"` (logo "command" goes
  dark-gray, `#fafafa` canvas).
- **Add-group form open** — inline card with the 9 swatches + custom color picker.
- **Load page · Processes** and **Load page · Chrome fallback** (info banner, bars
  hidden).
- **URL details** — a saved tab with notes + group chips, and the empty "Not in any
  group yet." state.
- **Import / Export** — current JSON + previous snapshots, a Copy button mid-"Copied ✓".
- **History page** — closed/visited tabs grouped Today / Yesterday / Earlier this
  week with Reopen.
- **Search active** — filtering across groups + ungrouped, header "Filtering · N
  groups", empty groups hidden.
