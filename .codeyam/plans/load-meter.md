---
title: "LoadMeter gauge + Load page"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

Sixth plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`). Builds the sidebar **LoadMeter** — the circular CPU/memory gauge —
and the **Load** page it links to. Removes the `LoadMeter` sidebar stub and replaces
the `LOAD` page placeholder with the real page.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| Circular gauge | `../tabcommand/src/lib/components/LoadMeter/LoadMeter.jsx` (+ `.css`) | Full port; remove stub |
| Load page | `../tabcommand/src/lib/pages/Load/Load.jsx` (+ `.css`) | Full port; replace placeholder |
| Pages barrel | `../tabcommand/src/lib/pages/index.js` | Add `Load` export |

## Data model

- **New storage key `processTotals`** = `{ cpu: number, privateMemory: number,
  jsMemoryUsed: number }`. `LoadMeter` reads it and fills two arcs:
  `cpu` against `max.cpu = 150` (base 0) and `memory = privateMemory + jsMemoryUsed`
  against `max.memory = 5GiB` (base 500MiB). (No default needed — the shim hydrates all
  localStorage keys after the home-and-tabs fix.)
- The **Load page** reads `activeTabs` → per-URL objects for its URL list, and subscribes
  to `chrome.processes.onUpdatedWithMemory` for the raw per-process table. In preview the
  `chrome.processes` shim is a no-op, so the raw table is empty and the URL list renders
  from seeded storage (see Key Decisions).

## Key Decisions

- **`gradient-path` gauge: reproduce, but verify visually via capture, not jsdom.**
  `LoadMeter` uses `GradientPath` to render an SVG arc and then mutates per-segment
  `fill`/`stroke` to show the filled fraction. This is real-DOM/SVG work that jsdom can't
  meaningfully render. Port it faithfully (it's the distinctive sidebar visual), but keep
  **unit tests on the data binding** (reads `processTotals`, computes the fill percent),
  and rely on the **codeyam screenshot** for the visual. Guard any
  `document.querySelector('#cpu path')` access so a missing node (jsdom) no-ops instead
  of throwing.

- **Load page's raw process table is preview-empty by design.** The per-process rows come
  from the live `chrome.processes` API, which doesn't exist outside a packaged extension
  and isn't storage-backed — so it can't be seeded. The page's **URL list** (from
  `activeTabs` + per-URL objects) is seedable and is what the capture shows. Note this in
  the scenario rather than faking process rows. (A future enhancement could let the shim's
  `processes.onUpdatedWithMemory` emit seeded sample data; out of scope here.)

- **`processTotals` is seed-only in preview.** In the real extension the service worker
  writes it; in preview each scenario seeds it directly to drive the gauge to a chosen
  level. This is the same pattern as the rest of the app's state.

## Implementation

1. **`LoadMeter`**: full port (svg gauge, `processTotals` read + `onChanged`, gradient
   segment fill). Guard DOM lookups for jsdom. Replace stub; re-export from the barrel.
   Wire the sidebar `<LoadMeter/>` (click → `changePage(LOAD)`, already wired in App).
2. **`Load` page**: full port (home link → `uxSettings.page = HOME`; URL list from
   `activeTabs`/per-URL; raw process table driven by the `chrome.processes` listener —
   empty in preview). Add to `src/lib/pages/index.js`; render on the `LOAD` page in App
   (replacing the placeholder).
3. **Seeds**: `load-meter-low` and `load-meter-high` (different `processTotals` to show
   the gauge fill differ), and a `load-page` scenario (`uxSettings.page = {name: LOAD}`
   + seeded `activeTabs`/URLs so the page's URL list renders). Register + capture.
4. **Tests** (Vitest + RTL):
   - `LoadMeter.test.jsx`: reads `processTotals`; computes the expected fill percent for
     given cpu/memory; updates on `onChanged`. (No assertion on gradient pixels.)
   - `Load.test.jsx`: renders the URL list from seeded `activeTabs`; home link writes
     `uxSettings.page`; tolerates the no-op `chrome.processes` listener.
   - Each `it()` keeps its `//` description.

## Verification

1. `npm test` green; lint clean; `editor verify-build` green.
2. `load-meter-low` vs `load-meter-high` captures show visibly different gauge fills in
   the sidebar.
3. `load-page` capture shows the Load page with its URL list (raw process table empty —
   expected in preview).
4. Dev server: navigating to Load via the gauge works; back-home link works. No `chrome`
   errors (the `processes` listener no-ops cleanly).

## Out of scope

- `UrlDetails` (`url-details`), `ImportExport` (`import-export`). Seeding live
  `chrome.processes` data; `service_worker.js`; the crxjs popup.js build gap.
