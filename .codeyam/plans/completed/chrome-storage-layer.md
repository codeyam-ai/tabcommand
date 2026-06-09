---
title: "Chrome storage layer + codeyam seeding spine"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

Second plan in the modern reproduction of **TabCommand** (reference spec on `main`
at `../tabcommand/`; foundation shell already built). This plan builds the **data
spine** every feature plan reads from, and wires it to codeyam's seeding so scenarios
can drive the app into any state.

TabCommand stores 100% of its state in `chrome.storage.local` behind a small
callback-based `Chrome` abstraction. In a real extension that storage is the Chrome
API; in the codeyam preview (and the plain-browser dev server) there is no extension
`chrome` object. This plan delivers three things:

1. A faithful port of the `Chrome` abstraction (callback API + default-hydration).
2. An **in-app chrome shim** that activates when the real extension `chrome` is
   absent, backed by an in-memory store **hydrated from `window.localStorage`** —
   exactly where codeyam's `localStorage` seed adapter injects scenario data.
3. The codeyam **`localStorage` seed adapter** + a proof-of-pipeline seeded scenario,
   verified end-to-end with a clearly-temporary on-screen diagnostic (removed by the
   next plan).

The editor already classified this project as the `chrome-extension-react` stack with
`data.type: "chrome-storage"` / `seedAdapterType: "localStorage"` (`.codeyam/stack.json`),
and `adapter_for_stack("chrome-extension-react") → "localStorage"` in the binary — so
this plan conforms to the editor's native contract rather than inventing one.

## How the seeding pipeline fits together

```
scenario seed JSON ──(npx tsx .codeyam/seed-adapter.ts)──▶ { localStorage: { key: JSON.stringify(val) } }
        │                                                              │
        │                                          codeyam injects via page.evaluate()/browserState
        ▼                                                              ▼
  .codeyam/scenarios/<slug>.json (seed: {...})            window.localStorage[key] = "<json>"  (before app JS)
                                                                       │
                                                                       ▼
                                          chrome shim hydrates in-memory store from localStorage on boot
                                                                       │
                                                                       ▼
                                    Chrome.get('ctx', ['labels','activeTabs'], cb) ── app renders the state
```

## Reference map

| Concern | Reference (read-only, on `main`) | This plan |
|---|---|---|
| Storage abstraction | `../tabcommand/src/lib/utils/Chrome/Chrome.js` | Port the callback API + default-hydration faithfully |
| Chrome fallback (the thing to replace) | `../tabcommand/src/lib/pages/App/App.jsx` lines using `import * as testChrome from 'sinon-chrome'; if (!global.chrome…) global.chrome = testChrome;` | Replace with the real in-app shim, installed once at entry |
| Storage keys + defaults | `Chrome.js` (`labels`/`uxSettings`/`autoClosed` → `{}`; `activeTabs`/`allUrls`/`previousLabels` → `[]`; `previousLabels` timestamp-stripping) | Reproduce exactly |
| Seed adapter | editor's embedded `localStorage` adapter (`historical-adapters/v1/localStorage.ts`) | Install as `.codeyam/seed-adapter.ts` |

## Production chrome API surface to support (from the reference, test-only `.withArgs`/`.dispatch` excluded)

- **Storage (real, load-bearing):** `chrome.storage.local.get(keys, cb)` (single key string *and* array form), `chrome.storage.local.set(obj)`, `chrome.storage.local.remove(keys)`, `chrome.storage.onChanged.addListener(cb)` / `removeListener(cb)`. Navigation depends on `onChanged` firing on `uxSettings` writes (App re-renders the active page).
- **Actions (no real tabs in preview → safe stubs):** `chrome.tabs.{create,update,remove,group,ungroup}`, `chrome.tabGroups.{query,update,move}`, `chrome.processes.onUpdatedWithMemory.{addListener,removeListener}`. These are side-effects of close/drag/group actions or live-process listeners; in preview they no-op (and `query`-style calls resolve empty). Process *data* the UI shows comes through seeded storage (`allUrls[*].processes`), not these APIs.

## Key Decisions

- **Keep the callback `Chrome` API, don't rewrite to async.** 14+ components consume
  `Chrome.get(from, keys, cb)` / `Chrome.set(from, updates)` / `Chrome.remove(from, keys)`.
  Preserving that exact signature (including the leading `from` debug-label arg, kept as
  an optional tag) lets every later feature plan port its component close to the
  reference with minimal behavioral risk. "Modernization" here is the build/React/test
  stack and the shim — not churning every storage call site into `await`. Call sites may
  modernize opportunistically; it is not required.

