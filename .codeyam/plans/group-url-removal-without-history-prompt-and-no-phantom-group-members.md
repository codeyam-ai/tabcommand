---
title: "Group Url Removal Without History Prompt and No Phantom Group Members"
mode: ui
createdAt: "2026-07-29T15:27:51Z"
source: manual
---

## Summary

Two related group-membership bugs. First, removing a URL from a group asks a
second question — *"Also delete … from your history entirely?"* — that nobody
wants when they clicked the group row's ✕; the ✕ means "un-file this page", so
the history prompt is pure noise and one stray Enter destroys history. Drop that
second confirm entirely (the first, "remove from the group?" confirm stays).
Second, groups accumulate members the user never added: the CodeYam group now
holds several "App Store Connect" rows from a single add. The suspected cause is
the service worker's grouping-sync path (`recordInGroupTab`) appending a grouped
tab's *live* urlKey as a new permanent member after that tab navigated within the
site — `appstoreconnect.apple.com/apps` → `/apps/123/distribution` is a different
path, so the existing same-page drift heal doesn't cover it, and each navigation
that the eject path missed (MV3 worker teardown, ungroup races) lands another key.
Fix it by refusing to append for a tab that is navigating away from the page it
was already recorded under, and — because the only always-on grouping trail today
records *removals* — add the mirror-image group-ADDITION audit log so the next
unexplained member is provable rather than inferred.

## Key Decisions

- **Delete the second confirm, don't demote it to a menu item.** The comment at
  `LabelCollection.jsx:262-266` argues the history delete is "an explicit,
  additive second choice", but in practice it fires on every group removal and
  the user has to say no each time. History deletion already has its own
  dedicated entry points (the History page's row ✕ and `Url`'s remove action,
  both routing through `deleteUrlFromHistory`), so nothing is lost by removing it
  here.
- **Keep the first confirm** ("remove the url … from the group …?") — there is no
  undo for group removal, so a single guard stays.
- **Guard the append, don't dedupe by title or host.** A group legitimately holds
  several pages of one site, so "collapse rows with the same title" would be
  wrong. The precise signal is per-tab: *this tab* already occupies a slot in
  *this label*, and its URL moved. That is a navigation, not a new member.
- **Persist the per-tab stamp on the `activeTabs` entry, not in a module-level
  Map.** MV3 tears the worker down constantly, and the post-teardown sync is
  exactly the window where the bogus append happens — an in-memory map would be
  empty precisely when it is needed. `activeTabs` already lives in
  `chrome.storage.local` and is keyed by `tabKey`, and entries vanish when the tab
  closes, so cleanup is free.
- **Additions get their own log key, mirroring `groupRemovalLog`.** Same ring
  buffer (`appendGroupingLog`), same entry shape, same always-on/no-flag policy —
  `debugGrouping` breadcrumbs are default-off and console-only, which is why this
  bug had no evidence trail.

## Implementation

### 1. Remove the "also delete from history" prompt

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

In `removeUrl`, delete the trailing block (lines ~261-268): the explanatory
comment, the `confirm("Also delete … from your history entirely?")`, and the
`deleteUrlFromHistory(urlKey)` call. The group removal, its
`GROUP_REMOVAL_LOG_KEY` audit entry, the `activeTabs` ungroup side-effect and the
`setPartialState({ currentUrlKeys })` all stay exactly as they are — only the
second dialog goes.

Then drop the now-unused `deleteUrlFromHistory` import (line 26). Verify no other
reference remains in this file before removing it. `deleteUrlFromHistory` itself
stays — `Url.jsx:153` and `useHistoryRows.js:97` still use it — but its header
comment (`src/lib/utils/deleteUrlFromHistory.js:3-6`) names "the group card's
'also delete from history' path" as a caller; update that sentence so the comment
doesn't describe a call site that no longer exists.

### 2. Group-addition audit trail

**New file**: `src/lib/utils/groupAdditionLog.js`

Direct mirror of `src/lib/utils/groupRemovalLog.js`, and it should read like it
(same explanatory-comment density, same clock-free purity — `t` is
caller-supplied):

