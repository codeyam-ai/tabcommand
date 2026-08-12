---
title: "A Group Write Is Never Invisible"
mode: ui
createdAt: "2026-08-12T17:50:02Z"
source: manual
---

## Summary

A write to `labels` can succeed on disk and still be invisible to the app, and an
import can fail without saying so. Both produce the same user experience — "I did
the thing and nothing happened" — and both are silent by construction.

`writeByArea` redirects `labels` to the **local** area whenever sync refuses the
write (over the 8,192-byte per-item quota, or signed out / sync disabled /
throttled). But `readByArea` resolves `labels` from **sync only**, because
`areaForKey('labels')` is `SYNC`. The fallback is therefore write-only: the value
is safely on disk in an area nothing ever reads it back from. The user sees their
groups revert. This directly contradicts the stated intent of the fallback — *"a
group mutation is never dropped and the degraded state is visible to the user
rather than silent."*

Separately, `saveImport` swallows every exception into `console.log` and then
navigates away regardless, so a failed import is indistinguishable from a
successful one that did nothing.

## Key Decisions

- **Fix the read, not the write.** The write-side fallback is correct and worth
  keeping: landing the value locally is what stops a group mutation from being
  lost outright. The defect is that `labels` is only ever *read* from sync. The
  read path must be able to see a local fallback value.

- **Sync stays authoritative when both areas hold `labels`.** A local fallback is
  by definition the newer write — it only exists because a sync write was
  refused — but sync is the copy that survives an uninstall, which is the entire
  reason `labels` moved there. Resolving this precedence is the core decision of
  this plan and must be made explicitly rather than falling out of whichever
  `Object.assign` happens to run last in `readByArea`. Whatever the rule, it has
  to be the same one in `readByArea` and in `migrateLabelsToSync`, which already
  answers a version of this question with `decideMigration` (sync wins when it
  `hasGroups`).

- **A degraded write must be visible, not just recorded.** `syncStatus` is
  already written on the fallback paths and already rendered by `SyncWarning` on
  the Import/Export page. That is the right mechanism, but it only helps a user
  who happens to visit that page. A fallback that silently changes where the
  user's groups live is worth surfacing where the groups are.

- **An import that fails must say so, and must not navigate away.** The current
  `catch` logs to a console the user cannot see, and `onComplete()` runs
  unconditionally — so the page closes on failure exactly as it does on success.
  Keeping the user on the page with the pasted text intact is what makes the
  failure recoverable.

- **The import parsing itself is not broken.** A full round trip through
  `sortLabels` → `resolveLabelUrls` → `buildImportUpdates` reproduces the correct
  `labels` map and `url-*` records for a well-formed export. Do not "fix" the
  parser; add the error surface, and let a real failing payload tell you whether
  anything else is wrong.

## Implementation

### 1. Let the read path see a local `labels` fallback

**File**: `src/lib/utils/storageAccess.js`

`readByArea` partitions the requested keys by area and merges the per-area
results. For `labels` that means a sync read only, so a value written to local by
the fallback below is never returned. Make the read able to resolve a local
fallback, and apply the precedence rule from Key Decisions when both areas hold a
value.

The single-callback contract must be preserved exactly — the mixed-key read on
the Import/Export page relies on it and would render twice otherwise.

### 2. Keep the write-side fallback, and make it self-healing

**File**: `src/lib/utils/storageAccess.js`

`writeByArea` sends `labels` to local in two cases: `fitsSyncItemQuota` fails
(recorded as `SyncStatus.TOO_LARGE`), or `chrome.storage.sync.set` reports
`chrome.runtime.lastError` (recorded as `SyncStatus.FAILED`). Keep both.

Add the missing other half: once a later write succeeds against sync, a stale
local `labels` left behind by an earlier fallback must not linger and shadow — or
be shadowed by — the sync copy. Clear or reconcile it, so the two areas cannot
drift into a state where the answer depends on which one is read.

### 3. Surface a degraded sync state where the groups are

**Files**: `src/lib/components/SyncWarning/SyncWarning.jsx`,
`src/lib/pages/ImportExport/ImportExport.jsx`

`SyncWarning` already renders the `syncStatus` record and is already placed above
the Export snapshot. Extend its reach so a user whose groups have stopped
reaching sync finds out without navigating to Import/Export — the state means
"your groups are no longer protected from the uninstall this feature exists to
survive," which is worth more than a panel they may never open.

Keep it proportionate: a persistent, dismissible indicator, not a modal on every
group edit.

### 4. Make a failed import visible and recoverable

**File**: `src/lib/pages/ImportExport/ImportExport.jsx`

`saveImport` currently does:

```js
try { Chrome.set('ImportExport1', buildImportUpdates(importLabels)); }
catch (e) { console.log("Error Importing", e); }
if (onComplete) onComplete();
```

Three changes:

