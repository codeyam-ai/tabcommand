---
title: "Foundation: Vite + React 18 + MV3 extension shell"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

This is the first plan in a ground-up, modern reproduction of **TabCommand**, a
Manifest V3 Chrome extension. The original 2022 implementation lives untouched on
the `main` branch at `../tabcommand/` and is the **reference spec** for every plan
in this series — read it, reproduce its behavior, do not import its build tooling.

The original is built with Create React App (`react-scripts` 4.0.1, React 17) and
only runs under Node's `--openssl-legacy-provider` shim. This plan stands up a
clean modern foundation in its place and **nothing else**: a buildable, loadable
MV3 extension whose React app renders an empty shell. No TabCommand features yet —
those arrive in later plans (storage layer, Home/Tabs, Labels/drag-drop, Search,
Load, UrlDetails, ImportExport, scenarios). The bar for "done" here is: the
extension builds to `build/`, loads in Chrome, the dev server serves the app for
codeyam to load in an iframe, one smoke test passes, and the lint/type gates are
green.

The deliverable is the modern equivalent of the original's *plumbing* — entry
point, manifest, background service worker, popup launcher, static assets, test
harness — with an intentionally empty app body.

## Reference map

The reference implementation to reproduce (read-only, on `main`):

| Concern | Reference file(s) | This plan |
|---|---|---|
| Extension manifest | `../tabcommand/public/manifest.json` | Port verbatim (MV3, same permissions/action/icons) |
| Background engine | `../tabcommand/public/service_worker.js` (667 lines) | Port verbatim as a static background script — **do not modernize/rewrite here** |
| Popup launcher | `../tabcommand/public/popup/{popup.html,popup.js,popup.css}` | Port verbatim (opens the app in a pinned tab) |
| Icons / favicon | `../tabcommand/public/assets/`, `../tabcommand/public/favicon.ico` | Copy verbatim |
| React entry | `../tabcommand/src/index.js` | Recreate with React 18 `createRoot` |
| HTML host | `../tabcommand/public/index.html` | Recreate as Vite root `index.html` (Roboto + Font Awesome links preserved) |
| App body | `../tabcommand/src/lib/pages/App/App.jsx` | **Empty shell only** — real port is a later plan |
| Test setup | `../tabcommand/src/setupTests.js` | Recreate for Vitest + RTL |

## Key Decisions

- **Vite + `@crxjs/vite-plugin` for the MV3 build, not CRA.** `@crxjs/vite-plugin`
  (v2, Vite 5) is purpose-built for Manifest V3: it consumes `manifest.json` as the
  build input, wires the background service worker and the popup as entry points,
  copies declared icons, and emits a Chrome-loadable bundle. Output directory is
  `build/` to match the original's load target and the README instruction ("load the
  build folder from the extension manager"). This removes `react-scripts` and the
  `--openssl-legacy-provider` hack entirely.

- **React 18, but no behavior change.** Entry point uses `createRoot` instead of the
  React-17 `ReactDOM.render`, keeping `<React.StrictMode>`. No concurrent-mode
  features are adopted; this is purely the supported React-18 mount path.

- **The background service worker is ported verbatim, not rewritten.**
  `public/service_worker.js` is the real tab/process-monitoring engine that writes
  to `chrome.storage.local`. It is plain vanilla JS with no build step and no React.
  Copy it as a static asset so the *extension* stays functional when loaded in Chrome.
  Its modernization (if ever wanted) is explicitly out of scope. codeyam scenarios
  will seed `chrome.storage.local` directly (a later plan), so the editor preview
  never depends on this worker running.

- **The popup is a launcher, not the UI.** `popup.html`/`popup.js` just open the
  full-page app (`index.html`) in a pinned tab. Port verbatim. The rich UI with the
  "various states" we want to capture in codeyam is the React app at `index.html`.

