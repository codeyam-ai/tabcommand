---
title: "Delete Group Actually Deletes"
mode: ui
createdAt: "2026-08-12T17:48:48Z"
source: manual
---

## Summary

Deleting a group appears to do nothing. Confirming the dialog removes the label
from storage, and the worker puts it straight back: a tab still sitting in a
native Chrome tab group of the same title reaches `recordInGroupTab`, which
re-seeds the label it just lost. The card never disappears, so the whole action
reads as broken. Separately, the Delete Group button has no pointer cursor, so it
does not read as clickable in the first place.

Deleting a group should delete it everywhere. This plan makes an explicit user
deletion also dissolve the corresponding Chrome tab group — the tabs are
ungrouped and stay open — so nothing survives to re-record the label, and gives
the button the cursor it should always have had.

Observed on a live profile: sync `labels` held exactly one group (`CodeYam`, one
urlKey) and `activeTabs` held exactly one grouped tab (`groupId 1380839889`). The
confirm dialog appeared and approving it changed nothing.

## Key Decisions

- **Dissolve the Chrome group, don't tombstone the title.** The alternative was a
  short-lived "recently deleted" set the worker consults before recording, which
  leaves the Chrome tab group on screen after its label is gone — a group the app
  no longer knows about but Chrome still shows. Deleting a group should mean the
  group is gone. Ungrouping leaves every tab open and in place; only the grouping
  is removed.

- **This is a deliberate, narrow exception to "TabCommand does not move tabs."**
  The completed `stop-tabcommand-moving-tabs-in-the-tab-strip` plan stopped the
  worker from *autonomously* regrouping tabs. Ungrouping here is not autonomous:
  it is the direct, confirmed consequence of a user action whose entire meaning is
  "remove this group." `chrome.tabs.ungroup` does not reorder or move tabs between
  windows — it only clears group membership — so the tab-strip guarantee that
  plan established (no unrequested repositioning) is preserved. Record it via the
  existing `groupMoveLog` so the action stays auditable like every other
  grouping mutation.

- **Drive the ungroup from the worker, not the delete handler.** The worker
  already owns every `chrome.tabs.ungroup` call, the `pendingUngroups` in-flight
  guard, and the move log. `storage.onChanged` hands it both `oldValue` and
  `newValue` for `labels` (`service_worker.js:1247` already reads `oldValue`), so
  the titles that disappeared are derivable there. Putting the Chrome call in the
  UI would duplicate that machinery and split ownership of tab mutations across
  two surfaces.

- **Reuse `pendingUngroups` rather than adding a second suppression mechanism.**
  The record loop already skips a tab whose ungroup is in flight
  (`service_worker.js:1656`). Marking the tabs before issuing the ungroup closes
  the race window using the guard that exists, instead of introducing a parallel
  one that could disagree with it.

- **The cursor fix is not a regression and is included anyway.** It has been
  missing since `a404030`, it is one declaration, and it is in the same button the
  rest of this plan makes work. Fixing "the button does nothing" while leaving it
  looking unclickable would be a half-delivered fix.

## Implementation

### 1. Give the menu's action buttons a pointer cursor

**File**: `src/lib/components/LabelCollectionMenu/LabelCollectionMenu.css`

`.LabelCollection-menu-actions button` (lines 40-45) sets `display`, `border`,
`background-color`, and `margin-bottom` but no `cursor`. A `<button>` with
`border: none` and an inherited background reads as plain text under the default
cursor. Add `cursor: pointer` to that rule so every action in the menu — today
just Delete Group — reads as clickable.

Note that `.LabelCollection-delete` (the class on the button itself, set at
`src/lib/components/LabelCollectionMenu/LabelCollectionMenuActions.jsx:11`) has
**no rule anywhere in `src/`**. The descendant selector above is the only thing
styling this button. Either add the declaration there or give
`.LabelCollection-delete` a real rule — but do not assume the class is already
styled, because it is not.

### 2. Dissolve the Chrome tab group when its label is deleted

**File**: `service_worker.js`

In the `chrome.storage.onChanged` listener (`service_worker.js:1224-1257`), the
`labelsChanged` branch already has both sides of the change and reads
`changes.labels.oldValue` at `:1247`. Extend it to compute the titles present in
`oldValue` but absent from `newValue` — the labels just deleted — and for each:

1. `chrome.tabGroups.query({ title })` to find its Chrome group(s). The query is
   not window-scoped, so handle multiple groups the way `groupLabeledTab` already
   does (`service_worker.js:1580-1596`) rather than taking `groups[0]`.
2. Add each affected tab id to `pendingUngroups` **before** issuing the call, so
   the record loop's existing in-flight guard (`service_worker.js:1656`) cannot
   re-record the tab in the window between the query and the ungroup landing.
3. `chrome.tabs.ungroup(tabIds)`, clearing `pendingUngroups` in the callback and
   swallowing `chrome.runtime.lastError` — the pattern `ejectAutoGroupedTab`
   already uses at `service_worker.js:1453-1457`.
4. Record the mutation through `recordMove` with a new `MoveSource` value for a
   user-initiated group deletion (`src/lib/utils/groupMoveLog.js:35-41` holds the
   existing set; there is no entry for this today).

A deletion that finds no Chrome group must be a no-op, not an error: the common
case is deleting a group whose tabs are all closed.

### 3. Stop the record path from resurrecting a deleted label

**File**: `service_worker.js`

