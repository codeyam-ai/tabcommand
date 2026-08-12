---
title: "Durable Group Storage"
mode: ui
createdAt: "2026-08-12T11:02:18Z"
source: manual
---

## Summary

TabCommand's groups (the `labels` map) live only in `chrome.storage.local`, which
Chrome destroys whenever it uninstalls the extension — including the implicit
uninstall that happens when an unpacked extension's directory goes missing. On
2026-08-12 this wiped a real user's groups: the extension's LevelDB was recreated
from scratch (`MANIFEST-000001`, `000003.log`), and both `labels` *and*
`previousLabels` — the only backup — were gone. Surviving keys were just
`activeTabs`, `allUrls`, `autoClosed`, `deletedUrls`, `loadDataSource`,
`siteVisits`, `uxSettings`.

This plan makes group data durable across that event by (1) moving `labels` to
`chrome.storage.sync`, which is backed by the user's Google account and restored
on reinstall, (2) pinning the extension ID with a manifest `key` so the unpacked
dev build and the Web Store install stop presenting separate storage partitions,
and (3) removing the build-time footgun where `emptyOutDir: true` deletes the very
directory Chrome has loaded as an unpacked extension.

`previousLabels` deliberately stays in `chrome.storage.local` — see Key Decisions.

## Key Decisions

- **`labels` → sync, `previousLabels` → local.** `previousLabels` is up to ten
  full snapshots of `labels` (`service_worker.js:1189-1198`). `chrome.storage.sync`
  enforces `QUOTA_BYTES_PER_ITEM` = 8,192 and `QUOTA_BYTES` = 102,400, so a
  ten-deep snapshot stack would breach the per-item cap on any non-trivial group
  set and could alone consume the whole area. `labels` is the irreplaceable
  record; `previousLabels` is a local undo convenience. Sync the first, leave the
  second.

- **Storage routing belongs in one table, not at call sites.** Every consumer
  already goes through `Chrome` (`src/lib/utils/Chrome/Chrome.js`, imported by 20
  modules per `.codeyam/deps-index.txt:4`) or the worker's `update()` /
  `getLocalStorage()` (`service_worker.js:735`, `:1216`). Adding a key→area map
  and teaching those three functions to fan out keeps every call site unchanged,
  including mixed-key calls that span both areas.

- **Mixed-key reads and writes must fan out and re-merge.** These are not
  hypothetical: `Chrome.get('ImportExport2', ['labels', 'previousLabels'], …)`
  (`src/lib/pages/ImportExport/ImportExport.jsx:72`) reads across the new area
  boundary, `buildImportUpdates` (`src/lib/utils/importExport.js:57-80`) returns
  one updates map containing both `url-*` keys and `labels`, and the worker writes
  `update({ labels, activeTabs })` in a single call (`service_worker.js:1348`,
  `:1496`). A naive per-area switch silently drops half of each.

- **Writes must be coalesced before `labels` can live in sync.**
  `recordInGroupTab` ends with an unconditional `update({ labels, … })`
  (`service_worker.js:1496`) and is called per tab from `groupTabs`
  (`:1602`), which the `storage.onChanged` listener invokes (`:1186`) on
  every `activeTabs` change — and `updateActiveTabs()` has 8 call sites driven by
  tab events. Sync enforces `MAX_WRITE_OPERATIONS_PER_MINUTE` = 120 and
  `MAX_WRITE_OPERATIONS_PER_HOUR` = 1800. Writing `labels` unchanged on every tab
  event will hit quota errors within a minute of normal browsing. Local storage
  tolerates this today; sync will not.

- **Use the Chrome Web Store's public key for the manifest `key`.** TabCommand is
  published (`store/tabcommand-0.22.zip`). Generating a fresh keypair would
  stabilize the unpacked ID but leave a store install on a *different* ID with
  different storage — reproducing the same "my groups vanished" experience the
  first time the published build is installed. The store's key gives TabCommand
  one identity and one synced partition everywhere.

- **Sync is durable, not infallible — the migration must be one-way-safe.**
  `chrome.storage.sync` falls back to local-only behavior when the user is signed
  out or has extension sync disabled, and Chrome eventually garbage-collects
  synced data for long-uninstalled extensions. The migration therefore copies
  local → sync and leaves the local `labels` value in place as a read-only
  fallback rather than deleting it, so a sync failure degrades to today's
  behavior instead of losing data.

- **Out of scope, noted for a later plan.** `service_worker.js:775-782` builds
  `allLabelUrlKeys` with `+=` on an array, coercing it to a comma-joined string so
  the subsequent `indexOf` is a substring match rather than an array lookup. It
  errs toward over-protecting label members (no data loss), so it is recorded here
  but not fixed by this plan.

## Implementation

### 1. Declare the key→area routing table

**File**: `src/lib/utils/chromeShim/chromeShim.js`

`KNOWN_KEYS` (`:13-22`) is already the shared source of truth that "the Chrome
abstraction's default lists and the shim's hydration never drift" from. Extend it
into an area-aware map — e.g. export `STORAGE_AREAS` mapping each known key to
`'sync'` or `'local'`, with `labels` the sole `'sync'` entry, plus a
`areaForKey(key)` helper that defaults unknown keys (notably the dynamic
`url-<url>` records) to `'local'`. Keep `KNOWN_KEYS` exported and derived from the
map so existing importers are unaffected.

