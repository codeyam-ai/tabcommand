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
  parser.

- **CONFIRMED root cause of the reported failure: a hard-wrapped snapshot.** A
  real user snapshot that silently failed to import was recovered and diagnosed.
  `JSON.parse` rejected it with *"Bad control character in string literal in JSON
  at position 356"* — the text carried **literal newline characters inside string
  values**, each sitting exactly where a space belongs in a page title
  (`"Screen⏎Porch Scope Doc - Google⏎Docs"`). The export itself is valid:
  `ImportExport.jsx:78` builds it with `JSON.stringify`, which escapes newlines as
  `\n` and emits one line. The corruption is introduced *after* export, by any
  medium that hard-wraps long lines — pasting the snapshot into an email, a chat,
  a note, or a document before pasting it back. Replacing the stray newlines with
  spaces made the same snapshot import cleanly: 5 groups, 14 URL records, 1,712
  bytes (well under sync's 8,192-byte cap, so quota was never involved).

  This makes the error surface in change 4 the primary fix — the user was given
  no indication whatsoever — and adds a second, cheap one: a snapshot that fails
  only because it was line-wrapped is mechanically recoverable, and refusing it
  outright makes the user's own backup useless to them.

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

Four changes:

1. Render the failure in the UI instead of `console.log` — enough for the user to
   tell "that isn't valid JSON" from "that JSON isn't an export". Include the
   parser's own message; `JSON.parse` reports a position, which is what made the
   real failure diagnosable.
2. Only call `onComplete()` on success, so a failed import keeps the user on the
   page with their pasted text intact.
3. Validate the parsed payload's shape before writing. `buildImportUpdates`
   (`src/lib/utils/importExport.js:57-80`) assumes an array of labels each with
   `title` and `urls`; a well-formed JSON document of the wrong shape currently
   produces a partial or empty `labels` map rather than an error.
4. **Tolerate a line-wrapped snapshot.** This is the confirmed real-world failure
   (see Key Decisions): raw newlines inside string values, introduced by pasting
   the snapshot through a medium that hard-wraps. The export is always a single
   line from `JSON.stringify`, so a newline inside a string literal is never
   legitimate content — it is always wrap damage, and it always replaced a space.
   On a parse failure, retry once against a repaired copy rather than rejecting
   outright; a user's own backup should not be unusable because it travelled
   through an email client. Recovering silently would be wrong too — say that the
   snapshot was repaired and name what was fixed, so the user learns their stored
   copy is damaged and can save a clean one.

   **The repair set is a fixed, enumerated list — not a lenient JSON parser.**
   Every entry is damage a transport medium inflicts on a `JSON.stringify` export;
   none of them can alter well-formed input, because the export never legitimately
   contains any of them:

   - **Raw newlines inside string literals** (`\n`, `\r`, `\r\n`) → a single
     space. The confirmed failure. The export is one line, so a newline inside a
     string is always wrap damage and always replaced a space.
   - **Raw tabs inside string literals** → a space. Same cause; some clients
     re-indent rather than wrap.
   - **Non-breaking spaces (U+00A0) and zero-width characters** (U+200B/200C/
     200D/FEFF) → a normal space, or dropped. Introduced by HTML rendering and by
     word processors; invisible, so the user cannot see why it failed.
   - **Curly/smart quotes** (U+201C/201D/2018/2019) → straight `"` / `'`. Word
     processors autocorrect these, and they destroy JSON structure rather than
     just string contents — so repairing them is higher-risk and must only run
     when the strict parse has already failed.
   - **Surrounding non-JSON wrapper** — leading/trailing whitespace, and a
     markdown code fence (```` ```json ```` … ```` ``` ````). Pasting a snapshot
     via chat or a doc routinely adds these.

   Deliberately **not** repaired: trailing commas, comments, unquoted keys, or
   single-quoted strings. Those signal hand-edited or hand-authored JSON, not a
   damaged export, and silently accepting them would mean guessing at intent.

   Attempt the strict parse first and only fall back on failure, so an intact
   snapshot never goes down the repair path. If the repaired text still fails,
   report the **original** parse error with its position — the repaired one would
   point at an offset that does not exist in what the user pasted.

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
- Import malformed JSON — an error is shown with the parser's position, the
  pasted text is preserved, the page stays open.
- Import a hard-wrapped snapshot (raw newlines inside titles, as produced by
  pasting an export through an email or chat client) — the groups are restored
  and the user is told the snapshot was repaired, with the fix named. This is the
  confirmed real-world failure; a fixture is available from the recovered user
  snapshot (5 groups, 14 URLs, 1,712 bytes).
- Import a snapshot wrapped in a markdown code fence — restored, repair reported.
- Import a snapshot whose quotes were autocorrected to curly quotes by a word
  processor — restored, repair reported.
- Import a snapshot carrying non-breaking or zero-width spaces — restored; the
  point is that these are invisible, so rejecting without explanation would leave
  the user with no way to see what was wrong.
- Import an intact snapshot — the strict parse succeeds and the repair path never
  runs (no "repaired" message on healthy input).
- Import hand-authored JSON with trailing commas — deliberately NOT repaired; a
  clear error, since that signals hand-editing rather than transport damage.
- Import a snapshot damaged beyond repair — the error reports the ORIGINAL parse
  position, not an offset into the repaired text.
- Import well-formed JSON of the wrong shape (e.g. an object, or labels with no
  `urls`) — an error is shown, and no partial `labels` map is written.
- Import an empty paste — no write, no error, nothing destroyed.