- `GROUP_ADDITION_LOG_KEY = 'groupAdditionLog'`, `GROUP_ADDITION_LOG_CAP = 100`.
- `AdditionSource` — the fixed vocabulary of paths that can add a member:
  `WORKER_GROUP_CHANGED: 'worker:group-changed'` (a tab's groupId changed —
  `service_worker.js:1110`), `WORKER_IN_GROUP_SYNC: 'worker:in-group-sync'`
  (`recordInGroupTab`'s seed/append), `WORKER_DRIFT_HEAL: 'worker:drift-heal'`
  (`healDriftedLabelSlot` rewrote a slot to a new key — an add-in-place worth
  recording), `UI_DRAG: 'ui:drag'` (`dragReducer.js:36`).
- `buildGroupAdditionEntry(source, { labelTitle, urlKeys, tabId, total, t })`
  returning `{ t, source, label, urlKeys, tabId, total }`, with the same
  array-coercion and `tabId == null ? null : tabId` handling as the removal
  builder. `total` is the label's member count AFTER the add (the additive
  counterpart of `remaining`).

**New file**: `src/lib/utils/groupAdditionLog.test.js` — mirror
`groupRemovalLog.test.js`'s cases against the new builder.

**File**: `src/lib/utils/index.js` — export the new module alongside the others if
that file re-exports utils.

**File**: `service_worker.js`

There is already a `recordRemoval` helper doing the read-append-write for
removals; add the symmetric `recordAddition(source, { labelTitle, urlKeys, tabId,
total })` next to it, reusing `appendGroupingLog` with the new key and cap. Call
it from every append site:

- `handleActiveTabsGroupChanges` after `label.urlKeys.push(newTab.urlKey)`
  (line ~1110) — source `WORKER_GROUP_CHANGED`.
- `recordInGroupTab` on both the label-seed branch and the `if (!found)` append
  (lines ~1187 and ~1208) — source `WORKER_IN_GROUP_SYNC`.
