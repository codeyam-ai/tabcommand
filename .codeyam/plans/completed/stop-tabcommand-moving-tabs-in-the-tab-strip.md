---
title: "Stop TabCommand Moving Tabs In The Tab Strip"
mode: backend
createdAt: "2026-07-31T11:16:36Z"
source: manual
---

## Summary

Users report that TabCommand moves their tabs around in the Chrome tab strip — tabs jump back and forth with the user doing nothing. TabCommand never calls `chrome.tabs.move`, but `chrome.tabs.group` and `chrome.tabs.ungroup` both physically reposition tabs (group appends the tab to the end of its group and can pull it into another window; ungroup pops the tab out to the right of the group). The service worker issues those two calls **unconditionally** — it re-asserts the desired grouping on every pass instead of only acting when a tab is actually in the wrong place. Combined with a self-feeding event loop (`onMoved` → `updateActiveTabs` → `storage.local.set` → `storage.onChanged` → `groupTabs` → `chrome.tabs.group` → `onMoved` …), that turns "assert grouping" into "reposition tabs forever."

Investigation found seven distinct paths that move a tab with no user input. This plan makes every placement call **idempotent** — never issue `group`/`ungroup` for a tab that is already where it belongs — and fixes the four paths that compute the wrong destination in the first place (cross-window pull, stale-tab-id cold start, auto-close revisit, dual-label membership). An always-on move audit trail is added last so the next report is provable from the user's own profile instead of re-derived by reading code.

## Root causes found

Every line reference below is in `service_worker.js` unless noted.

1. **Refuse-append tabs are re-grouped on every pass — a self-sustaining move loop.** `groupTabs` (1462-1465) pushes an in-group tab into `labelTabIds` *after* calling `recordInGroupTab`, even when `recordInGroupTab` took its refuse-append early return (1328-1344, guarded by `navigatedAwayFromRecordedSlot`). That return deliberately does **not** record the urlKey — so the tab is in exactly the same state next pass, and `groupLabeledTab` calls `chrome.tabs.group({ tabIds, groupId })` on a tab that is *already in that group*, forever. Chrome honors it by moving the tab to the end of the group, which fires `onMoved` and re-enters the loop. This is the strongest single explanation of "jumps back and forth."
2. **The event loop has no damping.** `onMoved` (469) → `updateActiveTabs` → `update()` (547, an unconditional `chrome.storage.local.set`) → `storage.onChanged` (1052) → `groupTabs` (1066). `storage.local.set` fires `onChanged` even when the written value is byte-identical, so nothing breaks the cycle except a grouping pass that happens to issue no calls. Only the stamp write at 1508 is guarded; the placement calls are not.
3. **Cross-window pull, and a destructive consolidate branch.** `chrome.tabGroups.query({ title: labelTitle })` (1378) is not window-scoped, and the code takes `groups[0]`. With the same label grouped in two windows, `chrome.tabs.group({ tabIds, groupId: groups[0].id })` (1415) drags tabs into the other window. Worse, when `defaultWindowId` is set and differs, 1394-1407 **closes** the tabs (`chrome.tabs.remove`) and re-creates them — they reappear at the end of the strip with page state lost. `defaultWindowId` is only ever assigned at 271 when a tab titled "TabCommand" updates, so it is undefined or stale most of the time and which branch runs is effectively arbitrary.
4. **Cold start groups from a stale snapshot.** 1046-1049 calls `groupTabs(activeTabs, labels)` with `activeTabs` read straight from storage. Chrome tab ids are unique only within a browser session; after a browser restart the persisted ids refer to *different tabs*. MV3 wakes the worker constantly, so on the first wake after a restart `chrome.tabs.group(staleId)` and `chrome.tabs.ungroup(staleId)` (1495) move unrelated tabs — with the user doing nothing at all. This also plausibly explains phantom label members recorded via `recordInGroupTab` against a stale group id.
5. **Auto-close revisit yanks a tab out of its group.** `updateActiveTabs` (533-539) calls `chrome.tabs.ungroup` on the active tab whenever `autoClosed[urlKey]` is set. If that URL is a label member, the next `groupTabs` pass regroups it — a visible out-and-back jump every time you return to a page the Closer had closed. `updateActiveTabs` is also re-entrant (the `waitingToUpdate` guard only covers the no-tabs retry), so overlapping passes can double-issue.
6. **A URL in two labels is grouped twice per pass.** The label loop at 1468-1486 has no `break`, so a urlKey recorded in two labels is queued into both `labelTabIds` buckets and `groupLabeledTab` runs twice — moving the tab into group A and then group B. The winner depends on async `tabGroups.query` ordering, so it can differ pass to pass: literal back-and-forth.
7. **SPA path rewrites eject then regroup.** 301-312 ungroups any grouped tab whose URL change moves the pathname (`samePageKey` mismatch). Sites that rewrite their own path without user input (auth bounces, redirect chains, chat/doc apps) get popped out of the group and — if the new URL is also a member — pulled straight back in.

