---
title: "Stamp Confirmed Group Membership So the Phantom-Member Guard Actually Fires"
mode: ui
createdAt: "2026-07-30T11:49:47Z"
source: manual
---

## Summary

Phantom group members are still appearing: open a page that is already filed in a
group, navigate deeper into the same site, and the new page joins the group
permanently. The previous plan built the right guard and then wired it to a
signal nothing writes. `navigatedAwayFromRecordedSlot` fires only when the tab
carries a `labelTitle`/`labelUrlKey` stamp, but `stampLabelMembership` is called
from exactly two places (`service_worker.js:1174` and `:1260`) and **both sit
inside branches that just appended a NEW key**. The flow the user actually
performs — click an existing URL in a group — never appends anything: `groupTabs`
recognizes the URL as a member at `service_worker.js:1420`, clears the
auto-group flag, and `continue`s without stamping. So when that tab navigates,
the guard reads `activeTab.labelUrlKey === undefined`, returns false, and the
`else` branch pushes the new URL as a second member. The fix is to stamp on the
paths that *confirm* membership rather than only the ones that *create* it, make
the stamp helper report whether it actually changed anything (the confirm branch
runs on every storage change, so an unconditional write there is a
`storage.set` → `onChanged` → `groupTabs` loop), and put the same guard on
`handleActiveTabsGroupChanges`' still-unguarded push.

## Key Decisions

- **Stamp where membership is confirmed, not only where it is created.** Filing a
  URL into a label and a tab *occupying* that label's slot are different events,
  and only the second one is guaranteed to happen in the reported flow. The
  confirm branch (`urlKeyIsMember` → `continue`) is also self-healing: it runs on
  every `groupTabs` pass, so tabs that were grouped before this change get
  stamped on the next storage write rather than needing a migration.
- **`stampLabelMembership` must return "changed", not always `true`.** Its two
  current callers append first, so the stamp is always new and the constant
  `true` is harmless. The new call site is hot — `groupTabs` runs on *every*
  `labels`/`activeTabs` change (`service_worker.js:1050-1064`) and `update()` is
  a bare `chrome.storage.local.set` (`:624`) whose write re-enters `onChanged`.
  Writing `activeTabs` unconditionally there is an infinite write loop. Making
  the helper a no-op-returns-false when the stamp already matches fixes that at
  the source and both existing callers inherit the skip for free.
- **One batched `activeTabs` write per `groupTabs` pass.** Two branches in the
  same loop can now stamp; accumulate a flag and write once after the loop
  instead of an `update()` per tab.
- **Guard `handleActiveTabsGroupChanges` too, don't rely on the eject path.** Its
  push at `:1168-1178` has no navigated-away check. Once the stamp is reliable
  the guard is a one-line condition there, and it closes the
  ungroup-then-regroup race the in-memory `pendingUngroups` set cannot (that
  `Set` is module-level, so MV3 teardown empties it exactly when the bogus append
  happens).
- **Do not clean up existing phantoms.** A group legitimately holds several pages
  of one site, so nothing distinguishes a phantom row from a page the user filed
  deliberately. An automatic collapse would delete real members. Existing
  duplicates get removed by hand; this plan only stops new ones.
- **The regression test must not hand-feed the stamp.** The previous plan's repro
  (`service_worker.test.js:1044`) calls `recordInGroupTab` directly with
  `labelTitle`/`labelUrlKey` already set on the tab — it asserted the guard's
  logic and went green while production never produced that input. The new tests
  go through `groupTabs`, which is where the stamp has to originate.

## Implementation

### 1. Make the stamp helper report whether it changed anything

**File**: `service_worker.js` (`stampLabelMembership`, ~line 115)

Return early with `false` when `activeTab.labelTitle === labelTitle &&
activeTab.labelUrlKey === urlKey`; otherwise assign both fields and return
`true`. Update the closing sentence of the header comment — it currently says
"Returns true so callers can tell whether they must persist the array", which
becomes "Returns whether the stamp actually changed, so a caller on a hot path
does not write `activeTabs` on every pass (see the write-loop note in
`groupTabs`)". Both existing callers already branch on the return value, so no
call-site change is needed for them.

### 2. Stamp the tab when its URL is confirmed as an existing member — the bug

**File**: `service_worker.js` (`groupTabs`, the `urlKeyIsMember` branch, ~1420)

This is the branch the reported flow takes and the one line that makes the
existing guard live. Inside `if (urlKeyIsMember(label, activeTab.urlKey))`,
before the `continue`, stamp `activeTab` with `group.title` and
`activeTab.urlKey` and OR the result into a loop-scoped `stampsChanged` flag.
Extend the branch comment: the tab now records *which* slot it occupies, so a
later sync can tell this tab navigating apart from a new URL joining — without
it the append guard is blind on the most common path of all.