- The `onUpdated` drift-heal (line ~292) and `recordInGroupTab`'s heal, when
  `healDriftedLabelSlot` returns `mutated && !removed` (the position-preserving
  rewrite) — source `WORKER_DRIFT_HEAL`, with both the previous and new key in the
  entry so a rewrite chain is readable.

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx` (or wherever
`dragReducer`'s result is persisted) — write a `UI_DRAG` addition entry on the
drop that inserts a urlKey into a label, matching how the drag already writes its
`ui:drag` removal entry via `describeDragRemoval`.

Document the read-back in the new module's header, matching the removal log's:
`chrome.storage.local.get('groupAdditionLog', console.log)`.

### 3. Never append for a tab navigating away from its recorded page

**File**: `service_worker.js`

Stamp the membership, then honor it:

- **Stamp.** Wherever a tab's urlKey is recorded into a label — the
  `handleActiveTabsGroupChanges` push and `recordInGroupTab`'s seed/append —
  record on that tab's `activeTabs` entry which label/key it was filed under:
  `labelTitle` and `labelUrlKey`. Persist it in the same `update({ labels,
  activeTabs })` write. `recordInGroupTab` is called from `groupTabs`'s loop over
  `activeTabs`, so the entry object is already in hand there; pass it (or the
  stamp back to the caller) rather than re-reading storage.
- **Carry it forward.** The `activeTabs` rebuild at `service_worker.js:458-469`
  constructs a fresh object per tab and would drop any field it doesn't name —
  carry `labelTitle`/`labelUrlKey` from `existingTab` exactly the way `openedAt`
  and `tabCommandPinned` already are. Without this the stamp is erased on the very
  next tab update and the guard never fires.
- **Guard.** In `recordInGroupTab`, before the `if (!found) label.urlKeys.push(…)`
  append: if the tab carries `labelTitle === group.title` and a `labelUrlKey` that
  is still a member of `label.urlKeys` and differs from `activeTab.urlKey`, this
  is the same tab navigating away from the page it was filed under. Do **not**
  append and do not mutate `label.urlKeys`; emit a `debugGroup` breadcrumb naming
  the recorded key, the live key and the label, and return. Group membership for
  the tab itself is already owned by the `onUpdated` eject path
  (`service_worker.js:255-266`), which ungroups on a real navigation — this change
  only stops the *label* from growing a member the user never filed.
- Leave the drift-heal ahead of the guard untouched: a same-page `?query` drift
  must still rewrite in place, and `healDriftedLabelSlot` returning `found` short
  -circuits before the new check anyway.
- The genuinely-new-URL append must survive: a tab with no stamp, or one whose
  stamp points at a different label, still appends as it does today (the existing
  "still appends a genuinely new URL" test pins this).

**File**: `service_worker.test.js` — extend the `recordInGroupTab` describe block
with the reproduction below plus a companion case proving an unstamped tab still
appends.

### 4. Validate the diagnosis at execution

The App Store Connect duplication is diagnosed by reading the code, not from a
captured log — the addition trail in step 2 is what makes it provable. At
execution, after the change is loaded, add a page to a group, navigate that tab
deeper into the same site, and read back
`chrome.storage.local.get('groupAdditionLog', console.log)`: the group must gain
no second member, and any entry that does appear names the exact source path. If
the log shows the duplicate arriving via `worker:group-changed` or `ui:drag`
instead of `worker:in-group-sync`, the guard is in the wrong place — say so rather
than declaring the fix done.

## Reused existing code

- `deleteUrlFromHistory` from `src/lib/utils/deleteUrlFromHistory.js` (glossary
  entry: `deleteUrlFromHistory`) — kept, only unhooked from the group card.
- `appendGroupingLog` from `src/lib/utils/groupingLog.js` (glossary entry:
  `appendGroupingLog`) — the ring buffer the new addition log reuses verbatim.
- `buildGroupRemovalEntry` / `RemovalSource` / `GROUP_REMOVAL_LOG_KEY` from
  `src/lib/utils/groupRemovalLog.js` — the template the addition log mirrors.
- `healDriftedLabelSlot` from `src/lib/utils/healDriftedLabelSlot.js` (glossary
  entry: `healDriftedLabelSlot`) — unchanged; the new guard runs only when it
  reports `found: false`.
- `recordInGroupTab` and `handleActiveTabsGroupChanges` in `service_worker.js`
  (glossary entries: `recordInGroupTab`, `handleActiveTabsGroupChanges`; tests in
  `service_worker.test.js`) — the two append sites being guarded/instrumented.
- `samePageKey` from `src/lib/utils/samePageKey.js` — the existing
  navigation-vs-in-page-rewrite rule; the guard deliberately does **not** reuse it
  (a path change IS a navigation here) but the distinction is why the drift heal
  alone doesn't cover this bug.
- `describeDragRemoval` from `src/lib/utils/describeDragRemoval.js` — the drag
  path's existing removal-entry builder, the shape the drag addition entry follows.

**Existing-implementation survey.** Grepped for an existing group-addition audit
trail before proposing one: `groupRemovalLog.js` is removals-only, `groupingLog.js`
is a generic ring buffer gated behind the default-off `debugGrouping` flag with
console-only `debugGroup` call sites, and no `groupAdditionLog`/`AdditionSource`
symbol exists anywhere in the tree. Nothing equivalent is implemented today. No
existing per-tab membership stamp exists either — `activeTabs` entries carry
`tabKey`, `urlKey`, `pinned`, `groupId`, `activeAt`, `openedAt`,
`tabCommandPinned`, `autoClosedAt`, `active` and nothing label-related.

## Reproduction Test

Pins the two behaviors: the group ✕ must ask exactly one question, and a grouped
tab navigating deeper into the same site must not become a second member.

**Target 1**: `src/lib/components/LabelCollection/LabelCollection.test.jsx` — run
with `codeyam-editor editor refresh-tests --test "LabelCollection"`.

```jsx
// removing a url from a group asks about the group only — never about history
it('does not offer to delete the url from history', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  seed('labels', {
    Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-a', 'url-b'] }
  });
  seed('url-a', { title: 'Alpha', favicon: '' });
  seed('url-b', { title: 'Beta', favicon: '' });
  seed('allUrls', ['url-a', 'url-b']);
  installChromeShim();

  const { container } = renderCollection({
    title: 'Work',
    backgroundColor: '#1873E4',
    urlKeys: ['url-a', 'url-b'],
    expanded: true
  });

  await screen.findByText('Alpha');
  await userEvent.click(container.querySelectorAll('[data-tool-tip="Remove"]')[0]);

  await waitFor(async () => {
    const { labels } = await get('labels');
    expect(labels.Work.urlKeys).toEqual(['url-b']);
  });

  // exactly one dialog, and it is the group question
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(confirmSpy.mock.calls[0][0]).not.toMatch(/history/i);
  // the page itself survives — no tombstone was written
  const { allUrls, deletedUrls } = await get(['allUrls', 'deletedUrls']);
  expect(allUrls).toContain('url-a');
  expect(deletedUrls || {}).not.toHaveProperty('url-a');
});
```

**Target 2**: `service_worker.test.js`, inside the existing
`describe('recordInGroupTab')` — run with
`codeyam-editor editor refresh-tests --test "recordInGroupTab"`.

```js
// Reproduction: one App Store Connect page was filed into the group, then that
// same tab navigated deeper into the site. A path change is not a same-page
// drift, so healDriftedLabelSlot finds no slot and the sync path appends the new
// URL as a SECOND permanent member — which is how the CodeYam group ended up
// with several "App Store Connect" rows from a single add.
it('does not add a second member when the recorded tab navigates within the site', () => {
  const labels = {
    CodeYam: {
      title: 'CodeYam',
      urlKeys: ['url-https://appstoreconnect.apple.com/apps'],
      color: '#1873E4',
    },
  };
  fns.recordInGroupTab(
    labels,
    { title: 'CodeYam', color: 'blue' },
    {
      tabKey: 'tab-7',
      urlKey: 'url-https://appstoreconnect.apple.com/apps/123/distribution',
      groupId: 5,
      labelTitle: 'CodeYam',
      labelUrlKey: 'url-https://appstoreconnect.apple.com/apps',
    }
  );
  expect(labels.CodeYam.urlKeys).toEqual(['url-https://appstoreconnect.apple.com/apps']);
});
```

Status: PROPOSED — confirm red at execution. Expected failures: (1) the
LabelCollection case fails on `expect(confirmSpy).toHaveBeenCalledTimes(1)` —
received 2 — and, because the existing mock answers `true` to both, also on the
`allUrls` / `deletedUrls` assertions once `deleteUrlFromHistory` has run. (2) The
worker case fails on the `toEqual` — `urlKeys` comes back with the
`/apps/123/distribution` key appended. The exact `deletedUrls` shape after the
`Chrome.remove` may need adjusting against the shim at execution; the
`confirmSpy` count is the assertion that carries the repro. Both stamp field
names (`labelTitle` / `labelUrlKey`) are the proposed shape — if execution picks
different names, update the test with them.

## Scenarios to Demonstrate

- Group card expanded with several members, clicking a row's ✕ — one dialog,
  naming the group, no mention of history.
- Declining that dialog — the member stays, nothing is written.
- The CodeYam group as it looks today: multiple "App Store Connect" rows, each
  carrying the disambiguating URL subtitle (the ambiguous-title path already in
  `LabelCollection`) — the before state.
- The same group after the guard: one App Store Connect member, unchanged as the
  tab navigates deeper into the site.
- A genuinely new URL dragged into the group — still added, with a `ui:drag`
  entry in the addition log.
- A Google Doc whose `?tab=` query drifts while grouped — still healed in place
  at its original position, no duplicate (regression guard on the existing
  behavior).
- Empty group (no members) — the ✕ path is unreachable, card renders its empty
  state.