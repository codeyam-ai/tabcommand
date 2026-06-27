---
title: "Auto-Close Engine (Closer)"
mode: ui
createdAt: "2026-06-27T19:33:59Z"
source: manual
---

## Summary

The "Automatically Closed" section in the Home/Tabs view is permanently empty in
real usage because the runtime engine that closes inactive tabs — the "Closer" —
was never implemented. Everything *around* it already exists and works: `Tabs.jsx`
reads and renders the `autoClosed` storage map (ungrouped + grouped), `Url.jsx`
exposes the restore (✕ / click-to-reopen) actions and the thumbtack pin
(`tabCommandPinned`) exemption, and `updateActiveTabs` in `service_worker.js`
already *clears* an `autoClosed` entry when its tab is reactivated or moved. But
nothing ever *writes* into `autoClosed` at runtime — `AutoCloseMinutes = 120` is
defined in `Constants.jsx` and referenced nowhere, there is no timer/alarm in the
service worker, and `"alarms"` is not in the manifest permissions. The "Closer"
was explicitly deferred as out-of-scope in `labels-and-dnd.md`; scenarios seed
`autoClosed` directly, which is why it only ever appears in mockups. This plan
implements the engine in `service_worker.js` so inactive tabs are actually closed,
recorded in `autoClosed`, and surfaced in the "Automatically Closed" section —
where the existing restore/close UI then takes over. The plan also adds a
user-facing control to the gear settings popup so the inactivity threshold is
adjustable (it currently hard-codes to 120 minutes with no way to change it).

## Key Decisions

- **Drive the engine with `chrome.alarms`, not `setInterval`** — MV3 service
  workers are ephemeral and get torn down between events, so an in-memory timer
  would not survive. A periodic alarm (e.g. every ~1 minute) wakes the worker to
  run a sweep. This requires adding `"alarms"` to `manifest.json` permissions.
- **Make the threshold user-adjustable via the existing `settings` key** — add an
  `autoCloseMinutes` control to the gear settings popup (`Settings.jsx`), persisted
  under the same `settings` storage object that already holds `warnAt` /
  `heavyThreshold`. The engine reads `settings.autoCloseMinutes` at sweep time and
  falls back to the `AutoCloseMinutes` (120) default when unset, so behavior is
  unchanged until the user moves the control. This reuses the established
  slider-row + `Chrome.set('settings', …)` pattern rather than introducing a new
  storage key or settings surface.
- **Use `activeAt` for the inactivity clock, falling back to `openedAt`** — both
  are already maintained per tab inside `updateActiveTabs` (`activeAt` is stamped
  to `Date.now()` whenever a tab is active). A tab is "inactive" when
  `Date.now() - (activeAt || openedAt) >= AutoCloseMinutes * 60 * 1000`. No new
  bookkeeping is needed.
- **Close (remove) tabs, don't discard them** — the data contract and the UI
  expect the tab to be gone and recorded so it can be *restored* from the section.
  `autoClosed[urlKey] = Date.now()` records the close, mirroring exactly what the
  scenarios seed and what `Tabs.jsx`'s `sortAutoClosed` reads.
- **All eligible inactive tabs are closable, including grouped/labeled ones**
  (per scope decision). The "Automatically Closed" section already renders a
  grouped sub-list (`autoClosedTabUrlLabels`), and the per-URL group color comes
  from `labels` via `colorMap`, so grouped auto-closed rows display correctly
  with no extra writes.
- **Exemptions match the UI's promise** — never auto-close: Chrome-pinned tabs
  (`pinned`), TabCommand-pinned tabs (`tabCommandPinned`, set by the thumbtack),
  the currently active tab (`active`), and anything `validTab()` already rejects
  (the TabCommand tab itself, `chrome://`, `devtools://`, `chrome-extension://`).
  This is exactly what the empty-state explainer text in `Tabs.jsx` describes.
- **Let the existing reactivation cleanup do the restore half** — when a user
  reopens an auto-closed URL, `updateActiveTabs` (lines ~190–197) already deletes
  the stale `autoClosed` entry. No changes needed there; the engine only fills the
  map, the existing code drains it.
- **Reuse the established `autoClosed` shape** — `{ [urlKey]: closedTimestampMs }`
  with optional `maxTime`. `Tabs.jsx` already filters out entries older than
  `MaxAutoClosedTime` (5 days) and `closeUrl`/`handleClose` already prune entries
  on manual close, so no separate expjust is required, though the sweep may
  opportunistically drop entries older than `MaxAutoClosedTime` to keep storage
  small.

## Implementation

### 1. Add the `alarms` permission

**File**: `manifest.json`

