---
title: "Hide Load Triage & Settings Without Per-Tab Data"
mode: ui
createdAt: "2026-06-27T21:00:00Z"
source: manual
---

## Summary

On stable Chrome the `chrome.processes` API does not exist, so the service
worker can only record whole-browser load (`loadDataSource: 'system'`) and never
writes per-URL `processes` records. Today the sidebar **Triage** card ignores
this: it still renders "Running hot — **0** heavy tabs are driving load up. Close
a few to bring it back down.", which is both nonsensical (it names zero culprits)
and dishonest (we cannot identify heavy tabs at all). The **Settings** panel has
the same blind spot — it shows per-tab-oriented "Warn at" and "Heavy tab ≥"
sliders that do nothing useful when per-tab data is unavailable. This change makes
the Triage card and the load-related Settings sliders appear **only when we
actually have per-tab data** (`loadDataSource === 'processes'`), and on the Dev
channel suppresses the "Running hot" culprit message whenever no single tab
crosses the heavy threshold (`heavyCount === 0`). It follows the app's existing
"honest degradation" pattern already used by `LoadMeterCaption` and
`LoadPerTabNote`, which both branch on the same `loadDataSource` marker.

## Key Decisions

- **Gate on `loadDataSource === 'processes'`, not on a new flag** — this is the
  canonical marker the service worker already writes (`processes` / `system` /
  `none`), and the two sibling components (`LoadMeterCaption`, `LoadPerTabNote`)
  already read it the same way. Reuse it rather than inventing a parallel signal.
- **Triage hides entirely on `system` / `none` / unknown** — per the user:
  whole-browser load alone isn't actionable without tab-specific detail, so the
  whole card (including the green "Comfortable" / amber "Getting busy" states) is
  suppressed when source is anything other than `processes`. Treat an unknown
  (`null`) source as "hide" so the card never flashes in before we know the
  channel, mirroring how `LoadPerTabNote`/`LoadMeterCaption` treat the marker.
