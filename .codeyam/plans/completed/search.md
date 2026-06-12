---
title: "Search + SearchResults (minisearch)"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

Fifth plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`). Builds the sidebar **Search** box and its **SearchResults**
overlay — full-text search over labels and labeled URLs via `minisearch`, with
keyboard navigation. Removes the `Search` sidebar stub.

Also ports the two small input utilities Search depends on — `KeyDown` and `event`
— which aren't in the modern tree yet.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| Search box + indexing | `../tabcommand/src/lib/components/Search/Search.jsx` (+ `.css`) | Full port; remove stub |
| Results overlay | `../tabcommand/src/lib/components/SearchResults/SearchResults.jsx` (+ `.css`) | Full port |
| Key handling | `../tabcommand/src/lib/utils/KeyDown.js`, `event.js` (+ barrel `utils/index.js`) | Port |

## How Search works (reproduce)

- Builds a `minisearch` index (`fields: labelTitle, urlTitle, url, notes`;
  `storeFields` incl. `color`, `favicon`, `urlLabelTitle`; boosts labelTitle/urlTitle/notes).
- Index source: `labels` map → one doc per label (`id: "label-<title>"`,
  `color: label.backgroundColor`) + one doc per URL in each label's `urlKeys`
  (fetched as per-URL storage objects → `urlTitle`, `url`, `favicon`, `notes`).
- Re-indexes on `onChanged` for `labels`, and when a labeled URL's `notes` change.
- Typing runs `search(query, {prefix:true})`, segmented into `labels` vs `urls`
  (urls capped at 10). The `SearchResults` overlay renders **Groups**, **Grouped URLs**
  (favicon + title, with a notes snippet when the match is in notes), and an **Archived
  URLs** search affordance (an `alert` stub in the reference — keep).
- Keyboard: `Cmd/Ctrl+F` focuses the box; `Escape` closes; `ArrowUp/Down` move the
  selection; `Enter` activates. Activate → label: set `uxSettings.selectedLabel` + go
  Home; url: activate the matching `activeTabs` tab (`chrome.tabs.update`) or open a new
  one (`chrome.tabs.create`) — shim no-ops in preview. Edit (pencil) → `uxSettings.page =
  {name: URL, urlKey}`.

## Key Decisions

- **Port `KeyDown` + `event` utils now.** Search (and the reference App's Escape-to-Home)
  use a tiny `KeyDown` pub/sub over a global keydown listener, plus an `event()` helper
  that builds synthetic key events for `KeyDown.trigger`. Port both into
  `src/lib/utils/` and extend the `utils/index.js` barrel. Keep the API identical so
  `SearchResults`' arrow/enter handling and `Cmd+F` focus reproduce exactly.

- **Search index reads through the shim like everything else.** No new storage keys;
  Search consumes `labels` + the per-URL objects already seeded for the Home plans. This
  means a scenario that seeds labeled URLs (from `labels-and-dnd`) makes Search
  immediately functional.

- **Capturing "results visible" is an interaction, not seedable state.** The query lives
  in component state, not storage — so a populated results overlay can't be produced by
  seeding alone. If the editor's scenario interaction support can run a pre-capture
  action (focus `#Search-Input`, type a query), author a `search-active` scenario that
  does so. If not, capture the resting search box and rely on the unit tests for the
  results/keyboard behavior; document the limitation in the scenario notes rather than
  faking a results DOM.

- **`alert`-based "Archived URLs" search stays a stub.** The reference's archived-search
  is an `alert` placeholder; reproduce it verbatim (with the `no-alert` disable). A real
  archived search is not part of TabCommand's shipped behavior.

## Implementation

1. **Utils**: port `src/lib/utils/KeyDown.js` + `event.js`; add to `utils/index.js`.
2. **`SearchResults`**: full port (sections, keyboard nav via `KeyDown`, click/edit
   handlers, notes-snippet highlighting). `PropTypes` retained.
3. **`Search`**: full port (minisearch index build + `onChanged` re-index, input box,
   overlay + `#BackgroundOverlay` close). Replace the stub; re-export from the barrel.
4. **Wire into App sidebar** (already references `<Search/>`).
5. **Seeds**: ensure a scenario seeds labeled URLs (reuse `labels-populated`); optionally
   `search-active` (interaction) per the decision above.
6. **Tests** (Vitest + RTL):
   - `Search.test.jsx`: indexes seeded labels/urls; a query returns segmented
     labels/urls; re-index on `labels` change.
   - `SearchResults.test.jsx`: renders Groups / Grouped URLs / Archived sections; "No
     Results" empty state; Arrow/Enter selection moves and activates; edit navigates.
   - `KeyDown.test.js`: add/remove/trigger dispatch; `Cmd+F` path.
   - Each `it()` keeps its `//` description.

## Verification

1. `npm test` green; lint clean; `editor verify-build` green.
2. Dev server: typing in the search box shows the overlay with matching groups/urls;
   Escape closes; arrows move selection. No `chrome` errors.
3. `search-active` capture (if interaction-supported) shows the populated overlay;
   otherwise the resting box captures cleanly and the behavior is unit-tested.

## Out of scope

- `LoadMeter`/`Load` (`load-meter`), `UrlDetails` (`url-details`), `ImportExport`
  (`import-export`). `Closer`/`service_worker.js`; the crxjs popup.js build gap.
