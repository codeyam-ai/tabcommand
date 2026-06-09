---
title: "Home shell + Active Tabs (Tabs + Url)"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

Third plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`; foundation + storage spine already built). This builds the
**Home screen's tab list** — the most prominent surface of the app — and the real
App page-navigation that replaces the temporary seed diagnostic.

Concretely: the `Tabs` component (Active Tabs / Automatically Closed / History
sections) and the `Url` row it renders, the Home layout with its sidebar, the
`DragDropContext` shell (`@hello-pangea/dnd`), and realistic seed scenarios that
show the tab list in several states. Sibling Home pieces that have their own plans
— `Search`, `LoadMeter`, `Labels`, the Import/Export link — are rendered as inert
stubs so the layout is whole without pulling their behavior forward.

This is the first plan that renders **real seeded data** in feature UI, so it also
corrects a storage-layer gap the real data model exposes (see Key Decisions).

## The real data model (load-bearing — seeds and components both depend on it)

Read from `chrome.storage.local` (the shim, in preview). TabCommand's model, as the
reference actually uses it:

- **`allUrls`**: an ordered **array of `urlKey` strings** (NOT a map). e.g.
  `["url-https://github.com/codeyam/tabcommand", "url-https://react.dev", …]`.
  (`Tab`/`Url` do `allUrls.indexOf(urlKey)` / `splice`; `Tabs` treats it as `allUrlKeys`.)
- **`urlKey`**: the string `"url-" + <the actual URL>`. `Url` derives the display URL
  via `urlKey.replace(/^url-/, '')`.
- **Per-URL objects**: each URL is its **own top-level storage key** equal to its
  `urlKey`. Value shape:
  `{ title: string, favicon: string, processes: { samples, network, cpu, privateMemory, jsMemoryAllocated, jsMemoryUsed } }`.
  Fetched via `Chrome.get(ctx, ['activeTabs', urlKey], r => r[urlKey])`.
- **`activeTabs`**: array of
  `{ urlKey, tabKey, pinned, tabCommandPinned }`. `tabKey` is `"tab-" + <id>`
  (`parseInt(tabKey.split('-')[1])` = the tab id). `pinned` = browser-pinned (these are
  **filtered out** of the active list). `tabCommandPinned` = TabCommand's keep-open flag.
- **`labels`**: object map keyed by label title →
  `{ title, color, urlKeys: [urlKey, …], position }`. (Drives grouping: a `urlKey` in a
  label's `urlKeys` makes that URL appear under that label's heading.)
- **`autoClosed`**: object map `{ [urlKey]: closedTimestampMs, maxTime?: number }`.
  `Tabs` keeps entries where `Date.now() - ts < (maxTime || MaxAutoClosedTime)`, sorted
  ascending by timestamp.
- **`uxSettings`**: `{ page: { name, urlKey? }, selectedLabel? }` — drives navigation.

**Process stats math** (reproduce): averages over `samples`. `Url` load indicator:
`cpuAvg = cpu/100/samples`, `memAvg = privateMemory/1064000/samples`; level thresholds
`excessive` (cpu>54 || mem>600), `high` (>36 || >400), `medium` (>18 || >200), else
`low`; bar width `max(cpu/72, mem/800)*100`%.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| Tab list (3 sections) | `../tabcommand/src/lib/components/Tabs/Tabs.jsx` (+ `.css`) | Full port |
| URL row | `../tabcommand/src/lib/components/Url/Url.jsx` (+ `.css`) | Full port (display + hover actions + load) |
| Home layout + navigation | `../tabcommand/src/lib/pages/App/App.jsx` (+ `App.css`) | Real port; remove temp diagnostic |
| Constants | `../tabcommand/src/Constants.jsx` | Already ported / extend (`Pages`, `ItemTypes`, `Colors`, `MaxAutoClosedTime`) |
| Default favicon | `../tabcommand/src/images/defaultFavicon.png` | Copy |
| `Tab` component | `../tabcommand/src/lib/components/Tab/` | **Do NOT port — dead code** (see Key Decisions) |

## Key Decisions

- **Exclude the `Tab` component — it is dead code.** In the reference, `<Tab>` is
  referenced only by its own `Tab.test.jsx`; nothing in production imports it (`Tabs`
  renders `Url`, not `Tab`). A faithful *modern* reproduction drops orphaned code rather
  than carrying it (and its test) forward. If a later plan turns out to need a
  simple-tab presentation, we add it then, deliberately.

- **Fix the shim to hydrate ALL localStorage keys, not just `KNOWN_KEYS`.** The
  storage-layer shim (`src/lib/utils/chromeShim/chromeShim.js`) hydrates its in-memory
  `store` by looping `KNOWN_KEYS`. But each URL object lives under a **dynamic**
  `url-<url>` key, which isn't in that list — so seeded URL objects would never hydrate
  and every tab would render blank (no title/favicon/load). Change `createChromeShim()`
  to iterate every `window.localStorage` entry
  (`for (let i=0; i<localStorage.length; i++) { const k = localStorage.key(i); … }`),
  `JSON.parse` each (existing try/catch skips malformed). `KNOWN_KEYS` stays — but only
  as the source for the `Chrome` abstraction's default-hydration lists, not as the
  shim's boot scope. In the codeyam iframe localStorage is cleared+seeded per scenario,
  so hydrating all keys is exactly the seeded set. Add a shim test: a seeded `url-…`
  dynamic key is returned by `get`.

- **Install `@hello-pangea/dnd` now; full drag behavior is the Labels plan.** `Tabs`
  renders `Droppable`/`Draggable` and needs a `DragDropContext` ancestor (in the Home
  content) to mount at all. Install the maintained drop-in here and wire the context so
  `Tabs` renders. The URL lists are drag **sources** (`isDropDisabled`), and the drop
  **targets** are Labels — which don't exist yet — so `onDragEnd` is a minimal no-op
  (or logs) in this plan; the real grouping/reordering logic lands in `labels-and-dnd`.
  Use `@hello-pangea/dnd` import paths (`Droppable`, `Draggable`, `DragDropContext`).

- **Stub the other Home pieces, don't fake them.** `Search`, `LoadMeter`, `Labels`, and
  the Import/Export link each have their own plan. Render them as minimal placeholder
  components (e.g. `Labels` → an empty `<div className="Labels"/>`; `Search`/`LoadMeter`
  → small inert sidebar placeholders; Import/Export link → a non-navigating element).
  This keeps the captured Home visually whole (sidebar + tab content) without importing
  unbuilt behavior. Each stub gets a `{/* stub: built in <plan> */}` marker.

- **Navigation is real now.** Port App's page state: `uxSettings.page` drives which page
  renders; `changePage(name)` writes `uxSettings.page`; an `onChanged` listener calls
  `setPage` when `uxSettings` changes. Only the `HOME` page has content this plan; `URL`
  / `IMPORTEXPORT` / `LOAD` render small "coming soon" placeholders (their plans replace
  them). This makes the page-routing spine real and testable immediately.

- **Keep `Url`'s action handlers wired to the shim, even where targets are stubs.**
  `Url`'s pin/close/remove call `chrome.tabs.*` (shim no-ops) and `Chrome.set` (real);
  edit sets `uxSettings.page = {name: URL, urlKey}` (navigates to the URL placeholder).
  Port them faithfully — they exercise the storage + navigation spine. The destination
  `UrlDetails` page is a placeholder until its plan.

## Implementation

### 1. Shim hydration fix (+ test)

`src/lib/utils/chromeShim/chromeShim.js`: replace the `KNOWN_KEYS` boot loop with a
full-`localStorage` scan (parse-all, skip malformed). Add a test to
`chromeShim.test.js`: seed `localStorage["url-https://x.com"] = JSON.stringify({title:"X",…})`,
install, assert `get("url-https://x.com", cb)` yields it.

### 2. Constants

Ensure `src/Constants.jsx` (or `.js`) exports `Pages`, `ItemTypes`, `Colors`,
`AutoCloseMinutes`, `MaxAutoClosedTime` (port from reference verbatim).

### 3. `Url` component

`src/lib/components/Url/Url.jsx` (+ `.css`, + `index.js`). Full port of the reference:
- State from `Chrome.get(['activeTabs', urlKey])` + `onChanged` (title, favicon,
  processStats, tabId from matching activeTab's tabKey, tabCommandPinned).
- Display: favicon (fallback `defaultFavicon`), title (or derived url), `title` tooltip
  with averaged CPU/mem when samples>0.
- Load indicator (`showLoad`): level class + bar width per the process math above.
- Hover/`showActions`/`expanded` action row: pin/unpin, edit (→ `uxSettings.page`),
  delete/remove (when `closed`/`onRemove`), close. Wire handlers per reference (shim
  no-ops for `chrome.tabs.*`; real `Chrome.set`/`remove`).
- Accept the drag props (`dragRef`, `draggableProps`, `dragHandleProps`) passed by
  `Tabs`.

### 4. `Tabs` component

`src/lib/components/Tabs/Tabs.jsx` (+ `.css`, + `index.js`). Full port:
- State from `Chrome.get(['activeTabs','autoClosed','allUrls','labels'])` + `onChanged`:
  `activeTabUrls` = activeTabs minus `pinned`; `autoClosedUrlKeys` (sorted/filtered);
  `allUrlKeys` = allUrls; `labelMap` (urlKey → label title, from `labels[*].urlKeys`).
- `DraggableTabUrls` sub-render (`Droppable`/`Draggable` → `Url`).
- Three sections with their empty-state explainer copy (port verbatim):
  **Active Tabs** (ungrouped + grouped-by-label), **Automatically Closed** (ungrouped +
  grouped), **History** (collapsible; `ungroupedUrlKeys()` slice caps `500`/`250`
  preserved).
- `PropTypes` retained (the project lints with `eslint-plugin-react`).

### 5. App Home + navigation

`src/lib/pages/App/App.jsx`: remove the temporary diagnostic. Port the real App:
- `page` state seeded from `uxSettings.page`; `onChanged` → `setPage`.
- Sidebar: logo (→ `changePage(HOME)`), `<Search/>` stub, `<LoadMeter/>` stub
  (→ `changePage(LOAD)`), Import/Export link stub.
- Content: switch on `page.name` — `HOME` → `<DragDropContext onDragEnd={…minimal}>`
  wrapping `<Tabs/>` + `<Labels/>` stub; `URL`/`IMPORTEXPORT`/`LOAD` → placeholders.
- Drop `App.css` layout for the sidebar/content + section styles used by Tabs/Url (port
  the relevant `App.css`, `Tabs.css`, `Url.css` rules).

### 6. Stubs

`src/lib/components/{Search,LoadMeter,Labels}/` minimal placeholder components +
`index.js` re-exports, each marked `{/* stub: built in <plan> */}`. Wire them into the
components barrel (`src/lib/components/index.js`) so imports resolve.

### 7. Seed scenarios (the payoff — show the tab list in real states)

Author application scenarios (url `/`), each a `seed` of the real model. Suggested set:
- `home-empty` — no tabs: both sections show their explainer copy.
- `home-active-tabs` — ~5 ungrouped active tabs with varied titles/favicons; a couple
  with process stats (one low, one `high`/`excessive` load to show the indicator).
- `home-grouped` — labels present (`labels` map with `urlKeys`); some active tabs grouped
  under label headings + an ungrouped remainder.
- `home-autoclosed-and-history` — `autoClosed` entries (recent timestamps) + extra
  `allUrls` not active/closed (History section populated).

Shape each per the data model above (per-URL keys, `activeTabs` with `tabKey`, `allUrls`
array). Register and capture each; screenshots should show populated, styled tab rows.

### 8. Tests (Vitest + RTL; reproduce reference test intent)

- `Tabs.test.jsx`: empty state shows explainer; given seeded `activeTabs`/`allUrls`,
  renders rows; grouped vs ungrouped split by `labels`; History toggles collapse.
- `Url.test.jsx`: renders title/favicon; derives url from `urlKey`; shows load indicator
  at the right level for given process stats; hover reveals actions.
- App navigation test: `uxSettings.page` selects the rendered page; `changePage` writes
  it.
- Use the shim (or sinon-chrome) for `chrome`; every `it()` keeps its `//` description.

## Verification (acceptance criteria)

1. `npm test` green (new `Tabs`/`Url`/App-nav suites + shim dynamic-key test).
2. `npm run lint` clean; `codeyam-editor editor verify-build` green.
3. Dev server: Home renders the tab sections; with a seeded URL the row shows real
   title/favicon/load (proving the shim dynamic-key fix). No `chrome` errors.
4. The `home-active-tabs` (and siblings) scenarios capture screenshots showing populated,
   styled tab rows — not blank rows and not the old diagnostic.
5. Temporary seed diagnostic is gone from `App.jsx`.

## Out of scope (later plans)

- `Labels`/`LabelCollection`/`LabelForm` and real drag-to-group/reorder behavior
  (`labels-and-dnd`) — `onDragEnd` stays minimal here.
- `Search`/`SearchResults` (`search`), `LoadMeter` widget + `Load` page (`load-meter`),
  `UrlDetails` (`url-details`), `ImportExport` (`import-export`) — stubs/placeholders now.
- `service_worker.js` modernization; the crxjs popup.js build gap.