### 2. Make the `Chrome` abstraction area-aware

**File**: `src/lib/utils/Chrome/Chrome.js`

`get` / `set` / `remove` currently delegate straight to `chrome.storage.local`
(`:10-18`). Rework each to group its keys by `areaForKey` and fan out:

- `set(from, updates)` — partition `updates` into per-area objects, issue one
  `chrome.storage[area].set` per non-empty partition.
- `remove(from, keys)` — same partitioning.
- `get(from, keys, callback)` — issue one read per area involved, merge the
  results into a single object, then apply the **existing** default-hydration and
  `previousLabels` timestamp-stripping rules (`:21-52`) exactly once on the merged
  result, and invoke `callback` once. The single-callback contract must hold for
  the mixed-key read at `src/lib/pages/ImportExport/ImportExport.jsx:72`.

Preserve the leading `from` debug-label argument and the callback signature — the
glossary entry for `Chrome` describes this as "the storage contract every feature
plan's reads build on", and 20 modules depend on it.

### 3. Make the worker's storage helpers area-aware

**File**: `service_worker.js`

- `update(updates)` (`:735-737`) — partition by area and fan out, mirroring
  `Chrome.set`. This covers the mixed writes at `:426`, `:1348`, and `:1496`.
- `getLocalStorage(query, callback)` (`:1216-1226`) — fan out and merge, mirroring
  `Chrome.get`. Consider renaming to `getStorage` since it is no longer
  local-only; it is referenced by name in the glossary
  (`getLocalStorage :: service_worker.js :: tags=worker,ported-verbatim,storage`),
  so update that entry if renamed.
- `chrome.storage.onChanged` listener (`:1172-1198`) — the early return
  `if (areaName !== 'local') return;` must accept `'sync'` for `labels` and
  `'local'` for `activeTabs`. Handle the two areas independently; a single change
  event now carries only one area's keys.
- **Guard the in-memory assignment.** `labels = changes.labels.newValue;` (`:1178`)
  assigns `undefined` when `labels` is removed. `findLabelForUrlKey` is
  null-tolerant by contract (`src/lib/utils/findLabelForUrlKey.js:25`), but the
  bare `labels[group.title]` dereferences at `:1407` and `:1578` are not. Coerce
  to `{}`. Cross-area transitions make an absent `labels` materially more likely
  than it is today.

### 4. Coalesce `labels` writes

**File**: `service_worker.js`

Stop writing `labels` when nothing changed. `recordInGroupTab` (`:1406-1497`)
ends with an unconditional `update({ labels, … })` at `:1496` and is called per
tab from `groupTabs` (`:1602`); make that write conditional on an actual
mutation, following the pattern already used at `:1348`
(`if (changed) update({ … })`). Additionally guard the sync write behind a
shallow equality check against the last-persisted `labels` so a redundant write is
dropped even if a caller is over-eager. This is what keeps the extension under
sync's 120-writes-per-minute ceiling.

### 5. One-time local → sync migration

**New file**: `src/lib/utils/migrateLabelsToSync.js`

Idempotent, runs on worker boot before the existing
`getLocalStorage(['labels', 'activeTabs'], …)` bootstrap (`service_worker.js:1155`):

1. Read `labels` from sync and from local.
2. If sync already holds a non-empty `labels`, do nothing — sync wins.
3. If sync is empty and local has groups, write local's `labels` to sync.
4. Leave the local `labels` value in place as a fallback (see Key Decisions); do
   not `remove` it.
5. Record the outcome via the existing `groupingLog` breadcrumb helper
   (`src/lib/utils/groupingLog.js`) so the migration is auditable the same way
   group mutations already are.

The bootstrap read must then resolve `labels` from sync with local as fallback.

### 6. Quota guard and user-visible warning

**Files**: `src/lib/utils/migrateLabelsToSync.js` (or a sibling helper),
`src/lib/pages/ImportExport/ImportExport.jsx`

Before any sync write of `labels`, measure the serialized byte length. If it
exceeds ~7KB (a margin under the 8,192-byte `QUOTA_BYTES_PER_ITEM`), fall back to
writing `labels` to local and surface a warning on the Import/Export page telling
the user their groups are too large to sync and recommending an export. Silent
truncation or a swallowed `chrome.runtime.lastError` is the one outcome worse than
today's behavior, because it would look like it worked.

Also handle `chrome.runtime.lastError` on every sync write by falling back to a
local write, so a throttled or quota-exceeded sync never drops a group mutation.

### 7. Pin the extension ID

**File**: `manifest.json`

Add a top-level `"key"` field containing TabCommand's Chrome Web Store public key
(base64, no PEM header/footer).

**Input required from the user:** the public key must be copied from the Chrome
Web Store developer dashboard for the published TabCommand item — it cannot be
derived from the repo. This step is blocked until that value is supplied.

Two consequences to carry into the release notes:

- Adding the key changes the current unpacked extension's ID one final time,
  repartitioning storage. Export groups via the Import/Export page **before**
  loading the rebuilt extension, and re-import after.
- Once keyed, the unpacked build and a Web Store install share an ID and cannot
  both be loaded at once; Chrome will refuse the second.

### 8. Stop the build from deleting the loaded extension directory

**File**: `vite.config.mjs`

`build.outDir` is `build` with `emptyOutDir: true` (`:14-16`), so every
`npm run dev` and `npm run build` deletes and recreates the directory Chrome has
loaded. If Chrome reads it mid-rewrite it uninstalls the extension, taking
`chrome.storage.local` with it — the proximate cause of the incident.

Build to a scratch directory and sync the result into a stable
`dist-extension/` that is created once and never deleted wholesale, so the
directory Chrome watches always exists and always contains a valid `manifest.json`.
Update `README.md` / `CONTRIBUTING.md` load instructions to point at the new
directory, and add it to `.gitignore`.

## Reused existing code

- `Chrome` from `src/lib/utils/Chrome/Chrome.js` (glossary entry: `Chrome`,
  tags `utility,storage,ported-verbatim`) — extended in place; its
  `get/set/remove` signature and default-hydration rules are preserved verbatim.
- `KNOWN_KEYS` and `createChromeShim` from
  `src/lib/utils/chromeShim/chromeShim.js` (glossary entries: `createChromeShim`,
  `installChromeShim`) — `KNOWN_KEYS` becomes the basis of the area map; the shim
  must model both areas so dev-server behavior matches the extension.
- `update`, `getLocalStorage`, `groupTabs`, `handleActiveTabsGroupChanges` from
  `service_worker.js` (glossary entries of the same names, tags
  `worker,ported-verbatim,storage` / `tab-groups,labels`).
- `buildImportUpdates`, `sortLabels`, `resolveLabelUrls` from
  `src/lib/utils/importExport.js` (glossary entries: `sortLabels`,
  `resolveLabelUrls`) — the existing export/import path is the recovery mechanism
  the migration warns users toward; no change to its JSON shape.
- `groupingLog` from `src/lib/utils/groupingLog.js` and `groupRemovalLog` from
  `src/lib/utils/groupRemovalLog.js` — existing capped-array breadcrumb helpers;
  reuse for migration and quota-fallback breadcrumbs rather than adding a new log.
- `findLabelForUrlKey` from `src/lib/utils/findLabelForUrlKey.js` — the single
  resolver for "which label claims this urlKey", added by the tab-strip fix. It
  reads `labels` from both `service_worker.js:634` and `:1619`, so it is a
  consumer of the newly synced key; it is already null-tolerant on both arguments
  and needs no change.

**Existing-implementation survey.** There is no existing storage-area abstraction,
no key→area routing, no quota accounting, and no migration or schema-version
runner anywhere in the extension. `chrome.storage.sync` and `chrome.storage.session`
appear nowhere in the codebase — every read and write is `chrome.storage.local`.
There is no `chrome.runtime.onInstalled` or `onStartup` handler to hang a migration
off, which is why Section 5 hooks the existing worker-boot read instead. The
`"storage"` permission in `manifest.json:5` already covers the sync area; no new
permission is required (`unlimitedStorage` does not raise sync quotas and must not
be added in the belief that it does).

**Test coverage in the affected area** (from `.codeyam/test-registry.json`):
`service_worker.test.js` has 139 registered tests, `src/lib/utils/importExport.test.js`
14, `src/lib/utils/chromeShim/chromeShim.test.js` 12, and
`src/lib/utils/Chrome/Chrome.test.js` 7. That last file's cases assert
`chrome.storage.local.set` / `.get` / `.remove` delegation directly (`:67-75`) and
will need updating to the fan-out contract — that is expected churn, not a
regression.

## Scenarios to Demonstrate

- **Groups survive a simulated uninstall** — populated `labels` in sync, local
  area cleared, worker reboots and renders every group.
- **First-run migration** — local holds groups, sync is empty; after boot both
  hold them and the UI is unchanged.
- **Migration no-ops when sync already wins** — sync and local hold *different*
  group sets; sync's set is the one that renders and local is not copied over it.
- **Mixed-area read** — the Import/Export page loads `labels` (sync) and
  `previousLabels` (local) in one `Chrome.get` and renders both sections.
- **Mixed-area write** — an import writes `url-*` records to local and `labels` to
  sync from one `buildImportUpdates` map; nothing is dropped.
- **Oversized group set** — `labels` serializes past 7KB; the write falls back to
  local and the Import/Export page shows the "too large to sync" warning.
- **Sync unavailable** — sync writes fail with `chrome.runtime.lastError`; group
  edits still persist locally and the user sees no data loss.
- **Write coalescing under tab churn** — rapid tab open/close/move events that do
  not mutate `labels` produce zero sync writes.
- **Empty state** — no groups in either area; the app renders its normal empty
  state and the migration writes nothing.
- **Rename collision** — a group renamed to an existing title, exercising the
  delete-and-recreate path in `src/lib/components/LabelForm/LabelForm.jsx:43-55` across the new area boundary.