Add `"alarms"` to the `permissions` array (currently `["storage", "tabs",
"processes", "tabGroups", "system.cpu", "system.memory"]`). Without it,
`chrome.alarms.create` / `onAlarm` are unavailable.

### 2. Implement the Closer engine in the service worker

**File**: `service_worker.js`

Add the engine alongside the existing top-level listener registrations. Mirror the
file's existing style (plain functions, `getLocalStorage`/`update` helpers,
callback-based `chrome.storage.local`, `validTab`, `getUrlKey`).

- Import the threshold constants. The worker currently can't share the
  `Constants.jsx` ES module (same constraint already documented for `GAUGE` at the
  top of the file — the test harness strips imports). Follow that established
  pattern: define local `AUTO_CLOSE_MINUTES = 120` and
  `MAX_AUTO_CLOSED_TIME = 1000 * 60 * 60 * 24 * 5` constants with a short comment
  noting they mirror `src/Constants.jsx` (`AutoCloseMinutes` / `MaxAutoClosedTime`),
  the same way `GAUGE` mirrors the LoadMeter scale.
- Register a repeating alarm near the other `chrome.*.addListener` calls, e.g.
  `chrome.alarms.create('auto-close-sweep', { periodInMinutes: 1 })` plus a
  `chrome.alarms.onAlarm.addListener` that runs the sweep when
  `alarm.name === 'auto-close-sweep'`.
- Add an `autoCloseSweep()` function that:
  1. Reads `['activeTabs', 'autoClosed', 'settings']` from storage.
  2. Computes `now` and the cutoff using the user-configured threshold:
     `minutes = (settings && settings.autoCloseMinutes) || AUTO_CLOSE_MINUTES`,
     then `cutoff = now - minutes * 60 * 1000`.
  3. Selects activeTabs that are **eligible to close**: not `pinned`, not
     `tabCommandPinned`, not `active`, and whose `(activeAt || openedAt)` is at or
     before the cutoff. (activeTabs entries are URL-level records with `tabKey`,
     `urlKey`, `pinned`, `tabCommandPinned`, `activeAt`, `openedAt` — all already
     produced by `updateActiveTabs`.)
  4. For each eligible tab: record `autoClosed[urlKey] = now`, then close the live
     Chrome tab via `chrome.tabs.remove(parseInt(tabKey.split('-')[1]))`. Guard
     each removal (wrap in try/catch or use the callback to swallow
     `chrome.runtime.lastError`) so a stale tabId can't abort the sweep — follow
     the defensive style already used in `groupTabs`/`tabUpdates`.
  5. Optionally prune `autoClosed` entries older than `MAX_AUTO_CLOSED_TIME` so
     the map doesn't grow unbounded (the UI filters them out already, but pruning
     keeps storage clean).
  6. Persist the updated `autoClosed` via `update({ autoClosed })`.
- Removing tabs fires the existing `chrome.tabs.onRemoved` listener, which calls
  `closeUrl(...)` → `updateActiveTabs()`, so `activeTabs` rebuilds itself and the
  closed rows drop out of "Active". Because `updateActiveTabs` reads `autoClosed`
  and stamps each surviving tab's `autoClosedAt`, and `Tabs.jsx` subscribes to
  `chrome.storage.onChanged` for `autoClosed`, the "Automatically Closed" section
  updates live with no UI changes. **Important:** set `removing` / order writes so
  the sweep's `autoClosed` write is not clobbered — write `autoClosed` *before or
  together with* triggering removals, and confirm the `onRemoved`→`closeUrl` path
  (which only touches `allUrls`) does not overwrite it.

### 3. Add an auto-close-time control to the settings popup

**File**: `src/lib/components/Settings/Settings.jsx`

Add a third `Settings-row` below the existing "Warn at" / "Heavy tab ≥" sliders,
following the same structure exactly:

- Seed the default in the `useState` initializer: `autoCloseMinutes: AutoCloseMinutes`
  (import `AutoCloseMinutes` from `../../../Constants`).
- Render a labeled control — e.g. label "Auto-close after",
  value display showing the current value in human terms (e.g. `120 min` or
  `2 hr`), and an `<input type="range">` bound to `settings.autoCloseMinutes` that
  calls `update('autoCloseMinutes', e.target.value)`. Pick a sensible
  min/max/step (e.g. min 15, max 480, step 15) so the range covers ~15 min to
  8 hours. (If a discrete `<select>` of presets reads better than a slider, that's
  an acceptable tactical choice for the editor workflow — the persisted shape is
  the same.)
- No new persistence code is needed: the existing `update(key, value)` helper
  already writes `{ settings: next }` via `Chrome.set`, and `Number(value)`
  coercion is already applied there.