Step 2 removes the *cause* in the common case, but the fall-through at
`service_worker.js:1680` is what actually re-creates the label, and it will still
fire for any tab that is in a titled Chrome group with no matching label — for
instance if the ungroup fails, or a second window's group is queried later. The
loop reaches `recordInGroupTab` when all of these hold:

- the tab is in a group (`activeTab.groupId > -1`)
- `urlKeyIsMember(label, activeTab.urlKey)` is false — true here, because the
  label no longer exists
- `autoGroupedTabs.has(tabId)` is false — true here, because a pre-existing
  Chrome group is not Chrome's per-tab inheritance

Make the resurrection path defensive so a *deleted* label is not silently
recreated as a side effect of a sync pass. The precise mechanism is a tactical
call for execution — the constraint is that startup sync of genuinely
pre-existing Chrome groups (the case `recordInGroupTab` exists to serve, per its
comment at `service_worker.js:1494-1498`) must keep working. Do not simply delete
the call.

### 4. Keep the removal breadcrumb accurate

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

`deleteLabel` (`src/lib/components/LabelCollection/LabelCollection.jsx:217-238`)
already writes a `RemovalSource.UI_DELETE_LABEL` entry with the removed urlKeys
via `buildGroupRemovalEntry`. No change is needed to the write itself — but
verify the entry still lands once, not twice, once the worker also reacts to the
same deletion. The removal log is the audit trail for "where did my group go",
so a duplicated or missing entry there is a real defect.

## Reused existing code

- `recordInGroupTab` from `service_worker.js` (glossary entry: `recordInGroupTab`,
  test `service_worker.test.js`) — the resurrection site; its startup-sync purpose
  must survive.
- `ejectAutoGroupedTab` from `service_worker.js` (glossary entry:
  `ejectAutoGroupedTab`, test `service_worker.test.js`) — the existing
  ungroup-a-tab idiom: `pendingUngroups.add` → `chrome.tabs.ungroup` → clear in
  callback → swallow `lastError`. Copy this shape rather than inventing one.
- `groupTabs` from `service_worker.js` (glossary entry: `groupTabs`, tags
  `worker,ported-verbatim,tab-groups,labels`) — contains the record loop and the
  multi-window `chrome.tabGroups.query` handling to mirror.
- `LabelCollection` from `src/lib/components/LabelCollection/LabelCollection.jsx`
  (glossary entry: `LabelCollection`, test
  `src/lib/components/LabelCollection/LabelCollection.test.jsx`) — owns
  `deleteLabel`.
- `RemovalSource` / `buildGroupRemovalEntry` from
  `src/lib/utils/groupRemovalLog.js` and `MoveSource` / `recordMove` from
  `src/lib/utils/groupMoveLog.js` — the existing audit-trail helpers. `MoveSource`
  has no user-deletion entry yet; add one there rather than logging an ad-hoc
  string.

**Existing-implementation survey.** There is no tombstone, suppression list, or
"recently deleted labels" mechanism anywhere in the worker — `autoGroupedTabs` and
`pendingUngroups` are the only two in-memory tab sets, and both are keyed by tab
id, not by label title. No code path today ungroups tabs in response to a label
deletion. There are exactly two ungroup call sites today, both keyed off a single
tab: the navigation-eject branch inside the `onUpdated` handler, and
`ejectAutoGroupedTab` (`service_worker.js:1453-1457`).

**Test coverage.** `service_worker.test.js` has 139 registered tests covering
`groupTabs`, `recordInGroupTab`, and `ejectAutoGroupedTab`;
`src/lib/components/LabelCollection/LabelCollection.test.jsx` covers the delete
handler. Both are the natural homes for the new coverage.

## Reproduction Test

The worker re-creates a label immediately after the user deletes it, whenever a
tab is still in a native Chrome group of that title.

**Target**: `service_worker.test.js` — run with
`codeyam-editor editor refresh-tests --test <name>`.

```js
// A label deleted by the user must not be resurrected by the in-group record
// path while its tabs are still sitting in the Chrome group of the same title.
it('does not re-create a label the user just deleted', async () => {
  // labels no longer has "Work"; a tab is still in the Chrome group "Work".
  const labels = {};
  const activeTabs = [
    { id: 1, groupId: 42, urlKey: 'url-https://a.com', pinned: false }
  ];
  stubTabGroup(42, { id: 42, title: 'Work' });

  await groupTabs(activeTabs, labels);

  expect(labels.Work).toBeUndefined();
});
```

Status: PROPOSED — confirm red at execution, and confirm the fixture actually
reaches the `recordInGroupTab` fall-through before trusting it (the tab must be
absent from `autoGroupedTabs` and from `pendingUngroups`, or the loop `continue`s
earlier and the test would pass for the wrong reason). The helper names
(`stubTabGroup`) are indicative — use whatever `service_worker.test.js` already
uses to stub `chrome.tabGroups`. Expected failure: `recordInGroupTab` seeds
`labels.Work`, so `toBeUndefined()` fails.

## Scenarios to Demonstrate

- Delete a group whose tabs are still in a Chrome tab group — card disappears and
  stays gone, tabs remain open and ungrouped.
- Delete a group with no tabs currently open — no-op on the Chrome side, no error.
- Delete one of two groups sharing a window — only the deleted group dissolves.
- The same label grouped in two windows — both Chrome groups dissolve, no tab
  crosses a window.
- Startup sync of a genuinely pre-existing Chrome group with no label — still
  records, proving the fix did not disable `recordInGroupTab`.
- Group menu open — Delete Group shows a pointer cursor on hover.