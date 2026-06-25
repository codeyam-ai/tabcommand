# TabCommand

[![CI](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml/badge.svg)](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Command Central for your browsing experience** — a Manifest V3 Chrome extension that
monitors, searches, labels (groups), and auto-closes your browser tabs. The rich UI is a
full-page React app; the toolbar popup is just a launcher that opens it in a pinned tab.
All state lives in `chrome.storage.local` — there's no backend.

This repo is unusual in one deliberate way: **every UI state is captured as a
[codeyam](https://codeyam.com) scenario with a screenshot, and the whole app is
explorable — live — without installing anything.** You can see how TabCommand behaves in
40+ seeded states, then make changes through a workflow that keeps tests, a code glossary,
and those scenarios in sync.

<p align="center">
  <img src=".codeyam/scenarios/screenshots/labels-populated--desktop.png" alt="TabCommand showing colorful labeled tab groups" width="100%">
</p>

<p align="center">
  <img src=".codeyam/scenarios/screenshots/home-grouped--desktop.png" alt="Home view with tabs organized into groups" width="49%">
  &nbsp;
  <img src=".codeyam/scenarios/screenshots/load-meter-high--desktop.png" alt="Per-tab load gauge under heavy tab load" width="49%">
</p>

## Quick start

Prerequisites: **Node 22+** and npm.

```bash
npm install
npm run dev      # Vite dev server on http://localhost:3000
```

The app runs in a normal browser tab — no extension install required. An in-app **chrome
shim** (`src/lib/utils/chromeShim/`) stands in for the extension APIs and hydrates
`chrome.storage.local` from `window.localStorage`, so the UI renders and works against
seeded data.

To run it as a real extension:

```bash
npm run build    # outputs an unpacked MV3 extension to build/
```

Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `build/`.

```bash
npm test         # Vitest + React Testing Library
npm run lint     # ESLint 9 (flat config)
```

## See how TabCommand works

**Two ways, no Chrome required:**

**1. Browse the scenarios in this repo.** Each file in `.codeyam/scenarios/*.json` defines
a seeded app state, with a matching screenshot under `.codeyam/scenarios/screenshots/`.
There are 40+ — both *application* scenarios (whole pages, e.g. `home-empty`, `home-grouped`,
`labels-populated`) and *component* scenarios (isolated pieces, e.g. `labelform-reading`,
`load-meter-high`). A scenario seeds `localStorage`, so the exact state is reproducible and
version-controlled.

**2. Open it live in [codeyam-editor](https://codeyam.com).** The editor renders every
scenario in a live preview against the mocked chrome environment — empty, populated,
mid-search, with load gauges high or low — so you can click through the whole app's
behavior without ever loading it into Chrome.

```bash
npm install -g @codeyam-editor/codeyam-editor@latest
codeyam-editor start      # opens the browser UI: scenario list + live preview
```

## How the mock environment works

TabCommand has no database — all state is `chrome.storage.local`. In the dev server and in
codeyam previews there is no extension `chrome` object, so the in-app shim installs onto
`globalThis.chrome` **only when the real API is absent**, implementing `storage.local`,
`storage.onChanged`, and no-op `tabs`/`tabGroups`/`processes` stubs. On boot it hydrates an
in-memory store from every `window.localStorage` key. That single mechanism is what lets the
same React code run as a real extension, in a plain browser, and in deterministic scenario
captures.

## Making changes (keeping tests, glossary & scenarios in sync)

This project is built through the codeyam-editor plan workflow rather than hand-edited in
place:

- **Glossary** — `.codeyam/glossary.json` maps every component, page, and utility to its
  source file, its test file, and the scenarios it appears in. It's the index that ties code
  to its visual states.
- **Scenario taxonomy** — `.codeyam/state/scenario-taxonomy.json` tracks which UX states
  (empty / typical / many / loading / error) each view covers, and records *why* a state is
  N/A when it is.
- **The loop** — write a plan in `.codeyam/plans/`, let the editor drive the build; tests run
  on every change, scenarios re-capture, and an audit step flags any component that loses test
  or scenario coverage.

You don't *have* to use the editor to contribute — `npm run dev` / `npm test` /
`npm run lint` work standalone — but the codeyam loop is what keeps the screenshots, tests,
and glossary honest.

## Permissions

TabCommand requests only what it needs to monitor and organize your tabs, and everything
stays on your machine:

| Permission | Why it's needed |
|------------|-----------------|
| `tabs` | Read tab titles and URLs to list, search, and label your open tabs |
| `tabGroups` | Create and keep Chrome tab groups in sync with your labels |
| `storage` | Persist your tabs, labels, and settings in `chrome.storage.local` |
| `processes` | Show per-tab CPU, memory, and network load in the meter |

## Tech stack

Vite 5 · React 18 · `@crxjs/vite-plugin` (MV3) · `@hello-pangea/dnd` (drag & drop) ·
`minisearch` (search) · `gradient-path` (the load gauge) · Vitest + React Testing Library ·
ESLint 9 flat config.

## License

[MIT](./LICENSE) © 2026 NodLabs Inc.