- **The shim is backed by an in-memory map mirrored to `localStorage`, not the
  template's single-key wrapper.** The editor's `templates/.../storage.ts` is a simple
  async single-key get/set; TabCommand needs multi-key callback reads, `onChanged`
  events, and `remove`. So implement a purpose-built shim that (a) on boot reads every
  seeded key out of `window.localStorage` into an in-memory object, (b) serves
  `get`/`set`/`remove` from it, (c) mirrors writes back to `localStorage` and (d)
  dispatches `onChanged` to registered listeners. localStorage is the *seed inlet* and
  the persistence mirror; the in-memory map is the working copy.

- **JSON boundary matches the seed adapter.** The `localStorage` adapter emits
  `localStorage[key] = JSON.stringify(value)`. The shim therefore `JSON.parse`s on read
  and `JSON.stringify`s on mirror-write. `chrome.storage` natively stores objects, so
  the abstraction's consumers still get parsed objects/arrays — the string boundary is
  fully inside the shim.

- **Shim installs only when the real extension `chrome` is absent.** Guard exactly like
  the editor template: `typeof chrome === 'undefined' || !chrome.storage?.local`. In a
  real packaged extension the native `chrome` wins and the shim is inert — so this code
  never changes production-extension behavior. Install it **once at `src/index.jsx`,
  before `App` imports**, so every component sees `window.chrome` already present
  (replacing the original's per-App `global.chrome = sinon-chrome` hack).

- **Action APIs are real no-op stubs, not omissions.** Components call `chrome.tabs.*`
  / `chrome.tabGroups.*` directly during close/drag/group interactions. The shim must
  expose these as callable no-ops (resolving callbacks, returning empty arrays for
  queries) so interactive scenarios don't throw `chrome.tabs is undefined`. They
  intentionally do nothing in preview — there are no OS tabs to manipulate.

- **Prove the pipeline visually now, with a throwaway diagnostic.** The App body is
  still the empty foundation shell, so there's no feature UI to show seeded data yet. To
  verify the *whole* seed → localStorage → shim → `Chrome.get` → React path end-to-end
  through codeyam (not just unit tests), render a clearly-marked temporary diagnostic in
  `App-content` that reads through `Chrome.get` and shows counts
  (e.g. "seeded: 3 labels · 5 active tabs · 12 urls"). The `home-and-tabs` plan deletes
  it. This is the cheapest high-signal proof that seeding works, and it directly serves
  the project goal of seeing app states in codeyam.

## Implementation

### 1. Port the `Chrome` abstraction

`src/lib/utils/Chrome/Chrome.js` (+ `index.js` re-export, matching the reference layout).
Faithful port of `../tabcommand/src/lib/utils/Chrome/Chrome.js`:

- `get(from, keys, callback)` — calls `chrome.storage.local.get(keys, results => …)`,
  then applies default hydration before invoking `callback`:
  - For `labels`, `uxSettings`, `autoClosed`: if requested (key === name, or name in the
    keys array) and missing/falsy → default `{}`.
  - For `activeTabs`, `allUrls`, `previousLabels`: same, default `[]`.
  - `previousLabels`: filter out falsy entries and `delete entry.timestamp` on each
    (reproduce verbatim).
- `set(from, updates)` — `chrome.storage.local.set(updates)`.
- `remove(from, keys)` — `chrome.storage.local.remove(keys)`.

Keep behavior byte-for-byte; this module is the contract every feature plan builds on.

### 2. In-app chrome shim

`src/lib/utils/chromeShim/chromeShim.js` (+ `index.js`):

- `export function installChromeShim()` — if `typeof chrome !== 'undefined' &&
  chrome.storage?.local`, return immediately (real extension; do nothing). Otherwise set
  `globalThis.chrome` to the shim object.
- **store**: on install, build the in-memory `store` by scanning `window.localStorage`:
  for each known TabCommand key present, `JSON.parse` its value into `store[key]`.
  (Unknown keys ignored.)
- **`storage.local`**:
  - `get(keys, cb)` — accept a `string`, `string[]`, or `null`/`undefined` (all). Return
    a results object of the requested keys present in `store`. Call `cb(results)`
    asynchronously (microtask) to match Chrome's async callback contract.
  - `set(obj, cb?)` — merge into `store`, mirror each key to `localStorage`
    (`JSON.stringify`), dispatch `onChanged` with `{ [key]: { newValue, oldValue } }` and
    `areaName === 'local'`, then `cb?.()`.
  - `remove(keys, cb?)` — delete from `store` + `localStorage`, dispatch `onChanged`,
    `cb?.()`.
  - `clear(cb?)` — empty `store` + remove mirrored keys.
- **`storage.onChanged`**: `addListener(fn)` / `removeListener(fn)`; internal `_dispatch`
  invoked by set/remove with `(changes, 'local')`.
- **action stubs** (callable no-ops):
  - `tabs`: `create(_, cb?) → cb?.({})`, `update(_, __, cb?) → cb?.()`,
    `remove(_, cb?) → cb?.()`, `group(_, cb?) → cb?.(0)`, `ungroup(_, cb?) → cb?.()`,
    `query(_, cb?) → cb?.([])`.
  - `tabGroups`: `query(_, cb?) → cb?.([])`, `update(_, __, cb?) → cb?.({})`,
    `move(_, __, cb?) → cb?.({})`.
  - `processes`: `onUpdatedWithMemory: { addListener(){}, removeListener(){} }`.
  - `runtime`: `getURL(p) → p` (popup/launcher parity; harmless in preview).

Known-keys constant lives next to the shim and is shared with the `Chrome` abstraction's
default lists so the two never drift: `['labels','uxSettings','autoClosed','activeTabs',
'allUrls','previousLabels']`.

### 3. Install at entry, remove the old fallback

`src/index.jsx`: `import { installChromeShim } from './lib/utils/chromeShim';` and call
`installChromeShim();` **before** importing/rendering `App`. The reference's
`sinon-chrome` fallback inside `App.jsx` is **not** reproduced — the shim replaces it,
and `sinon-chrome` stays a dev-only test dependency (see step 5).

### 4. codeyam seed adapter

- Install the editor's `localStorage` seed adapter as `.codeyam/seed-adapter.ts` (run
  `codeyam-editor editor refresh-seed-adapter`, or `editor init` re-detection now that
  `chrome.storage` usage exists; verify the file lands and carries the version marker).
  `.codeyam/stack.json` already points `commands.seedAdapter` at it.