Because the engine reads `settings.autoCloseMinutes` on each sweep, moving this
control takes effect on the next sweep with no extra wiring.

### 4. Make the engine unit-testable

**File**: `service_worker.test.js`

The test harness loads `service_worker.js` by reading the source, stripping
`import` lines, and evaluating it in a `Function` wrapper with mocked `chrome.*`
(see the existing setup around lines 16–95). Expose `autoCloseSweep` (and any
small helper such as an `isAutoCloseEligible(tab, now)` predicate, if extracted)
through the same returned-function bag the other internals use, then add a
`describe('autoCloseSweep', ...)` block covering:

- An inactive ungrouped tab past the threshold is removed and written to
  `autoClosed` with a timestamp.
- A pinned tab, a `tabCommandPinned` tab, and the `active` tab are **not** closed.
- A tab active within the threshold window is **not** closed.
- A grouped/labeled inactive tab **is** closed (scope: all eligible).
- `chrome.tabs.remove` throwing for one tab does not prevent the others from being
  processed.
- Entries older than `MAX_AUTO_CLOSED_TIME` are pruned from `autoClosed`.

- A custom `settings.autoCloseMinutes` overrides the default: a tab inactive past
  the configured (shorter) threshold but younger than 120 min is closed; with the
  default, the same tab would be kept.

Use the existing `vi.fn()` chrome mocks and the `beforeEach` storage-stub pattern
already in the file.

## Reused existing code

- `updateActiveTabs` from `service_worker.js` — already maintains `activeAt` /
  `openedAt`, stamps `autoClosedAt`, and **clears** `autoClosed` entries on
  reactivation; the engine only needs to fill the map (glossary/registry:
  `updateActiveTabs`).
- `validTab`, `getUrlKey`, `getLocalStorage`, `update`, `parseTabId` helpers from
  `service_worker.js` — reuse for filtering, key derivation, storage reads, and
  persistence (glossary entries: `validTab`, `getUrlKey`, `getLocalStorage`,
  `update`, `parseTabId`).
- `closeUrl` + `chrome.tabs.onRemoved` listener in `service_worker.js` — already
  reconciles `allUrls`/`activeTabs` after a tab is removed; the sweep relies on
  this rather than duplicating cleanup.
- `tabCommandPinned` field — produced by `updateActiveTabs`, toggled by the
  thumbtack in `src/lib/components/Url/Url.jsx` (`togglePin` around line 145); the
  engine reads it as the user's "don't auto-close this" signal.
- `AutoCloseMinutes` / `MaxAutoClosedTime` from `src/Constants.jsx` — the
  canonical default thresholds (mirrored locally in the worker, as `GAUGE` already
  is; imported directly in `Settings.jsx` for the control's default).
- `Settings` component + its `update(key, value)` helper and `settings` storage
  key in `src/lib/components/Settings/Settings.jsx` — the existing
  slider-row/`Chrome.set` pattern the new auto-close-time control reuses verbatim
  (glossary/registry entry: `Settings`). The `settings` map is also already read
  by `Tabs.jsx`'s `readLoad`, confirming it's the right home for the value.
- `sortAutoClosed` / `autoClosedTabUrlLabels` / `ungroupedAutoClosed` in
  `src/lib/components/Tabs/Tabs.jsx` — the existing display side that consumes the
  `autoClosed` map; no changes needed, they light up once the map is populated.

## Scenarios to Demonstrate

- **Happy path** — a couple of ungrouped tabs inactive past 120 minutes get
  closed and appear under "Automatically Closed → Ungrouped" with recent
  timestamps, alongside still-open active tabs. (Maps to the existing
  `home-autoclosed-and-history` scenario seed.)
- **Grouped auto-closed** — an inactive tab that belonged to a colored label is
  closed and shows under "Automatically Closed → <label>" with the group's color
  dot.
- **Exempt: pinned / thumbtacked / active** — tabs that are Chrome-pinned,
  thumbtack-pinned (`tabCommandPinned`), or currently active stay open and are
  absent from the section even though they're "old".
- **Empty state** — no eligible inactive tabs yet: the section renders the
  explainer text ("TabCommand automatically closes tabs… click the thumbtack icon
  to stop it…").
- **Restore round-trip** — reopening an auto-closed URL (click the row) removes it
  from "Automatically Closed" (existing `updateActiveTabs` cleanup) and it
  reappears under "Active".
- **Adjustable threshold** — open the gear settings popup, drag "Auto-close after"
  to a shorter interval; tabs that were just under the old threshold now qualify
  and get swept on the next pass. Setting persists across reopen of the popup.
- **Edge: stale tabId during sweep** — one tab's `chrome.tabs.remove` errors; the
  remaining eligible tabs are still closed and recorded.