### 3. Stamp when an ungrouped tab's URL matches a label

**File**: `service_worker.js` (`groupTabs`, the `else` branch, ~1443)

When `labels[labelTitle].urlKeys.indexOf(activeTab.urlKey) > -1` marks a tab for
auto-grouping into `labelTitle`, stamp it there too (same `stampsChanged`
accumulation). This is the earliest point the binding is known — it fires when
the user clicks a group row, before Chrome's `chrome.tabs.group` has even
landed — so it closes the window where step 2 has not run yet. Keep the existing
`debugGroup` breadcrumb as-is.

### 4. Persist the stamps once per pass

**File**: `service_worker.js` (`groupTabs`)

Declare `let stampsChanged = false` before the `for (const activeTab of
activeTabs)` loop and, after the loop but before the `labelTabIds` grouping
sweep, `if (stampsChanged) update({ activeTabs });`. Comment why it is batched
and why it is conditional: `groupTabs` is re-entered by the very `onChanged` this
write fires, so an unconditional write would loop — step 1's changed-check is
what makes this safe.

Note the interaction with `recordInGroupTab`, which does its own
`update({ labels, ...(stamped && activeTabs ? { activeTabs } : {}) })` on the
same array (`:1345`). Both writes carry the same object, so the batched write is
at worst redundant, never conflicting — but confirm at execution that a pass
which both records and stamps does not double-write.

### 5. Guard the sibling append site

**File**: `service_worker.js` (`handleActiveTabsGroupChanges`, ~1153-1178)

Add `!navigatedAwayFromRecordedSlot(label, newGroup.title, newTab)` to the
condition already testing `label.urlKeys.indexOf(newTab.urlKey) === -1 &&
!pendingUngroups.has(parseTabId(newTab))`. When it suppresses, emit a
`debugGroup` breadcrumb naming `newTab.labelUrlKey`, `newTab.urlKey` and the
label, mirroring the wording of the existing breadcrumb in `recordInGroupTab`
(`:1318`). The `oldGroup` removal block below is untouched — a genuine re-home
still moves the member.

### 6. Tests

**File**: `service_worker.test.js`

Add the two reproductions below. Also extend the existing
`'keeps an auto-grouped tab whose URL is a deliberate member'` case (~1216) with
the stamp assertion, since it already exercises the exact branch step 2 changes.

Add a `stampLabelMembership` case for the new no-op return: calling it twice with
the same values returns `true` then `false` and leaves the fields intact.

Add a `handleActiveTabsGroupChanges` case for step 5: a stamped tab whose
`groupId` moves into the label it is already filed under does not gain a second
member.

## Reused existing code

- `navigatedAwayFromRecordedSlot` from
  `src/lib/utils/navigatedAwayFromRecordedSlot.js` (glossary entry:
  `navigatedAwayFromRecordedSlot`; test:
  `src/lib/utils/navigatedAwayFromRecordedSlot.test.js`) — **unchanged**. Its
  logic is correct; this plan only supplies the input it was written to read.
- `stampLabelMembership` in `service_worker.js` (glossary entry:
  `stampLabelMembership`; test: `service_worker.test.js`) — return value
  tightened, storage location and rationale unchanged.
- `urlKeyIsMember` in `service_worker.js` (glossary entry: `urlKeyIsMember`) —
  the membership predicate whose `continue` branch gains the stamp.
- `recordInGroupTab` and `handleActiveTabsGroupChanges` in `service_worker.js`
  (glossary entries: `recordInGroupTab`, `handleActiveTabsGroupChanges`) — the
  guarded and newly-guarded append sites.
- `healDriftedLabelSlot` from `src/lib/utils/healDriftedLabelSlot.js` (glossary
  entry: `healDriftedLabelSlot`) — untouched; still runs ahead of the guard so a
  same-page `?query` drift heals in place.
- `groupAdditionLog` / `AdditionSource` from `src/lib/utils/groupAdditionLog.js`
  and `recordAddition` in `service_worker.js` — the audit trail from the previous
  plan, reused as-is to verify the fix at execution.
- The `activeTabs` rebuild at `service_worker.js:505-527` already carries
  `labelTitle`/`labelUrlKey` forward from `existingTab` — no change needed, but
  it is what makes the new stamps survive tab updates.

**Existing-implementation survey.** No new config field or gate dimension is
introduced. Grepped `stampLabelMembership` across the tree: exactly two call
sites (`service_worker.js:1174`, `:1260`), both in append branches — no
confirm-path stamp exists today, which is the defect. Grepped
`navigatedAwayFromRecordedSlot`: one call site (`:1309`), inside
`recordInGroupTab` only — `handleActiveTabsGroupChanges` has no equivalent guard
today. No batched `activeTabs` write exists in `groupTabs` today; the only
`activeTabs` write reachable from it is `recordInGroupTab`'s at `:1345`.

