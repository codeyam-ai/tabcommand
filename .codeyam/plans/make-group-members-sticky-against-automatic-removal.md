---
title: "Make Group Members Sticky Against Automatic Removal"
mode: ui
createdAt: "2026-07-23T12:04:45Z"
source: manual
dependsOn: ["always-on-group-membership-removal-audit-log"]
---

## Summary

A URL the user deliberately placed in a tab group (a recorded member of `labels[title].urlKeys`) can be **silently deleted by automatic tab-lifecycle events** — Chrome ungrouping a tab (`service_worker.js:304`) or a `groupId` transition to no group (`service_worker.js:1049`) — with no user action and, today, no log. That is the class of event that dropped "CodeYam Fleet" from the "CodeYam" group.

This is also **inconsistent** with the extension's own behavior: `groupTabs` already treats `urlKeys` as sticky, auto-grouping an ungrouped tab back into a label whenever its URL matches a recorded member (`service_worker.js:~1225`). So a member is sticky enough to pull a tab back in, yet gets deleted the moment its tab is ungrouped — the two behaviors contradict each other.

This plan makes membership **durable**: automatic tab-lifecycle transitions may ungroup the *tab* (the visual grouping in Chrome), but never delete a recorded member `urlKey`. A URL leaves a group only through an **explicit user action** — the group's remove-URL button, dragging the chip out in the TabCommand UI, deleting the group — or a genuine **re-home** (moving a tab from one group directly into another). Because members now persist, reopening the URL simply auto-groups it back into its label, which is the durable, favorites-like behavior users expect.

## Key Decisions

- **Members are sticky; only explicit actions remove them.** This resolves the contradiction with the existing auto-regroup logic (`groupTabs`, ~line 1225) rather than introducing a new concept.
- **Ungroup ≠ remove.** A tab leaving *all* groups (`groupId → -1`) — whether from Chrome's native "ungroup" gesture, a navigation-eject (`service_worker.js:232`), or MV3 restart flicker — no longer splices the member key. The tab is ungrouped visually; the membership survives.
- **Re-home *does* remove from the old group.** Moving a tab directly from group A into group B is unambiguous user intent to re-parent it, so the old-group splice is **kept for that case only** (`newGroup` present). This preserves intuitive move semantics and avoids a URL accumulating membership in every group it ever passed through.
- **Navigation-eject keeps ungrouping the tab, just not deleting the member.** We do not touch the `chrome.tabs.ungroup` eject at `service_worker.js:232`; a grouped tab that navigates to an unrelated page still leaves the group visually. We only stop the downstream `urlKeys` splice.
- **Drift-heal dedup stays.** `healDriftedLabelSlot`'s splice branch collapses a *duplicate* slot for a page that already has a member entry — that is dedup, not member loss, and it is position/identity-safe. It is left intact (and, per the companion logging plan, recorded as `worker:drift-heal-dedup`).
- **Explicit UI removals are unchanged.** `removeUrl` (confirm-gated), `deleteLabel` (confirm-gated), and TabCommand-UI chip drag remain the sanctioned ways to remove a member.

## Implementation

### 1. Stop the ungroup splice in the `onUpdated` path

**File**: `service_worker.js` (the `changeInfo.groupId === -1` branch, around line 289-318)

Remove the `label.urlKeys.splice(urlKeyIndex, 1)` member deletion (line 304). Keep the surrounding bookkeeping that marks the tab ungrouped — `activeTabs[activeTabIndex].groupId = -1` and the `activeTabs` write — but leave `labels` untouched so the member persists. (With the splice gone, the `label`/`urlKeyIndex` lookup that existed only to drive it can be simplified away.)

### 2. Scope the group-change splice to genuine re-homes only

**File**: `service_worker.js` (`handleActiveTabsGroupChanges`, around line 1046-1052)

Guard the old-group splice so it fires **only when there is a real destination group**. This block runs both when a tab moves A→B and when a tab is ungrouped to nothing (`newGroup` is falsy). Wrap the splice at line 1046 so it runs only when `newGroup` is truthy:

- Move A→B (`newGroup` present): add to B (unchanged, line 1041) **and** splice from A (kept) — a genuine re-home.
- Ungroup to nothing (`newGroup` falsy): **skip** the splice — the member stays in its label, consistent with change #1.

### 3. Update worker tests to the new contract

**File**: `service_worker.test.js`

Flip any existing assertions that expect a member to be removed on ungroup-to-nothing, and add coverage for the re-home case still removing from the old group. Specifically:

