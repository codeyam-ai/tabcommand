---
title: "Hide Empty Load Gauge Divider In Sidebar Footer"
mode: ui
createdAt: "2026-07-28T15:00:02Z"
source: manual
---

## Summary

When per-tab load data is unavailable (`loadDataSource !== 'processes'` — i.e. stable Chrome), `LoadMeter` self-hides and renders nothing, but the sidebar footer still renders its wrapper `<div className="App-gauge">`. That wrapper carries a `border-bottom` hairline, so the user sees two horizontal rules stacked above the Import/Export link — the footer's own `border-top` plus the empty gauge's `border-bottom` — where only one is wanted. Fix it by gating the gauge wrapper on the same `loadDataSource` marker the gauge itself uses, so the empty div (and its hairline and padding) disappears entirely when the monitoring section is not displayed.

## Key Decisions

- **Gate the wrapper in `App.jsx`, not with CSS `:empty`.** A `.App-gauge:empty { display: none }` rule would also work, but it is implicit, invisible to jsdom, and therefore untestable — and it would leave a click target bound to `changePage(Pages.LOAD)` on a zero-content element. Reading `loadDataSource` in `App` makes the intent explicit and unit-testable.
- **Follow the established per-component read pattern.** `Settings`, `Triage`, `LoadPerTabNote`, `LoadMeterCaption` and `LoadMeter` each own a `Chrome.get('...', 'loadDataSource', ...)` plus a `chrome.storage.onChanged` listener. `App` already has exactly that shape in its existing mount effect, so the new key folds into the effect that is already there rather than introducing a new hook or prop-drilling from `LoadMeter`.
- **Leave the CSS rules alone.** `.App-gauge` / `.App-sidebar-footer .App-gauge` stay as-is; they are correct when the gauge *is* shown. Only the render condition changes. The comment at `App.css:107` may be extended to note the wrapper is now conditionally rendered.

## Implementation

### 1. Read `loadDataSource` in `App` and gate the gauge wrapper

**File**: `src/lib/pages/App/App.jsx`

- Add a `const [loadSource, setLoadSource] = useState(null)` alongside the existing `page` / `counts` state.
- In the existing mount `useEffect` (`App.jsx:49`), add a `Chrome.get('AppLoadSource', 'loadDataSource', ({ loadDataSource }) => setLoadSource(loadDataSource || null))` read, and extend the existing `handleChange` listener (`App.jsx:66`) with `if (changes.loadDataSource) setLoadSource(changes.loadDataSource.newValue || null);` so the wrapper appears/disappears live when the service worker writes the marker.
- Change the footer's gauge block (`App.jsx:247-249`) from an unconditional render to `{loadSource === 'processes' && (<div className="App-gauge" onClick={() => changePage(Pages.LOAD)}><LoadMeter /></div>)}`.
- Update the surrounding comments so they say the wrapper — not just the meter — self-hides without per-tab data.

### 2. Note the conditional wrapper in the stylesheet comment

**File**: `src/lib/pages/App/App.css`

The comments at `App.css:43-45` and `App.css:107` describe the gauge as always present with a separating hairline. Adjust them to record that the wrapper is only rendered when `loadDataSource === 'processes'`, so the second hairline never appears on stable Chrome. No rule changes.

### 3. Reproduction test

**File**: `src/lib/pages/App/App.test.jsx`

Add the red-first test captured in the `## Reproduction Test` section below, plus (optionally, in the same pass) a positive counterpart that seeds `loadDataSource: 'processes'` and asserts the `.App-gauge` wrapper *is* present — so the gate is pinned in both directions.

## Reused existing code

- `LoadMeter` from `src/lib/components/LoadMeter/LoadMeter.jsx` (glossary entry: `LoadMeter`) — the `source !== 'processes'` self-hide gate at `LoadMeter.jsx:81` is the exact condition `App` now mirrors for the wrapper.
- `App` from `src/lib/pages/App/App.jsx` (glossary entry: `App`) — the existing mount effect and `chrome.storage.onChanged` handler are extended rather than duplicated.
- `Chrome` from `src/lib/utils/Chrome` — same `Chrome.get(label, key, cb)` call shape already used four times in this file.
- `Triage` from `src/lib/components/Triage/Triage.jsx` (glossary entry: `Triage`) and `Settings` (`src/lib/components/Settings/Settings.jsx:48`) — reference implementations of the read-plus-onChanged `loadDataSource` gate.
- `installChromeShim` from `src/lib/utils/chromeShim/chromeShim.js` — the test seam; it seeds no `loadDataSource` by default, which is exactly the unavailable-data case the repro needs.
- **Existing-implementation survey**: no existing prop, CSS rule, or helper already hides the `.App-gauge` wrapper — `grep -rn "App-gauge" src` returns only the JSX at `App.jsx:247` and the two rules in `App.css` (`:46`, `:108`). Nothing equivalent exists, so this adds the gate rather than duplicating one.

## Reproduction Test

Pins that the sidebar footer renders no empty `.App-gauge` wrapper (and therefore no second hairline above Import/Export) when per-tab load data is unavailable.

**Target**: `src/lib/pages/App/App.test.jsx` — run with
`codeyam-editor editor refresh-tests --test "does not render the gauge wrapper when per-tab load data is unavailable"`.

```jsx
// with no loadDataSource marker the gauge self-hides, so its wrapper (and its divider hairline) must not render either
it('does not render the gauge wrapper when per-tab load data is unavailable', async () => {
  installChromeShim();
  const { container } = render(<App />);

  expect(await screen.findByText('Import/Export')).toBeInTheDocument();
  expect(container.querySelector('.App-gauge')).toBeNull();
});
```

Status: PROPOSED — confirm red at execution. Expected failure: `App` renders `<div className="App-gauge">` unconditionally, so `container.querySelector('.App-gauge')` returns the (empty) element and `expect(...).toBeNull()` fails with "expected <div class=\"App-gauge\" /> to be null".

## Scenarios to Demonstrate

- **Stable Chrome (no per-tab data)** — `loadDataSource` unset/`'system'`: sidebar footer shows exactly one hairline, directly above the tab/group counts and Import/Export link.
- **Dev Chrome (per-tab data available)** — `loadDataSource: 'processes'` with a `processTotals` snapshot: the gauge renders as today, with its divider hairline beneath it.
- **Live transition** — start with no marker, then write `loadDataSource: 'processes'` into storage: the gauge and its hairline appear without a reload.
- **Non-Home page** — on the Import/Export page with no per-tab data: footer still shows a single hairline (Triage and the counts are Home-only, so the footer collapses to just the link).