1. Render the failure in the UI instead of `console.log` — enough for the user to
   tell "that isn't valid JSON" from "that JSON isn't an export".
2. Only call `onComplete()` on success, so a failed import keeps the user on the
   page with their pasted text intact.
3. Validate the parsed payload's shape before writing. `buildImportUpdates`
   (`src/lib/utils/importExport.js:57-80`) assumes an array of labels each with
   `title` and `urls`; a well-formed JSON document of the wrong shape currently
   produces a partial or empty `labels` map rather than an error.

Confirm success from storage rather than from the absence of an exception —
`Chrome.set` is fire-and-forget, so "no throw" does not mean "written."

## Reused existing code

- `readByArea`, `writeByArea`, `SyncStatus`, `SYNC_STATUS_KEY` from
  `src/lib/utils/storageAccess.js` — the fan-out layer this plan corrects.
- `areaForKey`, `partitionKeysByArea`, `partitionUpdatesByArea` from
  `src/lib/utils/storageAreas.js` — the routing table; `labels` is its only
  `SYNC` entry.
- `fitsSyncItemQuota`, `serializedByteLength` from
  `src/lib/utils/syncQuota.js` — the pre-write measurement driving `TOO_LARGE`.
- `decideMigration`, `hasGroups` from `src/lib/utils/migrateLabelsToSync.js` —
  already encodes a sync-vs-local precedence rule; the read path's rule must
  agree with it rather than invent a second one.
- `SyncWarning` from `src/lib/components/SyncWarning/SyncWarning.jsx` — the
  existing surface for a degraded sync state.
- `buildImportUpdates`, `sortLabels`, `resolveLabelUrls` from
  `src/lib/utils/importExport.js` — verified working; reused unchanged except for
  the shape validation in change 4.
- `Chrome` from `src/lib/utils/Chrome/Chrome.js` (glossary entry: `Chrome`, tags
  `utility,storage,ported-verbatim`) — the contract above `storageAccess`; its
  `get`/`set`/`remove` signature must not change.

**Existing-implementation survey.** There is no readback of a local `labels`
fallback anywhere: `labels` appears exactly once in `STORAGE_AREAS`
(`src/lib/utils/storageAreas.js`) and is mapped to `SYNC`, and `readByArea` has no
special case for it. There is no reconciliation or cleanup of a local `labels`
value after a later successful sync write. `SyncWarning` is rendered from exactly
one place (`src/lib/pages/ImportExport/ImportExport.jsx:126`). No import-error UI
state exists — `saveImport` has no error state variable at all.

**Test coverage.** `src/lib/utils/storageAccess.test.js` and
`src/lib/utils/storageAreas.test.js` cover the fan-out;
`src/lib/utils/migrateLabelsToSync.test.js` covers the precedence rule;
`src/lib/utils/importExport.test.js` has 14 registered tests over the
export/import helpers; `src/lib/pages/ImportExport/ImportExport.test.jsx` covers
the page.

## Reproduction Test

A `labels` write that falls back to the local area is never returned by a
subsequent read, so the mutation is invisible to the app.

**Target**: `src/lib/utils/storageAccess.test.js` — run with
`codeyam-editor editor refresh-tests --test <name>`.

```js
// A labels write redirected to local by the sync fallback must still be
// readable, or the group mutation is silently invisible to the whole app.
it('reads back a labels value that fell back to local', (done) => {
  // Force the fallback: sync.set reports lastError.
  chrome.storage.sync.set = (_updates, cb) => {
    chrome.runtime.lastError = { message: 'sync disabled' };
    cb();
    chrome.runtime.lastError = undefined;
  };

  writeByArea({ labels: { Work: { title: 'Work', urlKeys: [] } } });

  readByArea(['labels'], (result) => {
    expect(result.labels).toEqual({ Work: { title: 'Work', urlKeys: [] } });
    done();
  });
});
```

Status: PROPOSED — confirm red at execution. The stub shape is indicative; use
whatever `src/lib/utils/storageAccess.test.js` already uses to fake
`chrome.storage` and `chrome.runtime.lastError`. Expected failure: `readByArea`
queries only the sync area for `labels`, which never received the value, so
`result.labels` is `undefined` and `toEqual` fails.

## Scenarios to Demonstrate

- Groups edited while sync is unavailable — the change appears immediately and
  persists across a reload.
- Groups too large for sync's per-item quota — the change appears, and the user
  is told their groups are no longer protected.
- Sync recovers after a fallback — groups reconcile to one copy, with no
  resurrection of a stale value from the other area.
- Import a valid export — groups appear, page closes.
- Import malformed JSON — an error is shown, the pasted text is preserved, the
  page stays open.
- Import well-formed JSON of the wrong shape (e.g. an object, or labels with no
  `urls`) — an error is shown, and no partial `labels` map is written.
- Import an empty paste — no write, no error, nothing destroyed.