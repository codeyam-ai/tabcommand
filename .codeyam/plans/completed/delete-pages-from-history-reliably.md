---
title: "Delete Pages From History Reliably"
mode: ui
createdAt: "2026-07-28T15:10:59Z"
source: manual
---

## Summary

A page cannot be reliably deleted from History. Three independent causes stack up:
the History page exposes no delete affordance at all (`HistoryRow` renders only
Reopen); a URL that lives in a group gets `onRemove` wired to the group's
`removeUrl`, so the ✕ strips group membership and never touches `allUrls`; and
when `Url.handleRemove` *does* run, it closes the tab first, which makes the
service worker's `chrome.tabs.onRemoved` → `closeUrl` read a pre-delete `allUrls`
snapshot in a different process and write the key straight back at index 0 —
while `Chrome.remove` has already deleted the `url-*` record, so the resurrected
row renders as a bare URL. This plan adds a real Delete action to the History
page, makes the group ✕ able to reach a true history delete, and makes deletion
survive the cross-process race via a short-lived `deletedUrls` tombstone the
service worker honors.

Per the scoping decision, deleting from History does NOT purge the urlKey from
`labels[*].urlKeys` — group membership is left untouched. A deleted page may
therefore still appear on its group card and in Search (which unions `allUrls`
with label keys); that is accepted, not a defect of this plan.

## Key Decisions

- **Tombstone, not write-ordering.** The resurrection is a read-modify-write race
  between the popup process and the extension service worker. No amount of
  sequencing inside `Url.jsx` can close it — `onRemoved` fires on the browser's
  schedule. A `deletedUrls` map that `closeUrl` consults is the only fix that
  holds regardless of which process writes last. Considered and rejected: routing
  the delete through a `chrome.runtime.sendMessage` handler so the SW serializes
  all `allUrls` writes — it narrows the window but does not close it, because the
  delete message and the `onRemoved` event are still two independent SW events.
- **`closeUrl` respects the tombstone; `newUrl` clears it.** `closeUrl` only ever
  *reorders* an existing key, so skipping a tombstoned key loses nothing. `newUrl`
  represents a genuine user visit — a deliberate return to the page — so it clears
  the tombstone and re-adds the key. Deleting is "forget this," not "block this."
- **Tombstones are pruned, not permanent.** They exist only to outlive an in-flight
  `onRemoved`. `newUrl` prunes entries older than `DELETED_URL_TTL_MS` on the same
  pass it already prunes `allUrls`, so the map cannot grow without bound.
- **Delete lives in `useHistoryRows`, not in `HistoryRow`.** The hook already owns
  every read of `allUrls` / `autoClosed` / `url-*` and already re-renders off
  `chrome.storage.onChanged`. Putting `deleteRow` beside `reopen` keeps `HistoryRow`
  a pure presentational component and gives `Url.jsx` one shared implementation to
  call instead of a second copy of the logic.
- **The group ✕ keeps its current meaning; delete is additive.** Silently changing
  what ✕ does inside a group would destroy history for users who only meant to
  un-file a page. Instead the group row's confirm gains an explicit second path.
- **REVISED DURING BUILD — the History row confirms INLINE, not via `confirm()`.**
  The plan originally specified a native `confirm()` on the History page for
  consistency with `Url.handleRemove`. Building it showed that a native dialog is
  auto-dismissed by the capture browser, so the delete never ran — which means
  the two scenarios this plan promises ("delete a row, confirm it disappears" and
  "cancel the delete confirm") could not be demonstrated at all, only unit-tested.
  `HistoryRow` therefore owns an inline two-step confirm (✕ → `Delete` / `Cancel`),
  following `FavoritesResetControl`, whose own comment already records this exact
  choice: a deliberate second click "rather than a native confirm() dialog". The
  confirming state is a real rendered state, so it is capturable and cancellable.
  `Url.handleRemove` and `LabelCollection.removeUrl` keep their existing native
  confirms — they are unchanged pre-existing convention outside this page.

## Implementation

### 1. A single, tombstone-aware delete helper

**New file**: `src/lib/utils/deleteUrlFromHistory.js`

Export `deleteUrlFromHistory(urlKey, callback)`. In ONE `Chrome.get` →
`Chrome.set` cycle over `['allUrls', 'autoClosed', 'deletedUrls']`:

- splice `urlKey` out of `allUrls` (guard `indexOf === -1`, mirroring the
  `oldIndex === -1` guard `closeUrl` already carries at `service_worker.js:681`),
- `delete autoClosed[urlKey]`,
- set `deletedUrls[urlKey] = Date.now()`,
- write all three keys in a single `Chrome.set`,
- and only in that write's wake call `Chrome.remove(urlKey)` for the `url-*`
  record, so the record is never dropped while the key is still listed.

This is the whole reason the bug produced a bare-URL row: today
`Chrome.remove('Url1', urlKey)` fires unconditionally and immediately, ahead of
the `allUrls` splice.

### 2. Service worker honors the tombstone

**File**: `service_worker.js`

- Add `DELETED_URL_TTL_MS` beside the existing `MAX_TRACKED_URLS` constant
  (~line 119).
- `closeUrl` (line 676): widen its `getLocalStorage` to
  `['allUrls', 'deletedUrls']` and return early — without writing — when
  `deletedUrls[urlKey]` is present. This is the line that resurrects the row.
  Keep the existing `oldIndex === -1` early-return and its callback contract
  intact; both early-return paths must still invoke `callback`, since
  `onRemoved` passes `updateActiveTabs` (line 416) and skipping it would leave
  `activeTabs` stale.
- `newUrl` (line 559): widen its `getLocalStorage` to include `deletedUrls`;
  `delete deletedUrls[urlKey]` on a real visit, prune entries older than
  `DELETED_URL_TTL_MS`, and include `deletedUrls` in the `updates` object it
  already builds (line 598) so a revisit un-forgets the page.

### 3. Delete action on History rows

**File**: `src/lib/components/HistoryRow/HistoryRow.jsx`

Add an `onDelete` prop and a ✕ button beside the existing Reopen button, with
`e.stopPropagation()` so it does not trip the row's reopen click/keydown target.
Render it only when `onDelete` is supplied, so existing render sites are
unaffected. The ✕ opens an inline two-step confirm owned by this component
(`confirming` state → `Delete` / `Cancel` replacing Reopen + ✕); see the revised
key decision above for why the confirm lives here rather than in a native dialog.

**File**: `src/lib/components/HistoryRow/HistoryRow.css`

Style the delete control to match the existing `.HistoryRow-reopen`, and the
confirm pair to match `FavoritesResetControl`'s red `-yes` / neutral `-cancel`.

**File**: `src/lib/components/HistorySection/HistorySection.jsx`

Thread `onDelete` through to each `HistoryRow`.

**File**: `src/lib/hooks/useHistoryRows.js`

Return `deleteRow` alongside `rows` and `reopen`, delegating to
`deleteUrlFromHistory`. No local state surgery is needed — the existing
`chrome.storage.onChanged` listener already re-loads on an `allUrls` change, so
the row disappears on its own.

**File**: `src/lib/pages/History/History.jsx`

Pull `deleteRow` off the hook and pass it straight down as `onDelete`. The
confirm step lives in `HistoryRow` (see above), so `deleteRow` is already the
confirmed action by the time the page hands it over.

### 4. Grouped rows can reach a real delete

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

In `removeUrl` (line 221), keep the default behavior exactly as-is — remove from
`labels[currentTitle].urlKeys`, log via `buildGroupRemovalEntry` with
`RemovalSource.UI_REMOVE_URL`. Extend the confirm flow so the user can choose to
also delete the page from history, which calls `deleteUrlFromHistory`. The group
removal and its log entry are written first and independently, so a delete never
silently swallows the group-membership change.

### 5. Fix `Url.handleRemove`

**File**: `src/lib/components/Url/Url.jsx`

Replace the body of `handleRemove` (lines 141-153) with a call to
`deleteUrlFromHistory`, then close the tab. Delete the inline
`Chrome.remove` + second `Chrome.get('Url3', 'allUrls', …)` pair entirely — that
duplicated read-modify-write is what this plan centralizes. `handleClose` keeps
its current behavior for the still-open-tab case and is no longer called from
`handleRemove`.

## Reused existing code

- `useHistoryRows` from `src/lib/hooks/useHistoryRows.js` — already owns every
  History read and the live `onChanged` listener; `deleteRow` joins `reopen`.
- `HistoryRow` from `src/lib/components/HistoryRow/HistoryRow.jsx` (glossary
  entry: `HistoryRow`) — gains `onDelete` beside the existing Reopen button.
