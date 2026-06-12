# TabCommand — Modernization & codeyam-editor Migration

This repository is a **ground-up modern reproduction** of TabCommand, driven through
the **codeyam-editor** plan workflow. This doc explains what we're doing, how the
pieces fit, and how to continue. If you're an AI or developer picking this up, read
this top to bottom first.

---

## What TabCommand is

A **Manifest V3 Chrome extension** — "Command Central for your browsing experience":
it monitors, searches, labels (groups), and auto-closes browser tabs. The rich UI is
a full-page React app (the toolbar popup is just a launcher that opens it in a pinned
tab). All app state lives in `chrome.storage.local`.

The original (2022) is built with Create React App / `react-scripts` 4 / React 17 and
only runs under Node's `--openssl-legacy-provider` shim. It is **untouched** and serves
as the reference spec (see Layout).

## Goal

Reproduce TabCommand faithfully on a modern stack, **and** make every app state
viewable as a codeyam scenario. We do *not* hand-migrate the old code in place — we
rebuild it fresh, one codeyam plan at a time, using the 2022 code as the spec.

## Layout (one git repo, two worktrees)

| Path | Branch | Role |
|---|---|---|
| `../tabcommand` | `main` | **Reference spec** — the untouched 2022 code. Read it; never edit it. |
| `.` (this dir, `tabcommand-modern`) | `modern` | **The rebuild.** Point codeyam-editor here. |

If this worktree folder is ever deleted, recreate it from `../tabcommand`:
```
cd ../tabcommand && git worktree prune && git worktree add ../tabcommand-modern modern
```
The `modern` branch is the source of truth; the folder is disposable.

## Modern stack

- **Build:** Vite 5 + `@vitejs/plugin-react` + `@crxjs/vite-plugin` (MV3; builds a
  Chrome-loadable bundle to `build/`). No CRA, no `--openssl-legacy-provider`.
- **Runtime:** React 18 (`createRoot`).
- **Drag & drop:** `@hello-pangea/dnd` (maintained drop-in for the original's
  unmaintained `react-beautiful-dnd`; same API).
- **Tests:** Vitest + React Testing Library (enzyme has no React-18 adapter).
- **Lint:** ESLint 9 flat config (`eslint.config.mjs`).
- Search uses `minisearch`; the LoadMeter gauge uses `gradient-path`.

## How codeyam seeding works here (the important part)

TabCommand has no database — state is `chrome.storage.local`. In the codeyam preview
(and the plain-browser dev server) there is no extension `chrome` object, so:

1. **App side:** an in-app **chrome shim** (`src/lib/utils/chromeShim/`) installs onto
   `globalThis.chrome` *only when the real extension `chrome` is absent*. It implements
   `storage.local` (get/set/remove, callback + multi-key), `storage.onChanged`, and
   no-op `tabs`/`tabGroups`/`processes` stubs. **On boot it hydrates an in-memory store
   from every `window.localStorage` key** (parsing JSON).
2. **Seed side:** the project is the codeyam **`chrome-extension-react` stack**
   (`.codeyam/stack.json`) with the **`localStorage` seed adapter**
   (`.codeyam/seed-adapter.ts`). It transforms a scenario's `seed: {...}` into
   `{ localStorage: { key: JSON.stringify(value) } }`, which codeyam injects (via
   `browserState.localStorage` / Playwright) **before app JS runs**.
3. So: **scenario `seed` → localStorage → chrome shim → `Chrome.get` → React render.**
   Each app state is one seeded scenario. Proven end-to-end (the `seeded-storage-smoke`
   scenario renders live counts).

The `Chrome` abstraction (`src/lib/utils/Chrome/`) is the callback-based wrapper every
component reads through (`Chrome.get(ctx, keys, cb)` / `set` / `remove`), with
default-hydration (`labels`/`uxSettings`/`autoClosed` → `{}`;
`activeTabs`/`allUrls`/`previousLabels` → `[]`).

## Data model (load-bearing — seeds and components both depend on these shapes)

`chrome.storage.local` keys:

- **`allUrls`** — ordered **array of `urlKey` strings** (NOT a map).
- **`urlKey`** — the string `"url-" + <actual URL>`.
- **per-URL object** — each URL is its **own top-level key** equal to its `urlKey`:
  `{ title, favicon, notes?, processes: { samples, network, cpu, privateMemory, jsMemoryAllocated, jsMemoryUsed } }`.
- **`activeTabs`** — `[{ urlKey, tabKey: "tab-<id>", pinned, tabCommandPinned, groupId? }]`.
  `pinned` (browser-pinned) tabs are filtered out of the active list.
- **`labels`** — map keyed by title → `{ title, backgroundColor, position, urlKeys: [] }`.
  **Note `backgroundColor`, not `color`.** Selection is `uxSettings.selectedLabel` (a title).
- **`autoClosed`** — map `{ [urlKey]: closedTimestampMs, maxTime? }`.
- **`uxSettings`** — `{ page: { name, urlKey? }, selectedLabel? }`. Drives navigation.
- **`previousLabels`** — array (label-name autocomplete).
- **`processTotals`** — `{ cpu, privateMemory, jsMemoryUsed }` (LoadMeter gauge).

Constants (`src/Constants.jsx`): `Pages` = `{ HOME, URL, IMPORTEXPORT, LOAD }`;
`ItemTypes` = `{ URL, LABEL_COLLECTION }`; `Colors[]`; `MaxAutoClosedTime`.
Process load math (Url indicator): averages over `samples`; thresholds
excessive/high/medium/low on cpu (54/36/18) and mem-MB (600/400/200).

## Plan-by-plan status

Plans live in `.codeyam/plans/` (queued) and `.codeyam/plans/completed/` (done). Each
cites the reference files in `../tabcommand/` it reproduces.

**Done:**
1. `foundation-vite-react18-mv3` — Vite+React18+crxjs MV3 shell, Vitest+RTL, empty App shell. ✅
2. `chrome-storage-layer` — `Chrome` abstraction + chrome shim + localStorage seed adapter; seed pipeline proven. ✅
3. `home-and-tabs` — `Tabs` (Active/Auto-Closed/History) + `Url` row, real App navigation, `@hello-pangea/dnd` context; stubbed Search/LoadMeter/Labels. ✅ (Home tab rail renders real seeded data.)
4. `labels-and-dnd` — `Labels`/`LabelCollection`/`LabelForm`/`LabelFormContainer` + the real `onDragEnd` (URL move between groups, label reorder). Removed the Labels stub; fills the Home center. Label scenarios seed `backgroundColor`/`position`/`urlKeys`. ✅ (Home center renders real groups.)
5. `load-meter` — `LoadMeter` gradient gauge (sidebar) + `Load` page + per-process breakdown; `processTotals` key. ✅ (Scenarios `load-meter-low`/`load-meter-high`/`load-page`.)

