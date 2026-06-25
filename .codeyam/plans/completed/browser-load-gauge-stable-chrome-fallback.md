---
title: "Browser Load Gauge: Stable-Chrome Fallback"
mode: ui
createdAt: "2026-06-25T18:14:31Z"
source: manual
---

## Summary

In the real (unpacked) TabCommand extension running in **stable Chrome**, the
sidebar **Browser Load** gauge (`LoadMeter`) renders its circle but the arcs stay
empty — it looks blank and "does nothing." Root cause: the gauge fills from the
`processTotals` storage key, which `service_worker.js` only ever writes from
`chrome.processes.onUpdatedWithMemory`. The `chrome.processes` API is **Dev/Canary
channel only** — in stable Chrome the object is `undefined`, every call lands in
the existing `try/catch`, `processTotals` is never written, and the gauge has no
data. This plan makes the gauge work everywhere by adding a stable-channel data
source (`chrome.system.cpu` + `chrome.system.memory`), and — because **no stable
API exposes per-tab CPU/memory at all** — makes the per-tab parts of the Load page
degrade honestly with a clear explanation instead of looking broken.

## Key Decisions

- **Graceful channel-based degradation (not a single hard path).** Keep using
  `chrome.processes` when present (Dev/Canary) for true per-process + per-tab data.
  When it's absent, fall back to `chrome.system.cpu`/`chrome.system.memory` to drive
  the gauge with whole-browser/OS load. When neither is available (permissions
  denied), the gauge shows an explicit "no data" state. This is the option the user
  chose over a data-only fix or a messaging-only fix.
- **The gauge can be saved; per-tab bars cannot.** Verified against the Chrome docs:
  `chrome.processes` (per-tab/per-process CPU+memory, the only API that maps tasks to
  `tabId`) is Dev-channel only; there is **no** stable MV3 API for per-tab resource
  usage. The DevTools Protocol via the `debugger` permission can read the active tab
  but attaches an intrusive "started debugging this browser" banner — rejected for an
  always-on gauge. So `LoadUrl` per-tab bars and the `LoadProcesses` table stay empty
  on stable Chrome by necessity; we explain that rather than fake it.
- **System fallback values are normalized to the gauge's existing scale.** The gauge's
  `max.cpu`/`max.memory` (in `LoadMeter`) were tuned for summed Chrome-process numbers.
  Raw OS memory (e.g. 12 GB used) would peg the 5 GiB arc permanently. So the fallback
  writes `processTotals` normalized to a 0→saturated *utilization fraction* against the
  existing maxes, keeping `LoadMeter`/`deriveGaugeTotals`/`gaugeFillPercent` unchanged.
- **CPU% needs two samples.** `chrome.system.cpu.getInfo()` returns cumulative
  per-core counters; utilization is the delta between two polls. The service worker
  owns the sampling/timing; the pure math lives in a new testable util.
- **A small `loadDataSource` marker key drives honest UI.** The service worker records
  whether the live source is `'processes' | 'system' | 'none'` so `LoadMeter` and the
  Load page can label themselves truthfully without re-detecting APIs in the popup.

## Implementation

### 1. Add stable-channel permissions

**File**: `manifest.json`

Add `"system.cpu"` and `"system.memory"` to the `permissions` array (currently
`["storage", "tabs", "processes", "tabGroups"]`). Keep `"processes"` — it's harmless
on stable and used on Dev/Canary.

### 2. Pure system-load math util

**New file**: `src/lib/utils/deriveSystemTotals.js`

Pure, unit-testable (mirrors `deriveGaugeTotals`/`gaugeFillPercent`): given a previous
and current `chrome.system.cpu` sample plus a `chrome.system.memory` info object,
return a `processTotals`-shaped record (`{ cpu, privateMemory, jsMemoryUsed }`)
normalized to the gauge's scale:
- **CPU**: average per-core busy fraction = `Δ(kernel+user) / Δtotal` across processors,
  scaled to the gauge's `max.cpu` so a fully-busy machine reads near-full.
- **Memory**: `(capacity - availableCapacity) / capacity` × the gauge's `max.memory`
  (proportional system-memory pressure), written into `privateMemory`; `jsMemoryUsed: 0`.
- Every field optional/guarded → empty or single-sample input reads as zero, never NaN
  (first poll has no delta → contributes 0 until the second sample).

### 3. Service-worker fallback + data-source marker

**File**: `service_worker.js`

- Where `listenToProcesses()` is wired: detect availability with
  `chrome.processes && chrome.processes.onUpdatedWithMemory`. If present, keep today's
  behavior and set `loadDataSource: 'processes'`.
- If absent, start a `system.*` polling loop (e.g. every few seconds, mirroring the
  existing `setTimeout` re-listen cadence): call `chrome.system.cpu.getInfo()` +
  `chrome.system.memory.getInfo()`, feed the previous + current sample through
  `deriveSystemTotals`, and `update({ processTotals, loadDataSource: 'system' })`
  via the existing `update()`/`chrome.storage.local.set` path.
