---
title: "Labels (groups) + drag-to-organize"
mode: frontend
createdAt: "2026-06-09T00:00:00Z"
source: manual
---

## Summary

Fourth plan in the modern TabCommand reproduction (reference on `main` at
`../tabcommand/`). Fills the empty center of the Home screen with the **Labels**
subsystem — the named groups where users organize tabs — and brings the
**drag-to-organize** interaction to life by implementing the real `onDragEnd`
that `home-and-tabs` left as a no-op stub.

Removes the `Labels` stub and builds `Labels`, `LabelCollection`, `LabelForm`,
`LabelFormContainer`. After this lands, the core TabCommand loop works: tabs on the
right rail, groups in the center, drag a tab into a group to save it.

## The label data model (corrects an earlier seed shape)

`labels` is an **object map keyed by label title** → label object:

```
{ title: string, backgroundColor: string, position: number, urlKeys: string[] }
```

Note **`backgroundColor`** (the field the components read), NOT `color`. The
`home-grouped` / `seeded-storage-smoke` scenarios authored earlier used `color` — this
plan must **re-seed those (and any new) label scenarios with `backgroundColor`**,
`position`, and `urlKeys`. Selection state lives in `uxSettings.selectedLabel`
(a label title); a selected label renders pinned + expanded above the grid.

A `urlKey` listed in a label's `urlKeys` makes that URL appear inside that group
(`LabelCollection` splits its members into active vs. inactive by whether a matching
`activeTabs` entry exists). The legacy `urls` field is read as a fallback
(`urlKeys || urls`) — reproduce that one-line migration guard.

## Reference map

| Concern | Reference (read-only) | This plan |
|---|---|---|
| Groups container + responsive grid | `../tabcommand/src/lib/components/Labels/Labels.jsx` (+ `.css`) | Full port; remove stub |
| One group card | `../tabcommand/src/lib/components/LabelCollection/LabelCollection.jsx` (+ `.css`) | Full port |
| Create/edit form | `../tabcommand/src/lib/components/LabelForm/LabelForm.jsx` (+ `.css`) | Full port |
| "Add Group" wrapper | `../tabcommand/src/lib/components/LabelFormContainer/LabelFormContainer.jsx` (+ `.css`) | Full port |
| Drag reducer | `../tabcommand/src/lib/pages/App/App.jsx` `handleDrag` | Implement as the real `onDragEnd` |

## Key Decisions

- **Implement the real `onDragEnd` now (replaces the home-and-tabs no-op).** Port
  App's `handleDrag`: for `ItemTypes.URL` drops, move the `urlKey` out of the source
  label's `urlKeys` (when the source is a label collection) and into the destination
  label's `urlKeys` at the drop index; if the source was a label and the tab is active,
  call `chrome.tabs.ungroup(...)` (shim no-op in preview). For
  `ItemTypes.LABEL_COLLECTION` drops, reorder by rewriting each label's `position`.
  Persist via `Chrome.set({ labels })`. This is the heart of the app and is now fully
  reproducible because `Tabs` (drag sources) and `Labels` (drop targets) both exist.

- **`@hello-pangea/dnd` is already installed** (home-and-tabs). Use its
  `Droppable`/`Draggable` for the `LABEL_COLLECTION` rows (horizontal) and the per-group
  `URL` lists (vertical), matching the reference's `droppableId`/`draggableId` string
  schemes exactly — `onDragEnd` parses those ids, so they are a contract.

- **Guard the responsive chunking for jsdom.** `Labels` adjusts `chunkLength` (3→1) via
  `window.matchMedia` listeners. jsdom has no `matchMedia`; the reference already guards
  `if (!window.matchMedia) return`. Preserve that guard so unit tests don't throw; the
  responsive behavior is exercised in the real-browser codeyam capture.

- **`confirm`/`alert` interactions stay as-is, flagged.** Delete-group, remove-url, and
  share use `confirm`/`alert` (reference uses `eslint-disable no-alert`). Reproduce
  faithfully with the same disable comments; they're harmless in preview (no capture
  triggers them).

- **Re-seed label scenarios with the correct shape.** Update the existing `home-grouped`
  scenario's seed (and author new ones) to use `backgroundColor`/`position`/`urlKeys`
  so groups render with their colors. This also makes the center of the earlier
  `home-active-tabs`-style captures populate.

## Implementation

### 1. Components (full ports)

- `src/lib/components/LabelForm/` — title input + color swatches from `Colors`; on submit
  writes/renames the label in the `labels` map (default `backgroundColor` =
  `Colors[title.length % Colors.length]`, default `position` = `-keys.length`).
- `src/lib/components/LabelFormContainer/` — the expandable "+ Add Group" wrapper around
  `LabelForm` (with the `#BackgroundOverlay` click-catcher).
- `src/lib/components/LabelCollection/` — group card: colored title bar (click = select via
  `uxSettings.selectedLabel`), menu (edit `LabelForm` + share + delete), a vertical URL
  `Droppable` rendering `Url` rows (active above inactive), empty-state copy, `removeUrl`.
- `src/lib/components/Labels/` — reads `labels` + `uxSettings`; sorts (title then
  `position`); pins `selectedLabel` expanded; chunks the rest into horizontal `Droppable`
  rows of `LabelCollection`; shows the "Add Group" CTA when empty. Replace the stub and
  re-export from the components barrel.

### 2. App `onDragEnd`

`src/lib/pages/App/App.jsx`: replace the stub `onDragEnd` with the ported `handleDrag`
(URL move + LABEL_COLLECTION reorder, persisting `labels`/`activeTabs`). Keep the
`onDragStart` overflow tweak.

### 3. Seeds (re-seed + new)

- Fix `home-grouped` (and any label-bearing scenario) to `backgroundColor`/`position`/`urlKeys`.
- New scenarios: `labels-populated` (several groups with member URLs, mixed active/inactive),
  `labels-selected` (`uxSettings.selectedLabel` set → one group pinned/expanded),
  `labels-empty` (no labels → "Add Group" CTA). Register + capture.

### 4. Tests (Vitest + RTL)

- `LabelForm.test.jsx`: submitting writes a label with derived color/position; editing
  renames (deletes old key).
- `LabelCollection.test.jsx`: renders members; active/inactive split; remove-url updates
  `urlKeys`.
- `Labels.test.jsx`: renders groups from `labels`; selected label pinned; empty → CTA.
- **`onDragEnd` reducer test**: factor the drag logic so the URL-move and
  label-reorder transforms are unit-testable without simulating real DnD (simulating
  `@hello-pangea/dnd` end-to-end is brittle) — assert the resulting `labels` map.
- Each `it()` keeps its `//` description.

## Verification

1. `npm test` green; `npm run lint` clean; `editor verify-build` green.
2. `labels-populated` capture shows colored group cards with member URL rows filling the
   Home center (no empty gap).
3. `labels-selected` capture shows the pinned/expanded selected group.
4. Dev server: dragging a tab row onto a group persists it (urlKey appears in the group);
   reordering groups persists `position`. No `chrome`/DnD console errors.

## Out of scope (later plans)

- `Search`/`SearchResults` (`search`), `LoadMeter`/`Load` (`load-meter`), `UrlDetails`
  (`url-details`), `ImportExport` (`import-export`).
- The `Closer` auto-close engine (runtime; scenarios seed `autoClosed` directly) and
  `service_worker.js`; the crxjs popup.js build gap.