- Ungroup-to-nothing preserves membership (new/adjusted).
- Navigation-eject still calls `chrome.tabs.ungroup` but the member survives.
- Re-home A→B adds to B and removes from A (unchanged intent, assert explicitly).

## Reused existing code

- The existing auto-regroup logic in `groupTabs` (`service_worker.js`, glossary entry: `groupTabs`, ~line 1225) — this plan makes the removal paths consistent with it; no new stickiness mechanism is introduced.
- `handleActiveTabsGroupChanges` (`service_worker.js`, glossary entry: `handleActiveTabsGroupChanges`) — the re-home add/remove logic is retained, only the ungroup-to-nothing branch changes.
- `healDriftedLabelSlot` (`src/lib/utils/healDriftedLabelSlot.js`) — left intact; its dedup splice is intentionally preserved.
- `removeUrlFromLabel` (`src/lib/utils/urlDetails.js`, glossary entry: `removeUrlFromLabel`) and the confirm-gated `removeUrl`/`deleteLabel` in `LabelCollection.jsx` — the sanctioned explicit-removal paths, unchanged.

**Existing-implementation survey:** grepped `service_worker.js` for every `urlKeys.splice` / `urlKeys` mutation. The member-deletion sites are exactly: `onUpdated` ungroup (line 304), `handleActiveTabsGroupChanges` old-group (line 1049), and `healDriftedLabelSlot`'s dedup splice. The eviction path at `service_worker.js:553-565` explicitly skips any key still in a label and is not a membership mutation. No other automatic path deletes a member, so changes #1 and #2 cover the full automatic-removal surface.

**Dependency:** depends on `always-on-group-membership-removal-audit-log`. Landing the audit trail first means the automatic removals we are about to disable are observable right up to the moment they stop — so we can confirm from `groupRemovalLog` that `worker:tab-ungrouped` / ungroup-driven `worker:group-changed` events cease, while explicit `ui:*` removals continue.

## Reproduction Test

A URL that is a deliberate member of a group is silently removed when its tab is ungrouped (`groupId` → -1), instead of remaining a sticky member.

**Target**: `service_worker.test.js` — run with `codeyam-editor editor refresh-tests --test service_worker`.

```js
// A member urlKey survives its tab being ungrouped (groupId -> -1); only
// explicit user removal deletes a member.
it('keeps a member urlKey when its tab is ungrouped to no group', async () => {
  emptyStorage(chrome);
  seedStorage(chrome, {
    labels: { CodeYam: { title: 'CodeYam', urlKeys: ['url-https://fleet.codeyam.com/'] } },
    activeTabs: [
      { tabKey: 'tab-1', urlKey: 'url-https://fleet.codeyam.com/', groupId: 42 }
    ],
    groups: { 42: 'CodeYam' }
  });

  const onUpdated = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
  // Chrome ungroups the tab: groupId transitions to -1 while it still shows Fleet.
  await onUpdated(
    1,
    { groupId: -1 },
    { id: 1, url: 'https://fleet.codeyam.com/', groupId: -1 }
  );

  const lastLabels = latestStoredValue(chrome, 'labels');
  expect(lastLabels.CodeYam.urlKeys).toContain('url-https://fleet.codeyam.com/');
});
```

Status: PROPOSED — confirm red at execution. Expected failure today: the `changeInfo.groupId === -1` branch splices the member out (`service_worker.js:304`), so `labels.CodeYam.urlKeys` is empty and `toContain` fails. The exact storage-seeding helpers (`seedStorage`/`latestStoredValue`) and the precise `changeInfo`/`tab` shape that triggers the ungroup branch are to be confirmed against `service_worker.test.js`'s existing harness at execution — the assertion (member survives ungroup) is the fixed contract.

## Scenarios to Demonstrate

- **Sticky across ungroup:** a member survives its tab being ungrouped (`groupId → -1`); reopening the URL auto-groups the tab back into the label.
- **Navigation-eject is non-destructive:** a grouped tab navigates to an unrelated page → the tab leaves the group visually, but the member `urlKey` remains.
- **Re-home still moves:** dragging a tab from group A into group B removes it from A and adds it to B (membership moves, not duplicated).
- **Explicit removal still works:** the group's remove button and delete-group still remove the member (confirm-gated), and a TabCommand-UI chip drag-out still removes it from its source label.
- **Drift-heal dedup preserved:** a Google-Doc member whose `?tab=` drifts onto an already-recorded key is still deduped in place (no duplicate, position preserved).