- **Test stack: Vitest + React Testing Library, replacing enzyme.** The original's
  15 test files use `enzyme` + `@wojtekmaj/enzyme-adapter-react-17`, which has no
  React-18 adapter — enzyme is a dead end on React 18. Vitest is the native runner
  for a Vite project and feeds codeyam's `vitest-json` test runner. This plan only
  establishes the harness and one smoke test; per-component tests are rewritten
  alongside each feature plan (test-first, matching the original's coverage intent).

- **Drag-drop dependency deferred but pre-decided.** The original uses the
  unmaintained `react-beautiful-dnd`. When the Labels/drag-drop plan lands it will
  use `@hello-pangea/dnd` (maintained, React-18-safe, drop-in API). Not installed in
  this foundation plan — no drag-drop code exists yet.

- **ESLint kept, modernized config.** Reproduce a lint gate (the original had
  `eslint` with `eslint-config-google`). Use a current ESLint + the React plugin in a
  flat-config (`eslint.config.js`). Lint is wired as a codeyam `staticChecks` entry so
  the build/advance gates enforce it.

## Implementation

### 1. Project scaffold and dependencies

Create `package.json` for the modern stack (exact versions resolved at build time):

- **runtime**: `react@^18`, `react-dom@^18`, plus the original's still-needed runtime
  deps — `styled-components`, `@ant-design/icons`, `minisearch`, `gradient-path`,
  `tinygradient`, `core-js`. (Carry these forward from
  `../tabcommand/package.json`; drop `react-scripts`, `web-vitals`, `npm-watch`,
  `dotenv`.)
- **build**: `vite@^5`, `@vitejs/plugin-react`, `@crxjs/vite-plugin@^2`.
- **test**: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom`, `sinon-chrome` (still useful for stubbing
  `chrome` in unit tests until the in-app shim from the storage-layer plan exists).
- **lint**: `eslint@^9`, `eslint-plugin-react`, `@eslint/js`, `globals`.

Scripts:

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run --reporter=json",
  "test:watch": "vitest",
  "lint": "eslint ."
}
```

Use **npm** (the original committed both `package-lock.json` and `yarn.lock`; standardize on npm + a fresh `package-lock.json`).

### 2. Vite + crxjs config

Create `vite.config.js`:

- Import `defineConfig` from `vite`, `react` from `@vitejs/plugin-react`, `crx` from
  `@crxjs/vite-plugin`, and the ported `manifest.json` (see step 3).
- `plugins: [react(), crx({ manifest })]`.
- `build: { outDir: 'build', emptyOutDir: true }`.
- `server: { port: 3000, strictPort: true }` — keep the original CRA dev port `3000`
  so codeyam's `start_command`/`port` are stable and human-obvious.

### 3. Manifest

Copy `../tabcommand/public/manifest.json` to the project root as `manifest.json`
(crxjs reads it from the Vite root). Keep it byte-identical except where crxjs needs
relative paths resolved from root:

- `manifest_version: 3`, name/description/version, `permissions`
  (`storage`, `tabs`, `processes`, `tabGroups`).
- `background.service_worker: "service_worker.js"`.
- `action.default_popup: "popup/popup.html"`, `default_icon`, `default_title`.
- `icons` block.

Adjust icon/asset paths only if crxjs requires root-relative references; otherwise
leave verbatim.

### 4. Static assets and background/popup

- Copy `../tabcommand/public/assets/` (icon PNGs) into the project (e.g. `public/assets/`
  or wherever the manifest references them; keep the manifest paths working).
- Copy `../tabcommand/public/favicon.ico`.
- Copy `../tabcommand/public/service_worker.js` to the project root as
  `service_worker.js` — **verbatim**. Declare it in the manifest (step 3). Do not
  bundle it through Vite/React; it must remain a standalone background script.
- Copy `../tabcommand/public/popup/{popup.html,popup.js,popup.css}` to `popup/` —
  **verbatim**. `popup.js` opens `chrome.runtime.getURL("index.html")` in a pinned
  tab; that contract is unchanged.

### 5. HTML host + React 18 entry (empty shell)

- Root `index.html`: recreate `../tabcommand/public/index.html` — preserve the
  Google Fonts (Roboto) `<link>`s and the Font Awesome 4.7 stylesheet `<link>`,
  the `<title>TabCommand</title>`, and `<div id="root"></div>`. Add
  `<script type="module" src="/src/index.jsx"></script>`.
- `src/index.jsx`: React 18 mount —

  ```jsx
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import './index.css';
  import { App } from './lib/pages';

  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  ```

- `src/index.css`: port `../tabcommand/src/index.css` verbatim.
- `src/lib/pages/index.js`: export `App` only for now (later plans add `UrlDetails`,
  `ImportExport`, `Load`).
- `src/lib/pages/App/App.jsx`: **empty shell**. Render the app frame — a root
  `<div className="App">` with the sidebar logo (`../tabcommand/src/images/logo.svg`,
  copied into `src/images/`) and an empty `<div className="App-content">` placeholder
  reading e.g. "TabCommand — modern rebuild in progress". No `chrome.*` calls, no
  Tabs/Labels/Search. The point is a clean, renderable mount that codeyam can load.
- `src/lib/pages/App/App.css`: minimal layout for the sidebar/content frame (can be a
  trimmed port of the original `App.css` covering only `.App`, `.App-sidebar`,
  `.App-content`, `.App-logo`).

### 6. Test harness (Vitest + RTL)

- `vitest.config.js` (or `test` block in `vite.config.js`): `environment: 'jsdom'`,
  `globals: true`, `setupFiles: ['./src/setupTests.js']`.
- `src/setupTests.js`: import `@testing-library/jest-dom`. (No enzyme adapter; no
  drag-drop mock yet — neither is used in the foundation.)
- One smoke test `src/lib/pages/App/App.test.jsx`: render `<App/>` with RTL and assert
  the logo (alt text "TabCommand") is in the document and the content placeholder
  renders. Include the required `//` description comment above the `it()` block per
  the test-description convention.

### 7. ESLint flat config

- `eslint.config.js`: `@eslint/js` recommended + `eslint-plugin-react` recommended,
  `languageOptions` with browser + `chrome` globals (so the ported vanilla
  `service_worker.js`/`popup.js` and future `chrome.*` usage don't trip
  `no-undef`), JSX enabled, React version "detect". Replaces the old
  `.eslintrc.js`/`eslint-config-google`.

### 8. codeyam wiring

- Run `codeyam-editor init` in this worktree to lay down `.codeyam/editor.json`,
  hooks, and skills (greenfield).
- Populate `.codeyam/editor.json`:
  - `project_name: "TabCommand"`,
    `project_description: "Command Central for your browsing experience — a Chrome MV3 extension for monitoring, searching, labeling, and auto-closing browser tabs."`
  - `start_command: "vite --port 3000"` (or `npm run dev`), `port: 3000`.
  - `apps[]`: one `web` app, `dir: "."`, `port: 3000`.
  - `test_runners[]`: vitest — `command: "npx vitest run --reporter=json"`,
    `outputFormat: "vitest-json"`, `match: ["src/**/*.test.jsx", "src/**/*.test.js"]`.
  - `staticChecks[]`: eslint — `command: "npx eslint ."`.
  - `screen_sizes`: `{ Desktop: 1440x900 }` (the app is a full-page tab UI; the popup
    launcher is not a captured surface). `default_screen_size: "Desktop"`.
- Write `.codeyam/stack.json` for a Vite + React app (`stack-from-apps`, or
  `--stack-id` for the closest supported Vite/React id).

## Verification (acceptance criteria)

1. `npm install` succeeds with no `--openssl-legacy-provider` flag anywhere.
2. `npm run build` produces a `build/` directory that loads as an unpacked extension
   in Chrome (manifest valid, service worker registers, popup opens the app tab).
3. `npm run dev` serves the app on `http://localhost:3000` and the empty App shell
   renders (logo + placeholder) with no console errors and no `chrome is not defined`
   crash (the empty shell makes no `chrome.*` calls).
4. `npm test` runs Vitest and the one smoke test passes.
5. `npm run lint` passes clean.
6. `codeyam-editor editor verify-build` is green (eslint static check + vitest runner
   wired).

## Out of scope (explicitly deferred to later plans)

- Any `chrome.storage`/`tabs`/`processes` reads in the app and the in-app chrome shim
  + codeyam seeding (next plan: `chrome-storage-layer`).
- Tabs, Labels, drag-drop, Search, LoadMeter/Load, UrlDetails, ImportExport.
- Rewriting the 15 enzyme tests (done per-feature, test-first, in their feature plans).
- Modernizing `service_worker.js`.
- codeyam scenario authoring/capture.
