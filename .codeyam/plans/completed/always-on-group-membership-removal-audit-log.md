---
title: "Always-On Group-Membership Removal Audit Log"
mode: ui
createdAt: "2026-07-23T12:03:51Z"
source: manual
---

## Summary

When the "CodeYam Fleet" URL disappeared from the "CodeYam" group, we could not tell how. The only grouping diagnostics — the `groupingLog` breadcrumb trail in `service_worker.js` — are gated behind a `debugGrouping` flag that is **off by default and has no UI toggle**, and even when it is on, **none of the actual member-removal splice points are breadcrumbed**. So the two most likely automatic drop points (`service_worker.js:304` on tab-ungroup, `service_worker.js:1049` on group change) and every UI removal are invisible.

This plan adds an **always-on, low-volume audit trail of every group-membership removal**, written by both runtimes (service worker + web app), persisted to `chrome.storage.local` under a dedicated key so the next drop is captured with no flag to pre-enable. It does **not** change any removal behavior — it only records removals. (Behavior changes to *prevent* bad removals live in the companion plan `make-group-members-sticky-against-automatic-removal`.)

## Key Decisions

- **Always on, not gated.** Member removals are rare and low-volume, unlike the high-frequency `groupTabs: ungroup Chrome-auto-grouped tab (not a label member)` noise that dominates `groupingLog`. The whole reason we couldn't diagnose CodeYam is that removals were behind a default-off flag. The removal audit trail must persist unconditionally.
- **Separate store from `groupingLog`.** Write removals to a dedicated `groupRemovalLog` key rather than into the existing noisy, flag-gated `groupingLog`, so removal signal is never buried by, or trimmed away with, the auto-group noise. Leave the existing `debugGrouping`/`groupingLog` mechanism untouched.
- **Reuse the existing ring-buffer helper.** `appendGroupingLog` (`src/lib/utils/groupingLog.js`) is already a pure, tested append-and-trim over a capped array — reuse it for `groupRemovalLog` (cap ~100) instead of inventing a second buffer.
- **One entry shape, both runtimes.** Define the entry shape once in a small pure helper so the service worker and the web-app removal handlers record identical, root-causable breadcrumbs. Each runtime keeps its own storage I/O (worker: `getLocalStorage`/`update`; web app: `Chrome.get`/`Chrome.set`).
- **Record enough to root-cause.** Each entry carries: timestamp, `source` (which code path did the removal), label title, the removed `urlKey`(s), `tabId` when available, and the resulting member count (so a group being emptied to zero is visible at a glance).

## Implementation

### 1. Shared removal-entry helper

**New file**: `src/lib/utils/groupRemovalLog.js`

Export:
- `GROUP_REMOVAL_LOG_KEY = 'groupRemovalLog'`
- `GROUP_REMOVAL_LOG_CAP = 100`
- `buildGroupRemovalEntry(source, { labelTitle, urlKeys, tabId, remaining })` — a pure function returning `{ t, source, label, urlKeys, tabId, remaining }`. `urlKeys` is always an array (single-key removals pass `[key]`); `t` is the caller-supplied `Date.now()` so the function stays clock-free and unit-testable.

Trimming reuses the existing `appendGroupingLog(store, entry, cap)` from `src/lib/utils/groupingLog.js` — this file only builds the entry and names the key/cap. `source` is one of a small fixed set of string constants also exported from here so the two runtimes can't drift: `'worker:tab-ungrouped'`, `'worker:group-changed'`, `'worker:drift-heal-dedup'`, `'ui:removeUrl'`, `'ui:deleteLabel'`, `'ui:drag'`.

### 2. Worker: an always-on `recordRemoval` writer

**File**: `service_worker.js`

Add a small helper alongside `debugGroup` (near line 42) that, unlike `debugGroup`, is **not** gated by `DEBUG_GROUPING`/`debugGrouping`:

```
function recordRemoval(source, details) {
  getLocalStorage([GROUP_REMOVAL_LOG_KEY], (result) => {
    update({
      [GROUP_REMOVAL_LOG_KEY]: appendGroupingLog(
        result[GROUP_REMOVAL_LOG_KEY],
        buildGroupRemovalEntry(source, details),
        GROUP_REMOVAL_LOG_CAP
      )
    });
  });
}
```

Import `buildGroupRemovalEntry`, `GROUP_REMOVAL_LOG_KEY`, `GROUP_REMOVAL_LOG_CAP`, and the `source` constants from the new file (`appendGroupingLog` is already imported at line 4).

### 3. Worker: instrument the two automatic splice sites

**File**: `service_worker.js`

- **`onUpdated`, `changeInfo.groupId === -1` (around line 302-304).** Immediately after `label.urlKeys.splice(urlKeyIndex, 1)`, call `recordRemoval('worker:tab-ungrouped', { labelTitle, urlKeys: [getUrlKey(tab.url)], tabId, remaining: label.urlKeys.length })`. This is the top-suspect path that today writes nothing.
- **`handleActiveTabsGroupChanges` old-group splice (around line 1046-1052).** After `labels[oldGroup.title].urlKeys.splice(index, 1)`, call `recordRemoval('worker:group-changed', { labelTitle: oldGroup.title, urlKeys: [newTab.urlKey], tabId: parseTabId(newTab), remaining: labels[oldGroup.title].urlKeys.length })`.