- `Chrome` from `src/lib/utils/Chrome/Chrome.js` — the `get`/`set`/`remove`
  abstraction all storage work goes through, including its `allUrls` array
  default-hydration.
- `closeUrl` / `newUrl` from `service_worker.js` — the two existing `allUrls`
  writers; both are extended rather than duplicated.
- `bucketByDay` from `src/lib/utils/historyBuckets.js` (glossary entry:
  `bucketByDay`) — unchanged; deletion works by removing the row upstream of
  bucketing.
- `buildGroupRemovalEntry` / `RemovalSource.UI_REMOVE_URL` from
  `src/lib/utils/groupRemovalLog.js` — the group-removal audit path stays exactly
  as-is.
- `installChromeShim` from `src/lib/utils/chromeShim/chromeShim.js` — the test
  harness both `Url.test.jsx` and `useHistoryRows.test.jsx` already build on.

**Existing-implementation survey.** Grepped for a tombstone / suppression
mechanism before proposing `deletedUrls`: `src/lib/utils/hiddenSiteKeys.js` and
the `favoritesHidden` store implement site-level hiding for **Favorites ranking
only** — `rankFavorites` consumes them via `hiddenKeys` / `excludedSites`, and
nothing in `useHistoryRows` or `service_worker.js` reads them. `autoClosed` is a
timestamp map, not a suppression set. There is **no existing mechanism that
suppresses an `allUrls` write**, so `deletedUrls` is genuinely new rather than a
duplicate of `favoritesHidden`.

## Reproduction Test

Pins the resurrection: `closeUrl` re-adds a just-deleted urlKey to the front of
`allUrls` because it reads a pre-delete snapshot in the service worker process.

**Target**: `service_worker.test.js`, inside the existing `describe('closeUrl')`
block (line 381) — run with
`codeyam-editor editor refresh-tests --test "leaves allUrls untouched when the key was just deleted"`.

```js
    // REGRESSION: deleting a page from History splices it out of allUrls, but the
    // tab close that accompanies the delete fires onRemoved -> closeUrl in the
    // service worker process. closeUrl read allUrls before the delete landed, so
    // its move-to-front wrote the key straight back at index 0 -- the row
    // reappeared at the top of History, titleless because the url-* record was
    // already gone. A deletedUrls tombstone makes closeUrl skip the key.
    it('leaves allUrls untouched when the key was just deleted', () => {
      chrome.storage.local.get.mockImplementation((_q, cb) =>
        cb({ allUrls: ['url-a', 'url-b', 'url-c'], deletedUrls: { 'url-c': 1 } })
      );
      const done = vi.fn();
      fns.closeUrl('url-c', done);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalled();
    });
```

Status: PROPOSED — confirm red at execution. Expected failure: `closeUrl` today
ignores `deletedUrls` entirely, finds `url-c` at index 2, and calls
`update({ allUrls: ['url-c', 'url-a', 'url-b'] })`, so
`expect(chrome.storage.local.set).not.toHaveBeenCalled()` fails with the set
having been called once. (`update` writes through `chrome.storage.local.set`, the
same assertion style the two sibling `closeUrl` tests already use.)

The tombstone timestamp `1` is a placeholder for "any present entry" — `closeUrl`
checks presence, not age, so no clock is involved. Pruning by
`DELETED_URL_TTL_MS` belongs to `newUrl` and is covered separately.

Note: causes 1 and 2 (no delete affordance on the History page; the group ✕
never reaching history) are missing-capability gaps, not broken behavior, so they
get new coverage in `useHistoryRows.test.jsx` and `HistoryRow.test.jsx` rather
than a red-first repro.

## Scenarios to Demonstrate

- History with a rich multi-day list — delete a Today row, confirm it disappears
  and does not return at the top of the list.
- Delete a row for a tab that is still open, so the delete and the tab close race:
  the tombstone path is what this exercises.
- Revisit a page after deleting it — it correctly reappears in History, with its
  title intact, because `newUrl` clears the tombstone.
- Delete a row whose URL is a member of a group — confirm it leaves History while
  its group card still lists it (the accepted consequence of leaving groups
  untouched).
- Group card ✕ on a member: the default path removes from the group only and the
  page remains in History.
- Cancel the delete confirm — nothing is removed.
- History with a single row — deleting it lands on the "No history yet."
  `EmptyState`.