- Confirm the adapter's `transformSeed` maps a seed like
  `{ labels: {...}, activeTabs: [...], allUrls: {...}, uxSettings: {...} }` to
  `{ localStorage: { labels: "<json>", activeTabs: "<json>", … } }`. No adapter code
  changes expected — TabCommand's top-level keys are exactly its model.

### 5. Tests (test-first, Vitest + RTL; reproduce the reference's storage-test intent)

- `src/lib/utils/Chrome/Chrome.test.js` — using `sinon-chrome` as the underlying
  `chrome` (as the reference tests do): defaults hydrate (`labels`→`{}`,
  `activeTabs`→`[]`, etc.); requested-but-present keys pass through; `previousLabels`
  strips `timestamp` and drops falsy entries; `set`/`remove` delegate correctly.
- `src/lib/utils/chromeShim/chromeShim.test.js` — install on a jsdom `window` with no
  `chrome`: seeded `localStorage` hydrates the store; `get` returns seeded values
  (string/array/all forms); `set` mirrors to `localStorage` and fires `onChanged` with
  `areaName 'local'`; `remove` clears + fires; action stubs are callable and no-op;
  install is inert when a real `chrome.storage.local` exists.
- Every `it()` gets its `//` description comment (project convention).

### 6. Temporary seed-proof diagnostic

- In `src/lib/pages/App/App.jsx`, replace the static "modern rebuild in progress"
  placeholder with a small component that, on mount, `Chrome.get`s
  `['labels','activeTabs','allUrls']` and renders a one-line summary of counts. Mark it
  with an obvious `{/* TEMPORARY: removed in home-and-tabs plan */}` comment. No styling
  beyond legible text. (When storage is empty it reads "seeded: 0 labels · 0 active tabs
  · 0 urls" — which also documents the empty state.)

### 7. Seeded scenario

- Author one application scenario (e.g. slug `seeded-storage-smoke`, url `/`) whose seed
  populates a few `labels`, `activeTabs`, and `allUrls` entries (shape them from the
  reference's data — read how `Tab`/`Url`/`Label` consume these keys to make the seed
  realistic). Register it and capture. The screenshot should show the diagnostic's
  non-zero counts — proving seed → render works through codeyam.

## Verification (acceptance criteria)

1. `npm test` green, including the new Chrome-abstraction and shim suites.
2. `npm run lint` clean; `codeyam-editor editor verify-build` green.
3. Dev server: with no seed, the app renders "seeded: 0 …" and throws no
   `chrome is not defined` / `chrome.tabs is undefined` errors in the console.
4. The `seeded-storage-smoke` scenario captures a screenshot showing **non-zero** seeded
   counts — confirming the localStorage seed adapter → shim → `Chrome.get` path.
5. `.codeyam/seed-adapter.ts` exists and runs (`npx tsx .codeyam/seed-adapter.ts <file>`
   emits the `{ localStorage: {...} }` JSON).

## Out of scope (later plans)

- Any real feature UI (Tabs/Labels/Search/Load/UrlDetails/ImportExport). The `home-and-tabs`
  plan removes the temporary diagnostic and renders real seeded data.
- Faithful data *semantics* of each key (e.g. how `allUrls`/`activeTabs` relate) — modeled
  as each consuming feature is rebuilt.
- Modernizing `service_worker.js` (it owns the real-extension write side; preview seeds
  storage directly and never runs it).
- The popup-launcher build gap (crxjs drops the classic `popup.js`); tracked separately,
  unrelated to the storage spine.