Adjacent defect found while reading: `updateActiveTabs` sorts by `a.tabIndex` (503-505), but a Chrome `Tab` has `index`, not `tabIndex`. The comparator returns `NaN`, so the sort is a silent no-op.

## Key Decisions

- **Idempotence is the primary fix, not a new scheduler.** One rule — *never call `chrome.tabs.group` for a tab whose live `groupId` already equals the target group, and never call `chrome.tabs.ungroup` for a tab whose live `groupId` is already `-1`* — neutralizes causes 1, 2 and 5 at once and damps the feedback loop by making a steady-state pass issue zero Chrome calls. Debouncing or a dirty-flag would hide the loop rather than remove it.
- **The placement decision becomes a pure, testable helper** (`src/lib/utils/tabPlacement.js`), following the established pattern of `healDriftedLabelSlot.js` / `navigatedAwayFromRecordedSlot.js` — the worker keeps its own `chrome.*` I/O and the decision logic gets unit tests without stubbing Chrome.
- **Window-scope the group lookup and delete the close-and-recreate branch.** Confirmed with the user that 1394-1407 is not intended behavior. A label may legitimately have one Chrome group per window; tabs are never pulled across windows and never destroyed to be re-created.
- **In-group tabs are never re-grouped at all.** `recordInGroupTab` runs only for a tab already sitting in the group, so the `labelTabIds` push at 1464-1465 can only ever be a no-op or a reposition. Removing it is strictly better than making `recordInGroupTab` return a "did record" flag, and it is the minimal diff.
- **Keep sticky membership.** Nothing here changes the rule that a urlKey leaves a label only through explicit user action. This plan changes *when Chrome calls are issued*, not what is a member.
- **The move trail is included but sequenced last** so it can be dropped if the change gets large. It mirrors `groupAdditionLog.js` / `groupRemovalLog.js` exactly, and exists because both of those were added after a grouping bug proved undiagnosable without one — the same is true here.

## Implementation

### 1. Pure placement helper

**New file**: `src/lib/utils/tabPlacement.js`

Two pure exports, no `chrome` and no storage:

- `needsGroupCall(activeTab, targetGroupId)` — `false` when `activeTab.groupId === targetGroupId` (already there) or the tab is pinned; `true` otherwise. Tolerates `undefined`/`-1` group ids.
- `needsUngroupCall(activeTab)` — `false` when the tab's `groupId` is `undefined`, `null` or `-1`; `true` otherwise.

Header comment in the style of the neighboring utils: state that `chrome.tabs.group`/`ungroup` physically reposition tabs, so an unguarded re-assert is a visible tab move and — via `onMoved` → `updateActiveTabs` → `storage.onChanged` → `groupTabs` — a self-feeding loop.

**New file**: `src/lib/utils/tabPlacement.test.js` — table-driven coverage of both helpers including the `undefined` / `0` / `-1` group-id edges (`groupId === 0` is falsy but a valid Chrome group id, and the existing `if (activeTab.groupId && activeTab.groupId > -1)` check at 1425 already mishandles it; the helper must not repeat that mistake).