## Reproduction Test

Pins the missing stamp (the actual defect) and the end-to-end phantom append it
causes.

**Target**: `service_worker.test.js`, inside the existing
`describe('auto-grouped stickiness fix integration')` block — run with
`codeyam-editor editor refresh-tests --test "groupTabs"`.

```js
// Reproduction (root cause): a tab sitting in a group on a URL that IS already a
// deliberate member takes groupTabs' urlKeyIsMember `continue` branch, which
// confirms membership without recording WHICH slot the tab occupies. The append
// guard reads only that stamp, so on this path it is permanently blind.
it('stamps the label slot a confirmed member tab occupies', async () => {
  chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'CodeYam', color: 'blue' }));
  const labels = {
    CodeYam: { title: 'CodeYam', urlKeys: ['url-https://appstoreconnect.apple.com/apps'] },
  };
  const activeTab = {
    tabKey: 'tab-7',
    urlKey: 'url-https://appstoreconnect.apple.com/apps',
    pinned: false,
    groupId: 5,
  };
  await fns.groupTabs([activeTab], labels);
  expect(activeTab.labelTitle).toBe('CodeYam');
  expect(activeTab.labelUrlKey).toBe('url-https://appstoreconnect.apple.com/apps');
});

// Reproduction (user-visible): open a page already in the group, navigate deeper
// into the same site, sync again. A path change is not a same-page drift, so the
// heal finds no slot -- and with no stamp from the first pass the guard cannot
// fire, so the second page is appended as a permanent second member.
it('does not gain a member when a grouped tab navigates within the site', async () => {
  chrome.tabGroups.get.mockImplementation((id, cb) => cb({ id, title: 'CodeYam', color: 'blue' }));
  const labels = {
    CodeYam: { title: 'CodeYam', urlKeys: ['url-https://appstoreconnect.apple.com/apps'] },
  };
  const activeTab = {
    tabKey: 'tab-7',
    urlKey: 'url-https://appstoreconnect.apple.com/apps',
    pinned: false,
    groupId: 5,
  };
  // Pass 1: the tab is confirmed as a member of the group it is sitting in.
  await fns.groupTabs([activeTab], labels);
  // The user navigates deeper into the same site; the tab is still in the group
  // (the onUpdated eject is async, and its pendingUngroups set is empty after an
  // MV3 teardown).
  activeTab.urlKey = 'url-https://appstoreconnect.apple.com/apps/123/distribution';
  await fns.groupTabs([activeTab], labels);
  expect(labels.CodeYam.urlKeys).toEqual(['url-https://appstoreconnect.apple.com/apps']);
});
```

Status: PROPOSED — confirm red at execution. Expected failures: (1) the first
case fails on `expect(activeTab.labelTitle).toBe('CodeYam')` — received
`undefined`, because the `urlKeyIsMember` branch `continue`s without stamping.
(2) The second fails on the `toEqual` — `urlKeys` comes back as
`['url-https://appstoreconnect.apple.com/apps',
'url-https://appstoreconnect.apple.com/apps/123/distribution']`. The
`chrome.storage.local.get` mock may need seeding to match the surrounding
`describe`'s pattern (the existing cases in this block mock it per-test); adjust
at execution if `groupTabs` reads storage on a path these fixtures hit. The
`chrome.tabGroups.get` mock shape is copied verbatim from the adjacent passing
tests, so it is known good.

### Verify against the live audit trail

After loading the change: open a page that is already a group member, navigate
deeper into the site, then read
`chrome.storage.local.get('groupAdditionLog', console.log)`. The group must gain
no member, and the log must gain no entry for that navigation. If an entry *does*
appear, its `source` names which path still leaks — `worker:in-group-sync` means
the stamp is still not reaching `recordInGroupTab`, `worker:group-changed` means
step 5's guard is misplaced, `ui:drag` means the diagnosis is wrong entirely.
Report what the log says rather than declaring the fix done.

## Scenarios to Demonstrate

- A group holding one App Store Connect page — the correct steady state after the
  fix, with the tab open on that page.
- The same group after the tab navigated deeper into the site: still one member,
  and the tab has been ejected from the group by the existing `onUpdated` path.
- The before state: a group with several identical-looking "App Store Connect"
  rows, each carrying the disambiguating URL subtitle.
- A group legitimately holding several pages of one site, each filed
  deliberately — proof the guard is per-tab and not collapsing by host.
- A genuinely new URL dragged into a group — still added.
- A Google Doc whose `?tab=` query drifts while grouped — still healed in place at
  its original position, no duplicate (regression guard).
- A tab moved by hand from group A into group B — still re-homed, member removed
  from A and added to B (regression guard on step 5's new condition).
- Empty group — renders its empty state, no grouping paths reachable.