**Queued (drafted, awaiting execution):**
6. `search` — `Search` + `SearchResults` (minisearch) + ports `KeyDown`/`event` utils. (Search is still a stub.)
7. `url-details` — the `UrlDetails` page (`Pages.URL`): edit/annotate a URL (title/url/favicon/**notes** + group chips). Navigation already exists (`Url.editUrl`).
8. `import-export` — the `ImportExport` page (`Pages.IMPORTEXPORT`): export groups to JSON + Previous snapshots; import/restore from pasted JSON.
9. `scenarios-and-seeding` — capstone: round out the scenario catalog so every notable
   app state is captured; normalize seed shapes; retire redundant captures.

### Scenario catalog (current)

Consolidated 2026-06-12 from 7 → 5 Home/Labels scenarios. The prior set had **four**
scenarios painting the identical empty "Click the Add Group icon…" placeholder across
the whole (largest) center region, differing only in the right rail. The curation
principle: **each scenario varies the main (center) content**; keep at most one
intentionally-empty center.

- `home-empty` — **First Run.** Everything empty; the canonical onboarding state (empty-state copy in every region).
- `home-unorganized` — **Unorganized.** Loaded rail (6 ungrouped active tabs w/ load bars + 2 auto-closed + collapsed history), no groups yet → the realistic "organize me" state. *(Merged the old `home-active-tabs` + `home-auto-closed-and-history` + `labels-empty`.)*
- `home-grouped` — **Grouped.** 2 groups (Work, Reading); first-organized state.
- `labels-populated` — **Fully Organized.** 4 colorful groups (Work/Reading/Shopping/Social).
- `labels-selected` — **Group Selected.** 4 groups, one expanded with pin/edit/delete row actions (`uxSettings.selectedLabel`).
- `load-meter-low` / `load-meter-high` — **Sidebar gauge,** low vs. high `processTotals`.
- `load-page` — the **Load page** (`Pages.LOAD`): per-process breakdown.

The `url-details`, `import-export`, and `search` plans each add their page scenario; the
`scenarios-and-seeding` capstone then rounds out + normalizes + dedups the whole set.

Re-author scenarios via `codeyam-editor editor register @<file>` with a top-level
`localStorage` map of **pre-stringified** values (the localStorage stack — a `seed:{}`
block hits the DB "array of row objects" validator and rejects map-shaped keys like
`labels`/`autoClosed`). `delete <slug>` removes a scenario + its screenshot.

## Conventions for this rebuild

- **Plans drive code; don't hand-implement the app.** Write `.codeyam/plans/<slug>.md`;
  the codeyam editor workflow executes them. (Exception: small shim/seed corrections a
  plan calls out.)
- **Faithful reproduction, but drop dead code.** e.g. the original `Tab` component is
  dead (only its own test referenced it) — excluded. Verify a component is actually
  used before porting.
- **Get the seed shapes right** (see Data model). Wrong shapes render blank UI.
- **Verify every landing** before drafting the next plan: `npm test`, `npm run lint`,
  `npm run build` (exit 0), and look at the captured screenshots — don't trust the file
  tree alone.
- **Deferred (runtime, not UI; irrelevant to seeded scenarios):** the `Closer`
  auto-close engine and `public/service_worker.js` (the real write-side; preview seeds
  storage directly). Ported verbatim where present; not modernized.
- **Known follow-up:** `@crxjs` drops the classic `popup.js` from `build/` — the popup
  *launcher* would break in the packaged extension (irrelevant to codeyam captures).
  Fix = make `popup.js` an ES module. Not yet planned.

## Driving the editor

Point codeyam-editor at this directory (`tabcommand-modern/`). It consumes the
`.codeyam/plans/` queue one plan at a time, builds the code, runs tests, and captures
scenarios. The reference is always at `../tabcommand/`.

## Resuming in a new session

See the handoff prompt at the bottom of this doc (kept in sync with progress).

---

### Handoff prompt (for a fresh AI session)

> I'm continuing a plan-driven modern reproduction of the TabCommand Chrome extension
> via codeyam-editor. **Read `/Users/jaredcosulich/workspace/tabcommand-modern/MODERNIZATION.md`
> first** — it explains the whole setup. The rebuild lives at
> `/Users/jaredcosulich/workspace/tabcommand-modern` (branch `modern`); the untouched
> 2022 reference is at `/Users/jaredcosulich/workspace/tabcommand` (branch `main`).
>
> Plans `labels-and-dnd`, `search`, and `load-meter` have now been executed. Please:
> 1. **Verify they landed cleanly** — in `tabcommand-modern/`: `npm test`, `npm run lint`,
>    `npm run build` (expect exit 0), and look at the new `.codeyam/scenarios/screenshots/`
>    to confirm Labels/Search/LoadMeter render faithfully vs. the reference. Report how it went.
> 2. **Draft the remaining plans** into `.codeyam/plans/`, one well-scoped `.md` each,
>    citing the reference files in `../tabcommand/src/`: `url-details` (the `UrlDetails`
>    page / `Pages.URL`, edit + `notes`), `import-export` (the `ImportExport` page), and
>    finally `scenarios-and-seeding` (round out the captured-state catalog). Read the
>    reference component before writing each plan; get the seed data shapes right (see
>    MODERNIZATION.md "Data model"); exclude dead code; note any preview limits.
> 3. **Do not implement the app yourself** — you write plans; the codeyam editor workflow
>    executes them. Commit each plan as a `plan:` commit on `modern`. Don't push.
>
> Work through them the same way the doc describes: verify each landing before drafting
> the next, keep plans faithful to the reference, and update MODERNIZATION.md's status
> as you go.