### 4. Worker + helper: surface drift-heal splices

**File**: `src/lib/utils/healDriftedLabelSlot.js`

Add a `removed` boolean to the return object: `true` on the splice branch (line 34, live key already elsewhere → stale slot dropped), `false` on the position-preserving rewrite branch (line 37). This lets callers distinguish a genuine member drop from a harmless in-place rewrite. `found`/`mutated`/`previousKey` are unchanged, so existing callers keep working.

**File**: `service_worker.js`

At both `healDriftedLabelSlot` call sites — the `onUpdated` in-page-drift branch (around line 259) and `recordInGroupTab` (around line 1122) — when the returned `removed` is true, call `recordRemoval('worker:drift-heal-dedup', { labelTitle, urlKeys: [previousKey], tabId, remaining: label.urlKeys.length })`. (A drift-heal dedup is not a "loss" — it collapses a duplicate — but it is a splice, so it belongs in the audit trail with its own source tag.)

### 5. Web app: instrument UI removals

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

- **`removeUrl` (around line 136-159).** After the confirmed splice that sets `labels[currentTitle].urlKeys = updatedUrlKeys`, append a `groupRemovalLog` entry via the shared helper (`Chrome.get([GROUP_REMOVAL_LOG_KEY])` → `appendGroupingLog` → include it in the `updates` passed to `Chrome.set`). `source: 'ui:removeUrl'`, `urlKeys: [urlKey]`, `remaining: updatedUrlKeys.length`.
- **`deleteLabel` (around line 126-134).** Before `delete labels[currentTitle]`, record a single entry with `source: 'ui:deleteLabel'`, `urlKeys: labels[currentTitle].urlKeys` (all of them), `remaining: 0`.

### 6. Web app: instrument drag moves

**File**: `src/lib/App/App.jsx` (the `handleDrag` persistence path, around line 72)

When `applyDrag` (`src/lib/utils/dragReducer.js`) moves a URL out of its source label, record a `source: 'ui:drag'` entry naming the source label and the `urlKey`, with `remaining` = the source label's new length. A drag is a *move* (the key is re-inserted into the destination), not a loss, so this is lower priority than the loss paths above — but recording it keeps the audit trail complete and lets us rule drags in or out when diagnosing a future disappearance.

### 7. Documentation / inspection convenience

**File**: `service_worker.js` (comment near `recordRemoval`)

Document the read-back one-liner in a comment so the store is discoverable:
`chrome.storage.local.get('groupRemovalLog', console.log)` — no flag required.

## Reused existing code

- `appendGroupingLog` from `src/lib/utils/groupingLog.js` (glossary entry: `appendGroupingLog`) — the pure ring-buffer append-and-trim, reused verbatim for `groupRemovalLog`.
- `debugGroup` pattern from `service_worker.js` (glossary entry: `debugGroup`) — `recordRemoval` mirrors its fire-and-forget storage round-trip, minus the flag gate.
- `getUrlKey`, `getLocalStorage`, `update`, `parseTabId` from `service_worker.js` (glossary entries: `getUrlKey`) — existing worker plumbing.
- `healDriftedLabelSlot` from `src/lib/utils/healDriftedLabelSlot.js` — extended with a `removed` flag; splice logic unchanged.
- `Chrome.get`/`Chrome.set` from `src/lib/utils/Chrome/Chrome.js` — the web app's storage wrapper.

**Existing-implementation survey:** grepped `service_worker.js` and `src/` for any pre-existing removal/audit log — the only persisted grouping trail is `groupingLog` (flag-gated, decision-level, does not record the actual splices; `service_worker.js:42-53`). No equivalent always-on removal store exists, so `groupRemovalLog` is genuinely new, not a duplicate of existing state.

## Scenarios to Demonstrate

- A member removed via the worker tab-ungroup path appears in `groupRemovalLog` with `source: 'worker:tab-ungrouped'`, the correct label, the removed `urlKey`, and the remaining count.
- Deleting a whole group records one `ui:deleteLabel` entry listing every removed `urlKey` and `remaining: 0`.
- Removing a single chip via the group's remove button records one `ui:removeUrl` entry.
- The ring buffer trims to its cap: after `> GROUP_REMOVAL_LOG_CAP` removals, only the most-recent `GROUP_REMOVAL_LOG_CAP` entries remain (oldest dropped).
- A drift-heal *rewrite* (position-preserving, `removed: false`) records **nothing**; a drift-heal *dedup* (`removed: true`) records one `worker:drift-heal-dedup` entry — the two branches are distinguishable.
- Empty state: with no removals, `groupRemovalLog` is absent/empty and reading it is harmless.