- **On Dev channel, hide the "Running hot" message when `heavyCount === 0`** —
  per the user: if we can't point at a culprit tab, don't show the alarm. The red
  high-load state renders only when `source === 'processes' && heavyCount > 0`.
  The amber/green status states continue to render on the `processes` source
  (they don't claim a culprit), so the card still gives a calm read when load is
  fine.
- **Settings hides BOTH the "Warn at" and "Heavy tab ≥" sliders off the
  `processes` source** — per the user's selection. "Auto-close after" is
  independent of per-tab data and always remains. So on stable Chrome the gear
  opens to just the Auto-close control.
- **Update existing scenarios to pin `loadDataSource: 'processes'`** — the
  current `Triage` and `Settings` scenarios don't set the marker, so after this
  change they would render empty. Adding the marker keeps them demonstrating the
  full-fidelity state, and new scenarios cover the newly-hidden states.
- **No service-worker change needed** — `initLoadSource()` already writes the
  correct `loadDataSource` for every channel; this is purely a consumer-side
  gating change in the UI.

## Implementation

### 1. Gate the Triage card on data source and a non-zero culprit count

**File**: `src/lib/components/Triage/Triage.jsx`

- Add `'loadDataSource'` to the keys read in the `Chrome.get('Triage1', ...)`
  call and store it in component state alongside `load`, `heavyCount`, `warnAt`
  (e.g. add `source` to the `useState` object and set it in `recompute`).
- Extend the `chrome.storage.onChanged` watch so a change to
  `changes.loadDataSource` triggers `read()` (it currently only re-reads on
  `processTotals` / `settings` / `activeTabs`).
- After computing `level`, gate rendering:
  - If `source !== 'processes'` → `return null` (hides the whole card on stable
    Chrome / `none` / before the marker is known).
  - If `level === 'high'` (Running hot) **and** `heavyCount === 0` → `return null`
    (we can't name a culprit, so suppress the alarm message).
  - Otherwise render as today. The existing CTA guard
    (`level === 'high' && heavyCount > 0`) stays; with the new high-state guard it
    is now redundant but harmless — keep it for clarity, or simplify to
    `level === 'high'` since that branch now implies `heavyCount > 0`.
- Update the component's top-of-file doc comment to note it renders only on the
  `processes` source and only in the high state when there is an identifiable
  heavy tab, citing the same rationale as `LoadPerTabNote`.

### 2. Hide the load-related Settings sliders without per-tab data

**File**: `src/lib/components/Settings/Settings.jsx`

- Read `'loadDataSource'` (extend the existing `Chrome.get('Settings1', ...)` —
  it currently only reads `'settings'`; either widen that call or add a second
  read) and track it in state, with a `chrome.storage.onChanged` listener so the
  panel reacts if the marker changes mid-session (match the listener pattern in
  `LoadMeterCaption`/`LoadPerTabNote`).
- Render the **"Warn at"** and **"Heavy tab ≥"** `Settings-row` blocks only when
  `source === 'processes'`. Always render the **"Auto-close after"** row.
- Treat unknown (`null`) source as "hide the two load rows" so they don't flash
  in then disappear.
- Update the component's doc comment to record that the two load sliders are
  Dev-channel-only while Auto-close is universal.

### 3. Keep existing Triage/Settings scenarios rendering

**Files**:
- `.codeyam/scenarios/triage-running-hot.json`
- `.codeyam/scenarios/triage-comfortable.json`
- `.codeyam/scenarios/settings-default.json`
- `.codeyam/scenarios/settings-auto-close-control.json`

Add `"loadDataSource": "processes"` to each scenario's
`browserState.localStorage` so they continue to demonstrate the full-fidelity
state (the Triage card visible, all three Settings sliders visible). Without this
the components would render empty under the new gating.

### 4. New scenarios for the hidden / degraded states

**New files** under `.codeyam/scenarios/`:

- `triage-stable-chrome-hidden.json` — `Triage` isolate with
  `loadDataSource: 'system'`, high `processTotals`, and no per-URL `processes`
  records. Demonstrates the card rendering nothing on stable Chrome.
- `triage-high-no-culprit.json` — `Triage` isolate with
  `loadDataSource: 'processes'`, a high `processTotals` (load ≥ warnAt), active
  tabs whose per-URL `processes` all stay **below** `heavyThreshold` (so
  `heavyCount === 0`). Demonstrates the suppressed "Running hot" message when no
  tab is the culprit.
- `settings-stable-chrome.json` — `Settings` isolate with
  `loadDataSource: 'system'`. Demonstrates only the "Auto-close after" slider
  showing, with "Warn at" and "Heavy tab ≥" hidden.

Model the JSON shape on `triage-running-hot.json` / `settings-default.json`
(same `componentName`, `scenarioType: "component"`, `dimensions: ["Desktop"]`,
fresh `id`).

### 5. Tests

**Files**:
- `src/lib/components/Triage/Triage.test.jsx`
- `src/lib/components/Settings/Settings.test.jsx` (new if absent)

Extend `Triage.test.jsx`: existing cases seed `processTotals` but no
`loadDataSource`, so they must seed `loadDataSource: 'processes'` to keep
asserting the visible states. Add cases:
- `source: 'system'` with high load → card renders nothing (assert the title
  text is absent).
- `source: 'processes'`, high load, `heavyCount === 0` (active tabs with
  sub-threshold per-URL `processes`) → "Running hot" is absent.
- `source: 'processes'`, high load, one heavy tab → "Running hot" + "Review …
  heavy tab" CTA present (the happy path).

Add Settings coverage: with `loadDataSource: 'processes'` all three sliders
render; with `'system'` only "Auto-close after" renders ("Warn at" / "Heavy tab
≥" absent).

## Reused existing code

- `loadDataSource` storage marker written by `initLoadSource` /
  `pollSystemLoad` / `processProcesses` in `service_worker.js` — the canonical
  channel signal this plan gates on. No change to the worker.
- `LoadPerTabNote` from `src/lib/components/LoadPerTabNote/LoadPerTabNote.jsx`
  (glossary entry: `LoadPerTabNote`) — the established pattern for branching UI
  on `loadDataSource`; mirror its read + `onChanged` listener.
- `LoadMeterCaption` from `src/lib/components/LoadMeterCaption/LoadMeterCaption.jsx`
  — second precedent for the same source-aware read.
- `summarizeProcessLoad` from `src/lib/utils/processLoad.js` (glossary entry:
  `summarizeProcessLoad`) — already used by Triage to derive `heavyCount`; the
  `width >= heavyThreshold` test is unchanged.
- `loadLevel` from `src/lib/utils/loadLevel.js` (glossary entry: `loadLevel`) —
  the low/medium/high banding that selects the card state, unchanged.
- `Chrome` helper from `src/lib/utils/Chrome` and `installChromeShim` from
  `src/lib/utils/chromeShim` — used by the components and their tests.
- `Triage` and `Settings` glossary entries — the components being modified.

## Scenarios to Demonstrate

- **Dev channel, identifiable culprit (happy path):** `loadDataSource:
  'processes'`, load ≥ warnAt, one or more tabs over `heavyThreshold` → "Running
  hot — N heavy tabs … Close a few" with the "Review N heavy tabs" CTA.
- **Dev channel, calm:** `processes` source, low load → green "Comfortable" card
  still shows.
- **Dev channel, high load but no culprit:** `processes` source, load ≥ warnAt,
  `heavyCount === 0` → Triage renders nothing (no false "0 heavy tabs" alarm).
- **Stable Chrome:** `loadDataSource: 'system'`, high whole-browser load → Triage
  card hidden entirely.
- **Settings on Dev channel:** all three sliders ("Warn at", "Heavy tab ≥",
  "Auto-close after") visible.
- **Settings on stable Chrome:** only "Auto-close after" visible; the two load
  sliders hidden.
