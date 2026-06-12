---
title: "Import / Export — backup & restore groups"
mode: frontend
createdAt: "2026-06-12T00:00:00Z"
source: manual
---

## Summary

Eighth plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`). Builds the **`ImportExport`** page (`Pages.IMPORTEXPORT`) — the
recover/backup view reached from the sidebar "Import/Export" link. It serializes the
user's groups (labels + their member URLs) to JSON for **Export**, shows prior snapshots
under **Previous**, and parses pasted JSON to **Import** (restore) groups. Replaces the
`Pages.IMPORTEXPORT` "Coming soon" placeholder in `App`.

The sidebar link already navigates here (`changePage(Pages.IMPORTEXPORT)`), so this plan
is: build the page + render it with the `onComplete` callback.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| The import/export page | `../tabcommand/src/lib/pages/ImportExport/ImportExport.jsx` (+ `.css`) | Full port; replace placeholder |
| Its tests | `../tabcommand/src/lib/pages/ImportExport/ImportExport.test.jsx` | Port/adapt to Vitest + RTL |
| Where it mounts | `../tabcommand/src/lib/pages/App/App.jsx` (`page.name === Pages.IMPORTEXPORT`) | `<ImportExport onComplete={() => changePage(Pages.HOME)} />` |

## Data model (see MODERNIZATION.md "Data model")

- Reads `Chrome.get(['labels', 'previousLabels'])`.
- **Export ("Current")** — `Object.values(labels)` sorted by `title` then `position`; for
  each label, resolve every `urlKey` via `Chrome.get(label.urlKeys)` into a `urls: [{ url,
  title, favicon, notes? }]` array, `delete label.urlKeys`, and `JSON.stringify` the
  result into the read-only Export textarea.
- **`previousLabels`** — an array of prior `labels`-map snapshots; each is run through the
  same sort+resolve and rendered as a read-only "Previous" textarea (most-recent-first).
- **Import** — `JSON.parse` the pasted array; for each label rebuild `urlKeys` and write a
  per-URL object `{ url, title, favicon, notes? }` for every entry, then
  `Chrome.set({ ...urlObjects, labels })`; `JSON.parse` failure is swallowed with
  `console.log("Error Importing", e)` (faithful — no user-facing error). Calls
  `onComplete()` at the end.
- `goHome` sets `uxSettings.page = { name: Pages.HOME }`.

### Seed nuance (load-bearing for a faithful Export capture)

The export reads **`urlInfo.url`** off each per-URL object. The canonical per-URL shape
(`{ title, favicon, notes?, processes }`) has **no `url` field** — only `UrlDetails`'s save
writes one. So for the Export textarea to render complete entries in a capture, the
`import-export` scenario must seed each referenced per-URL object **with an explicit
`url`** (e.g. `"url": "https://github.com/codeyam/tabcommand"`). Without it, `JSON.stringify`
drops the `url` key and the export shows entries missing their URL. Call this out in the
scenario; it is the one place the data model needs the extra field.

## Key Decisions

- **Drop the `PropTypes` block.** No `prop-types` dependency in the modern stack; keep the
  plain `({ onComplete })` signature.
- **Port the async resolve faithfully.** The reference resolves URL objects via nested
  `Chrome.get` callbacks (`sortAndStuff`). Reproduce the callback structure as-is; the
  `Chrome` wrapper is the same callback-based abstraction in the modern build.
- **Keep `stopPropagation` on the textareas' `onKeyDown`.** Prevents the global Esc/Search
  key handlers from firing while pasting/editing — reproduce verbatim.
- **`HomeFilled` icon only.** `@ant-design/icons` is already a dependency. No dead imports
  in this reference file.

## Implementation

### 1. Page component (full port)

- `src/lib/pages/ImportExport/ImportExport.jsx` (+ `ImportExport.css` ported from
  reference): the home link, the description block, the Import textarea + button
  (`saveImport`), and the Export "Current" + "Previous" read-only textareas. Port
  `sortAndStuff`, `saveImport`, `goHome` as written (minus PropTypes).
- `src/lib/pages/ImportExport/index.js` re-export; add
  `export { ImportExport } from './ImportExport'` to the pages barrel.

### 2. App wiring

`src/lib/pages/App/App.jsx`: replace the `Pages.IMPORTEXPORT` `ComingSoon` placeholder
with `<ImportExport onComplete={() => changePage(Pages.HOME)} />`.

### 3. Scenario (register + capture)

- `import-export` — seed `uxSettings = { page: { name: "ImportExport" } }`, a `labels` map
  of 2–3 groups (`backgroundColor`/`position`/`urlKeys`), the referenced per-URL objects
  **including `url`** (and one with `notes`), and a `previousLabels` array of 1–2 prior
  snapshots (each a labels map whose `urlKeys` also resolve to seeded URL objects). Capture
  shows the Export "Current" textarea populated with sorted JSON and one or more "Previous"
  blocks. Register with the top-level `localStorage` shape (pre-stringified values).

### 4. Tests (Vitest + RTL)

- Export: seeded `labels` serialize into the Current textarea — sorted by title/position,
  `urlKeys` resolved to `urls`, `notes` preserved when present.
- Previous: each `previousLabels` snapshot renders its own read-only textarea.
- Import: pasting a valid labels-array JSON + clicking Import writes the rebuilt `labels`
  plus a per-URL object per entry, and calls `onComplete`.
- Import of malformed JSON is swallowed (no throw, no write).
- Each `it()` keeps its `//` description.

## Verification

1. `npm test` green; `npm run lint` clean; `editor verify-build` green.
2. `import-export` capture shows the Current export JSON populated (with URLs, via the
   seeded `url` field) and the Previous snapshot(s).
3. Dev server: sidebar "Import/Export" opens this page; pasting a valid export and clicking
   Import restores the groups and returns Home (`onComplete`). No console errors beyond the
   intentional `console.log` on a bad-JSON import.

## Preview limits / out of scope

- The Import textarea is empty in the seeded capture (import is an interaction); the
  malformed-JSON path is `console.log`-only.
- `UrlDetails` (`url-details`) supplies the `url`/`notes` write path that Export reads; it
  is a sibling plan, but `import-export` does not depend on it landing first (the scenario
  seeds the fields directly).
- `Search` (`search`, queued) and the capstone (`scenarios-and-seeding`) are separate.
- `Closer` + `service_worker.js` remain deferred (runtime, not UI).