- If `chrome.system.*` is also unavailable (wrap in `try/catch` like the existing
  processes guard), write `loadDataSource: 'none'` and stop — no throwing.
- Stop the system poll if `chrome.processes` later becomes available (defensive; not
  expected mid-session).

### 4. LoadMeter degraded / source-aware state

**File**: `src/lib/components/LoadMeter/LoadMeter.jsx` (+ `LoadMeter.css`)

- Also read `loadDataSource` (same `Chrome.get` + `chrome.storage.onChanged` pattern
  already used for `processTotals`).
- When `loadDataSource === 'none'` (or no `processTotals` and no source), render an
  explicit dimmed indicator inside/under the gauge — e.g. a small "No load data"
  caption — instead of a silently-empty circle.
- When `loadDataSource === 'system'`, add a subtle caption/title noting the gauge shows
  whole-browser load (not per-tab). Keep all DOM/SVG lookups guarded for jsdom exactly
  as the existing GradientPath code does.

### 5. Honest per-tab note on the Load page

**File**: `src/lib/pages/Load/Load.jsx` (+ `Load.css`)

When per-tab/process data is unavailable (no `loadDataSource === 'processes'`, i.e. the
`LoadUrl` cards have no `processes` and the `LoadProcesses` table is empty), render a
short explanatory note (e.g. near where the process table would be): per-tab CPU/memory
requires Chrome's Dev channel (`chrome.processes`); the gauge shows whole-browser load
only. This makes the empty per-tab area read as intentional rather than broken. The
`LoadUrl`/`LoadProcesses` components themselves are unchanged — they already collapse
cleanly with no data.

### 6. Tests

**Files**: `service_worker.test.js`, `src/lib/components/LoadMeter/LoadMeter.test.jsx`,
`src/lib/pages/Load/Load.test.jsx`, **new** `src/lib/utils/deriveSystemTotals.test.js`

- `deriveSystemTotals.test.js`: CPU delta → utilization across two samples; memory
  normalization; partial/empty/single-sample inputs → zero, never NaN.
- `service_worker.test.js`: with `chrome.processes` absent but `chrome.system.*` seeded,
  the fallback writes `processTotals` + `loadDataSource: 'system'`; with both absent it
  writes `'none'` and never throws; with `chrome.processes` present it sets `'processes'`
  and keeps current behavior.
- `LoadMeter.test.jsx`: renders the "no data" indicator when `loadDataSource === 'none'`;
  renders the gauge from seeded `processTotals` otherwise (keep the existing jsdom-guard
  assertion). Preserve each `it()`'s `//` description.
- `Load.test.jsx`: shows the per-tab-unavailable note when there's no process data; the
  existing URL-list / home-link tests stay green.

## Reused existing code

- `deriveGaugeTotals` from `src/lib/utils/deriveGaugeTotals.js` (glossary entry:
  `deriveGaugeTotals`) — gauge binding unchanged; the fallback feeds the same
  `processTotals` shape it already maps.
- `gaugeFillPercent` from `src/lib/utils/gaugeFillPercent.js` (glossary entry:
  `gaugeFillPercent`) — fill math unchanged; the new util normalizes to its `base`/`max`.
- `LoadMeter` from `src/lib/components/LoadMeter/LoadMeter.jsx` (glossary entry:
  `LoadMeter`) — extended with `loadDataSource`, not rewritten; reuses its
  `Chrome.get` + `chrome.storage.onChanged` subscription pattern.
- `Load` from `src/lib/pages/Load/Load.jsx` (glossary entry: `Load`) and `LoadUrl` /
  `LoadProcesses` (glossary entries: `LoadUrl`, `LoadProcesses`) — render unchanged; only
  an explanatory note is added to the page.
- `summarizeProcessLoad` from `src/lib/utils/processLoad.js` (glossary entry:
  `summarizeProcessLoad`) — already returns null with no data, so `LoadUrl` bars hide
  themselves; relied on, not modified.
- The service worker's existing `update()` / `getLocalStorage()` helpers and
  `listenToProcesses()` re-listen pattern.

## Scenarios to Demonstrate

- **Dev-channel happy path** — `loadDataSource: 'processes'` with seeded `processTotals`:
  gauge fills, per-tab bars present (existing `load-meter-high` / `load-page` behavior).
- **Stable-Chrome system fallback** — `loadDataSource: 'system'` with normalized
  `processTotals`: gauge fills, plus the subtle "whole-browser load" caption; Load page
  shows the per-tab-unavailable note.
- **No data at all** — `loadDataSource: 'none'`, no `processTotals`: gauge shows the
  explicit "No load data" indicator instead of a blank circle (the bug's current state,
  now legible).
- **Load page on stable Chrome** — URL list renders from `activeTabs`, per-tab load bars
  absent, honest explanatory note visible (empty process table reads as intentional).
- **Normalization edge** — high system memory pressure fills the memory arc proportionally
  without permanently pegging on a large-RAM machine.