### 2. Gate every placement call on the helper

**File**: `service_worker.js`

- Import `needsGroupCall` / `needsUngroupCall` alongside the existing util imports (1-9). Add them to the injected-parameter list in the test harness (see §8).
- `groupLabeledTab` (1370-1419): build `unpinnedTabIds` from tabs that fail `needsGroupCall(tab, targetGroupId)` **only**, and return without calling `chrome.tabs.group` when the filtered list is empty — including the `groups.length === 0` create branch, which must not create an empty group.
- Guard all four `chrome.tabs.ungroup` call sites (309, 535, 1262, 1495) with `needsUngroupCall`.
- Keep the existing `pendingUngroups` bookkeeping unchanged; the guard is additive.

### 3. Stop re-grouping tabs that are already in their group

**File**: `service_worker.js` (1460-1465)

Delete the `labelTabIds[group.title] ||= []` / `.push(activeTab)` pair after the `recordInGroupTab` call. A tab reaching that branch is by definition already inside `group`, so the only effect of queueing it is a reposition — and on the refuse-append path (`recordInGroupTab`'s early return at 1344) it is a reposition that repeats forever. Update the surrounding comment to say so explicitly, so the push is not reinstated later as a "make sure it's grouped" safety net.

### 4. Window-scope the group lookup; remove the close-and-recreate branch

**File**: `service_worker.js` (1370-1419, plus `defaultWindowId` at 11 / 271)

- Bucket the tabs passed to `groupLabeledTab` by their window. `activeTabs` entries do not currently carry a window id, so add `windowId: tab.windowId` to the entry built in `updateActiveTabs` (513-529) and carry it through like the other fields.
- For each window bucket, query `chrome.tabGroups.query({ title: labelTitle, windowId })` and place that bucket into that window's group, creating one when the query is empty. A label with tabs in two windows gets one Chrome group per window — no cross-window movement.
- Delete the `defaultWindowId` branch at 1394-1407 entirely (the `chrome.tabs.remove` + `chrome.tabs.create` consolidation). Remove `defaultWindowId` (11) and its assignment (271) if no other reader remains — grep confirms 1394 is the only one today.

### 5. Do not group from a stale cold-start snapshot

**File**: `service_worker.js` (1044-1050)

Drop the `groupTabs(activeTabs, labels)` call inside the load-time `getLocalStorage` callback; keep the assignment of the in-memory `labels` / `activeTabs`. The module-level `updateActiveTabs()` at 486 already re-reads live tabs and writes `activeTabs`, and that write re-enters `storage.onChanged` → `groupTabs` (1066) with live tab ids and live group ids. This removes the window where a post-browser-restart worker groups and ungroups tabs by ids that now belong to different tabs, at the cost of one storage round-trip of latency on the first grouping pass after a worker wake.

### 6. Auto-close revisit must not eject a member

**File**: `service_worker.js` (533-539)

Only ungroup the revisited tab when its urlKey is **not** a member of any label (reuse `urlKeyIsMember` over `labels`). When it is a member, just clear the `autoClosed` entry — ejecting it only to have `groupTabs` pull it straight back in is the out-and-back jump. Keep the existing `delete autoClosed[...]` on both branches.

### 7. Deterministic single label per URL, and a narrower SPA eject

**File**: `service_worker.js`

- 1468-1486: `break` out of the label loop after the first match, so a urlKey recorded in two labels resolves to exactly one destination group and cannot be grouped twice in one pass. First match is by `Object.keys(labels)` order — deterministic across passes, which is what stops the flip-flop.
- 301-312: before ejecting on a `samePageKey` mismatch, check whether the **new** URL's urlKey is a member of the tab's current label; if it is, skip the ungroup (the tab would only be regrouped on the next pass). Resolve the label title the same way the sibling in-page branch does at 325-332 (in-memory `groups` map, falling back to `getTabGroup`).

### 8. Sort fix

**File**: `service_worker.js` (503-505)

`a.tabIndex - b.tabIndex` → `a.index - b.index`. A Chrome `Tab` has no `tabIndex`, so today the comparator returns `NaN` and the sort silently does nothing.

### 9. Always-on move audit trail

**New file**: `src/lib/utils/groupMoveLog.js`

A direct mirror of `src/lib/utils/groupAdditionLog.js`: `GROUP_MOVE_LOG_KEY = 'groupMoveLog'`, `GROUP_MOVE_LOG_CAP = 100`, a `MoveSource` vocabulary (`worker:auto-group`, `worker:navigation-eject`, `worker:auto-group-eject`, `worker:no-matching-label`, `worker:auto-close-revisit`, `ui:drag`), and a clock-free `buildGroupMoveEntry(source, details)` recording `{ t, source, action: 'group' | 'ungroup', tabId, fromGroupId, toGroupId, labelTitle, urlKey }`. Reuses the existing pure `appendGroupingLog` ring buffer.

**New file**: `src/lib/utils/groupMoveLog.test.js` — entry shape, array coercion, cap behavior, mirroring `groupAdditionLog.test.js`.

**File**: `service_worker.js` — add a `recordMove(source, details)` beside `recordAddition` / `recordRemoval` (69-101) and call it at each *issued* `chrome.tabs.group` / `chrome.tabs.ungroup` (i.e. after the §2 guard passes, so the trail records real movement and never a suppressed no-op). Unconditional, like its two siblings; read back with `chrome.storage.local.get('groupMoveLog', console.log)`.

## Reused existing code

- `urlKeyIsMember` from `service_worker.js` (glossary entry: `urlKeyIsMember`) — the membership test for §6 and §7; it already null-tolerates a missing label.
- `navigatedAwayFromRecordedSlot` from `src/lib/utils/navigatedAwayFromRecordedSlot.js` (glossary entry: `navigatedAwayFromRecordedSlot`) — unchanged; §3 fixes the *caller's* handling of its refusal, not the predicate.
- `samePageKey` from `src/lib/utils/samePageKey.js` (glossary entry: `samePageKey`) — the in-page-vs-navigation test §7 narrows rather than replaces.
- `appendGroupingLog` from `src/lib/utils/groupingLog.js` (glossary entry: `appendGroupingLog`) — the ring buffer the new move trail reuses.
- `buildGroupAdditionEntry` / `AdditionSource` from `src/lib/utils/groupAdditionLog.js` and `buildGroupRemovalEntry` / `RemovalSource` from `src/lib/utils/groupRemovalLog.js` — the exact template `groupMoveLog.js` copies (key + cap + source vocabulary + clock-free builder).
- `stampLabelMembership` from `service_worker.js` (glossary entry: `stampLabelMembership`) — its changed-check is the existing precedent for "a steady-state pass must write nothing"; §2 applies the same principle to Chrome calls.
- `debugGroup` from `service_worker.js` (glossary entry: `debugGroup`) — existing flag-gated breadcrumbs stay; the new trail is the always-on complement.
- Test harness `loadWorker` in `service_worker.test.js` — the sloppy-mode `Function` wrapper strips `import` lines and injects utils as parameters, so **every new util imported by `service_worker.js` must also be added to the factory's parameter list, the returned `fns` object where needed, and the `factory(...)` call**. Missing this is the standard way a worker change breaks all 123 worker tests at once.

**Existing-implementation survey**: grepped `service_worker.js`, `src/lib`, and `popup/` for any existing idempotence/placement guard before `chrome.tabs.group` / `chrome.tabs.ungroup`. There is none — all six worker call sites (309, 535, 1262, 1387, 1415, 1495) and both UI call sites (`src/lib/components/LabelCollection/LabelCollection.jsx:257`, `src/lib/pages/App/App.jsx:148`) issue unconditionally. `chrome.tabs.move` is not called anywhere in the codebase. No `groupMoveLog`-equivalent exists (only `groupingLog`, `groupAdditionLog`, `groupRemovalLog`, none of which record placement calls).

## Reproduction Test

Pins the refuse-append re-group loop (root cause 1): a tab already sitting in its group, whose live URL is not yet a recorded member because `recordInGroupTab` refused the append, must not have `chrome.tabs.group` called on it — that call repositions the tab in the strip and, because the refusal leaves state unchanged, it repeats on every subsequent pass.

**Target**: `service_worker.test.js` — new test inside the existing `describe('groupTabs', ...)` block (line 965). Run with `codeyam-editor editor refresh-tests --test service_worker.test.js`.

```js
// A tab already inside its group must never be handed to chrome.tabs.group. On the
// refuse-append path (recordInGroupTab returns without recording, because the tab
// merely navigated away from its recorded slot) the tab's state is unchanged, so a
// group call here repositions it in the tab strip on EVERY pass — the user-visible
// "my tabs keep jumping around" loop, fed by onMoved -> updateActiveTabs ->
// storage.onChanged -> groupTabs.
it('never re-groups a tab that is already in the target group', async () => {
  chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'Work', color: 'blue' }));
  chrome.tabGroups.query.mockImplementation((_q, cb) => cb([{ id: 5, windowId: 1, title: 'Work' }]));
  const labels = { Work: { title: 'Work', urlKeys: ['url-https://a.com/apps'] } };
  await fns.groupTabs(
    [{
      tabKey: 'tab-7',
      urlKey: 'url-https://a.com/apps/123',
      pinned: false,
      groupId: 5,
      labelTitle: 'Work',
      labelUrlKey: 'url-https://a.com/apps',
    }],
    labels
  );
  expect(chrome.tabs.group).not.toHaveBeenCalled();
});
```

Status: PROPOSED — confirm red at execution. Expected failure: `groupTabs` reaches `recordInGroupTab`, which takes the `navigatedAwayFromRecordedSlot` early return at service_worker.js:1344 without recording the urlKey, then queues the tab at 1464-1465 anyway; `groupLabeledTab` calls `chrome.tabs.group({ tabIds: [7], groupId: 5 })`, so `not.toHaveBeenCalled()` fails with "expected 'group' to not be called at all, but was called 1 time". The stub-shape details (whether the `tabGroups.query` callback needs to be async-flushed before the assertion) are to be confirmed empirically at execution — the mock invokes its callback synchronously, so `await fns.groupTabs(...)` is expected to be sufficient, but verify the test is genuinely red before writing the fix.

## Scenarios to Demonstrate

- **Steady state issues no Chrome calls** — a window whose tabs already match their labels: repeated `groupTabs` passes call neither `chrome.tabs.group` nor `chrome.tabs.ungroup`, so `onMoved` never fires and the feedback loop is quiet. The core regression guard.
- **Refuse-append tab stays put** — the reproduction above, plus a second pass confirming the tab's position is unchanged.
- **Genuine auto-group still works** — an ungrouped tab whose urlKey is a recorded member is grouped exactly once, and is not re-grouped on the next pass.
- **Two windows, one label** — the same label has matching tabs in window A and window B; each window gets its own Chrome group, no tab crosses windows, no tab is closed and re-created.
- **Post-restart cold start** — persisted `activeTabs` holds tab ids that now belong to different tabs; the first worker wake groups/ungroups nothing until live tabs are read.
- **Auto-close revisit** — returning to a page the Closer closed, whose URL is a label member: the tab stays in its group (no out-and-back jump); a non-member is still ungrouped as before.
- **URL recorded in two labels** — the tab lands in exactly one group and stays there across passes.
- **SPA path rewrite** — a grouped tab whose site rewrites its own pathname to another URL in the same label is not ejected; a rewrite to a non-member URL still ejects.
- **Move trail** — `chrome.storage.local.get('groupMoveLog')` after a session shows one entry per real movement, each naming its source, and nothing for suppressed no-ops.