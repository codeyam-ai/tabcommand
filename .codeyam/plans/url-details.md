---
title: "URL Details — edit & annotate a single URL"
mode: frontend
createdAt: "2026-06-12T00:00:00Z"
source: manual
---

## Summary

Seventh plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`). Builds the **`UrlDetails`** page (`Pages.URL`) — the full-screen
form for editing one saved URL: its title, url, favicon, **notes**, and its group
memberships. This replaces the `Pages.URL` "Coming soon" placeholder in `App`.

Navigation **into** this page already exists: the modern `Url` row's edit/pencil action
(`Url.jsx` `editUrl`) writes `uxSettings.page = { name: Pages.URL, urlKey }`, and `App`'s
storage listener already propagates the full `page` object (including `urlKey`) into its
`page` state. So this plan is purely: build the page component + render it.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| The edit form page | `../tabcommand/src/lib/pages/UrlDetails/UrlDetails.jsx` (+ `.css`) | Full port; replace placeholder |
| Its tests | `../tabcommand/src/lib/pages/UrlDetails/UrlDetails.test.jsx` | Port/adapt to Vitest + RTL |
| Where it mounts | `../tabcommand/src/lib/pages/App/App.jsx` (`page.name === Pages.URL`) | Wire `<UrlDetails urlKey={page.urlKey} />` |

## Data model (see MODERNIZATION.md "Data model")

- Reads `Chrome.get([urlKey, 'labels'])`. State seeds `url` from `urlKey.replace('url-','')`,
  then overlays the stored per-URL object (`title`, `favicon`, **`notes`**) and `labels`.
- **`notes`** is a new optional string field on the per-URL object
  (`{ title, favicon, notes?, processes }`). This page is the only writer of `notes`.
- `urlLabels` is **derived, not stored**: the titles of every label whose `urlKeys`
  contains this `urlKey`. Rendered as removable "Groups" chips.
- **Save replaces the per-URL object** with `{ title, url, favicon, notes? }` (notes only
  when non-empty) and writes back `labels`, then returns Home. **Faithful-repro caveat:**
  the reference's save **drops `processes`** from the object (it writes only the four form
  fields). Reproduce as-is — do not "fix" it; it's reference behavior and irrelevant to
  seeded captures. Leave a `// Stack/ref assumption:` comment naming the drop.
- `goHome` deletes `uxSettings.urlKey` and sets `uxSettings.page = { name: Pages.HOME }`.
- Removing a group chip splices this `urlKey` out of that label's `urlKeys` (behind a
  `confirm(...)`), updating local `labels` state (persisted on Save).

## Key Decisions

- **Drop the `PropTypes` block.** The modern stack has no `prop-types` dependency (the
  modern `Url`/`Labels` components omit it). Remove the `import PropTypes` + `propTypes`
  assignment; keep the plain `({ urlKey })` signature.
- **Exclude the dead `ChromeOutlined` import.** The reference imports it from
  `@ant-design/icons` but never renders it. Port only the icons actually used:
  `HomeFilled` (home link) and `CloseCircleOutlined` (chip remove). `@ant-design/icons`
  `^4.5.0` is already a modern dependency (used by `Url`).
- **Keep `confirm`/`stopPropagation` faithfully.** The group-chip removal `confirm(...)`
  and the `onKeyDown`/`onClick` `stopPropagation` guards (which keep the global Esc/Search
  key handlers from firing while typing) are reproduced verbatim, with the same
  `// eslint-disable-line no-alert` where the reference has it.
- **Reuse the existing navigation.** Do **not** add a new entry point — `Url.editUrl`
  already routes here. This plan only consumes `page.urlKey`.

## Implementation

### 1. Page component (full port)

- `src/lib/pages/UrlDetails/UrlDetails.jsx` (+ `UrlDetails.css` ported from reference):
  the `({ urlKey })` form — Title / Url / Favicon inputs, Notes `<textarea>`, the Groups
  chip row, Save (`handleSubmit`) and Cancel (`goHome`). Port `setPartialState`,
  `handleChange`, `handleSubmit`, `goHome`, `handleLabelClick` as written (minus
  PropTypes / dead import).
- `src/lib/pages/UrlDetails/index.js` re-export; add `export { UrlDetails } from './UrlDetails'`
  to the pages barrel (`src/lib/pages/index.js`).

### 2. App wiring

`src/lib/pages/App/App.jsx`: replace the `Pages.URL` `ComingSoon` placeholder with
`<UrlDetails urlKey={page.urlKey} />`. (`App` already carries `urlKey` in `page` via the
`uxSettings.page` listener — confirm, don't re-plumb.)

### 3. Scenario (register + capture)

- `url-details-edit` — seed `uxSettings = { page: { name: "Url", urlKey: "url-https://…" } }`
  plus that URL's object **with a `notes` value** and a `labels` map where one or two
  labels include this `urlKey` (so the Groups chips render). Capture shows the populated
  edit form (title/url/favicon/notes filled, group chips present). Use the top-level
  `localStorage` register shape (pre-stringified values) — a `seed:{}` block hits the DB
  "array of row objects" validator and rejects map-shaped keys (see MODERNIZATION.md).

### 4. Tests (Vitest + RTL)

- Renders the seeded `title`/`url`/`favicon`/`notes` into the form fields.
- Renders a Groups chip per label that contains this `urlKey`; none when unlabeled.
- Editing `notes` + submitting writes `{ [urlKey]: { title, url, favicon, notes } }` and
  navigates home (`uxSettings.page.name === 'Home'`, `urlKey` cleared).
- Submitting with empty notes omits the `notes` key.
- Each `it()` keeps its `//` description.

## Verification

1. `npm test` green; `npm run lint` clean; `editor verify-build` green.
2. `url-details-edit` capture shows the form populated with the seeded notes + group chips.
3. Dev server: from Home, hovering a `Url` row → Edit pencil opens this page for that URL;
   Save returns Home with the edits persisted; Cancel returns Home unchanged. No
   `chrome`/console errors.

## Preview limits / out of scope

- The group-chip `confirm(...)` and the Save-drops-`processes` behavior are
  interaction-time only — neither affects the seeded capture.
- `Search` (`search`, still queued) and the capstone scenario round-out
  (`scenarios-and-seeding`) are separate plans.
- `Closer` auto-close engine + `service_worker.js` remain deferred (runtime, not UI).
