---
title: "Scenarios & seeding — round out the captured-state catalog"
mode: frontend
createdAt: "2026-06-12T00:00:00Z"
source: manual
---

## Summary

Capstone (ninth) plan in the modern TabCommand reproduction. After every page exists
(`Home`/`Labels`, `Load`, `UrlDetails`, `ImportExport`, and `Search`), this plan makes
the **scenario catalog complete and coherent**: every notable app state is a seeded,
captured codeyam scenario; seed shapes are normalized; and redundant scenarios are
retired. It is mostly **scenario curation + seed normalization** — little or no app
source changes. Run it **last**, once the remaining feature plans (`search`,
`url-details`, `import-export`) have landed.

## Guiding principle (established 2026-06-12, commit `73ecd86`)

**Each scenario varies the main content; keep at most one intentionally-empty center.**
The earlier Home set had four scenarios painting the identical empty "Add Group"
placeholder, differing only in the right rail — they were consolidated 7 → 5. Apply the
same lens to every page: a scenario earns its place by showing a *distinct, meaningful*
state, not a re-skin of another.

## Current catalog (at drafting, 8 scenarios)

- **Home:** `home-empty` (First Run), `home-unorganized`, `home-grouped`
- **Labels:** `labels-populated`, `labels-selected`
- **Load:** `load-meter-high`, `load-meter-low` (sidebar gauge), `load-page`

Missing at drafting (added by their feature plans, verified/rounded-out here):
`UrlDetails` (`url-details`), `ImportExport` (`import-export`), `Search` (`search`).

## Coverage target — one+ scenario per page × meaningful state

| Page / view | States to ensure captured |
|---|---|
| Home (`App`) | first-run empty · unorganized (loaded rail, no groups) |
| Labels (Home center) | a few groups · fully organized (many) · a group selected/expanded |
| Load (`Pages.LOAD`) | gauge low vs high · the Load page (per-process breakdown) |
| UrlDetails (`Pages.URL`) | edit form populated **with notes + group chips** (a no-notes variant optional) |
| ImportExport (`Pages.IMPORTEXPORT`) | Export populated + ≥1 Previous snapshot |
| Search (`search`, if landed) | results showing for a query (see preview note) |

Drive the gap analysis with the editor's own tools rather than by eye:
`codeyam-editor editor scenario-coverage` (freshness), `scenario-matrix`
(per-branch visual states a page leaves undemonstrated),
`visual-components-without-coverage`, and `scenario-review` (duplicate / obsolete /
stale candidates). `scenario-review` flags; this plan decides and acts.

## Seed normalization (one pass over every scenario)

- **Labels** use `backgroundColor` / `position` / `urlKeys` — never the legacy `color`
  (the `labels-and-dnd` migration). Audit all label-bearing seeds.
- **Per-URL objects** are `{ title, favicon, notes?, processes }` and **add `url`** wherever
  an `ImportExport` export must serialize it (see `import-export` plan's seed nuance).
- `allUrls` is an ordered **array of `urlKey` strings**; `activeTabs` rows carry unique
  `tabKey`s; `autoClosed` is a `{ urlKey: closedMs }` map; `uxSettings.page` drives which
  page a scenario lands on; `uxSettings.selectedLabel` drives the selected group.
- All scenarios register with the **top-level `localStorage` shape** (pre-stringified
  values) — a `seed:{}` block hits the DB "array of row objects" validator and rejects
  map-shaped keys (`labels`/`autoClosed`/per-URL objects). See MODERNIZATION.md.

## Key Decisions

- **Retire, don't accumulate.** Where two scenarios show an equivalent main-content state,
  merge or delete (`editor delete <slug>`) rather than keep both — the way
  `home-active-tabs`/`home-auto-closed-and-history`/`labels-empty` folded into
  `home-unorganized`.
- **Normalize names to a per-page scheme** for a scannable catalog (e.g. `Home - …`,
  `Labels - …`, `Load - …`, `Url - …`, `Import/Export - …`). Renames are delete + re-register
  (re-capture); only do it where it improves clarity, not churn for its own sake.
- **No seeded-empty dodges.** If a state renders blank, fix the seed shape — never delete a
  scenario to hide a blank capture (see MODERNIZATION.md conventions).

## Implementation

1. Run `scenario-coverage` + `scenario-matrix` + `visual-components-without-coverage` and
   record the gap list per the coverage table above.
2. Register the missing page scenarios (UrlDetails edit, ImportExport export+previous,
   Search results) and any missing meaningful states; capture each.
3. Normalize seed shapes across all existing scenarios (re-register + re-capture any that
   change). Run `recapture-stale` to refresh drifted screenshots.
4. Run `scenario-review`; consolidate/retire duplicates and obsolete captures.
5. Update MODERNIZATION.md's "Scenario catalog (current)" to the final set.

## Verification

1. `npm test` green; `npm run lint` clean; `editor verify-build` green.
2. `scenario-coverage` → **N fresh, 0 stale, 0 missing**.
3. `visual-components-without-coverage` is empty (or each exception is a recorded,
   justified decision via the scenario-taxonomy/`demo-skip` path — no silent gaps).
4. Every page in the coverage table has ≥1 captured scenario; spot-check each screenshot
   against `../tabcommand/` for fidelity.

## Preview limits

- **Search** is a sidebar overlay driven by typing, not a route. Its results state may not
  be reachable by pure seeding (depends on how `search` wires query state — `uxSettings`
  vs. local). If it can't be seeded, capture it with `editor preview-interact` /
  `preview-flow` (type a query → capture) rather than forcing a synthetic seed, and note
  the interaction-driven capture in the scenario.
- `confirm`/`alert` flows (delete group, remove URL, share) and the ImportExport
  bad-JSON path are interaction-time only — never part of a seeded capture.
- `Closer` auto-close + `service_worker.js` stay deferred (runtime, not UI); scenarios seed
  `autoClosed` / `processTotals` directly instead of running the engine.
