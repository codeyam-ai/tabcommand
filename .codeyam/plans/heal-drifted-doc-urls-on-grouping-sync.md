---
title: "Heal Drifted Doc URLs on the Grouping-Sync Path"
mode: backend
createdAt: "2026-07-18T17:51:11Z"
source: manual
---

## Summary

A Google Doc keeps jumping from the **top** to the **bottom** of a label/group
(e.g. "Ambiguity Everywhere"). Root cause: Google Docs rewrites its own URL's
`?tab=t.…` query string in place as you click around a document. The group
membership check (`urlKeyIsMember`) compares **exact** urlKeys (`getUrlKey`
keeps the query string), so once the live `?tab=` value drifts away from the
value recorded in the label, the doc is no longer seen as a member. There is
already a drift-heal that rewrites the recorded slot **in place** — but it only
runs inside the `onUpdated` navigation handler. The grouping-**sync** path
(`groupTabs` → `recordInGroupTab`) has no such heal: when MV3 tears down the
service worker and wipes in-memory state, the next sync sees the drifted doc as
a non-member and **appends** its live urlKey to the end of `label.urlKeys`,
dropping the doc to the bottom of the group. A later `onUpdated` heal then
splices out the stale top slot, making the bottom position stick. The fix is to
make the record path drift-aware: before appending, heal a same-page slot in
place instead of pushing a duplicate to the end.

## Key Decisions

- **Heal in place on the sync path, mirroring the existing `onUpdated` heal.**
  The `onUpdated` handler already has the correct logic (`service_worker.js`
  lines 229–241): locate the label slot by page identity via `samePageKey`, and
  rewrite that slot's key to the live urlKey (or drop it if the live key already
  exists). We apply the same rule inside `recordInGroupTab` so a drifted-but-
  same-page doc keeps its original position instead of being re-appended. Chosen
  over widening `urlKeyIsMember` to use `samePageKey`, because the comment at
  `service_worker.js:216–218` is explicit that membership/eject must stay an
  **exact-key** test — `samePageKey` must never become the membership predicate.
  Healing at the record step preserves that invariant.

- **Keep the heal centralized in `recordInGroupTab`.** `groupTabs` already
  funnels the "non-auto-grouped tab in a group with an unrecorded URL" case
  through `recordInGroupTab` (`service_worker.js:1176`). Putting the heal there
  covers the startup-sync path without touching the exact-key branch at line
  1160, and automatically benefits any other caller of `recordInGroupTab`.

- **Preserve position, not just identity.** The bug is specifically about
  *order*, so the heal must rewrite the existing slot at its current index (via
  the `samePageKey` match), never remove-and-re-add. This keeps the doc at the
  top where the user put it.

- **Do not change `getUrlKey` or `samePageKey`.** Both are intentional and
  well-documented; `getUrlKey` keeping the query string is needed so distinct
  non-doc query URLs stay distinct, and `samePageKey` deliberately drops the
  query for the page-identity comparison. The fix is purely in the record path.

## Implementation

### 1. Make `recordInGroupTab` heal a drifted same-page slot instead of appending

**File**: `service_worker.js` (function `recordInGroupTab`, lines 1068–1088)

Today the `else` branch unconditionally does `label.urlKeys.push(activeTab.urlKey)`
(line 1085). Change it so that before appending it checks whether the label
already holds a slot for the *same page* (same `samePageKey`) as the incoming
tab's URL:

- Recover the incoming live URL from `activeTab.urlKey` by stripping the
  `url-` prefix (mirror `service_worker.js:192` / line 231).
- Find `idx = label.urlKeys.findIndex(k => samePageKey(k.replace(/^url-/, '')) === samePageKey(liveUrl))`.
- If `idx > -1` (a same-page slot exists — this is the drifted doc):
  - If `label.urlKeys[idx] === activeTab.urlKey`, it already matches exactly —
    do nothing (no duplicate, no move).
  - Else if `activeTab.urlKey` already appears elsewhere in `urlKeys`, splice
    out the stale slot at `idx` (mirror the drop at `service_worker.js:238`) so
    we don't create a duplicate.
  - Else rewrite the slot in place: `label.urlKeys[idx] = activeTab.urlKey`
    (mirror `service_worker.js:240`). **This is the position-preserving heal.**
- If `idx === -1` (genuinely new URL for this label): keep today's behavior —
  `label.urlKeys.push(activeTab.urlKey)`.

Then `update({ labels })` as today. The `!label` seed branch (lines 1078–1083)
is unchanged.

`samePageKey` is already imported at `service_worker.js:3`, so no new import is
needed.

### 2. (Verify only — likely no change) confirm the `handleActiveTabsGroupChanges` add-path

**File**: `service_worker.js` (function `handleActiveTabsGroupChanges`, line ~1010)

This path appends on a *real* `groupId` change (the user genuinely moved the tab
between Chrome groups), which is correct — that is not the drift scenario and
should stay an append. Confirm during implementation that the reproduction is
fully resolved by the `recordInGroupTab` change alone and this path does not
need to be touched. If a scenario shows drift also flowing through here, apply
the same same-page heal; otherwise leave it as-is and note why.

## Reused existing code

- `samePageKey` from `src/lib/utils/samePageKey.js` (glossary/import at
  `service_worker.js:3`) — the page-identity comparison; the heal reuses it
  exactly as the `onUpdated` handler does.
- `getUrlKey` from `service_worker.js:845` — how live urlKeys are formed; the
  heal writes keys in this same shape.
- The existing `onUpdated` drift-heal at `service_worker.js:229–241` — the
  reference implementation whose in-place-rewrite / drop-if-duplicate logic the
  new code mirrors.
- `urlKeyIsMember` from `service_worker.js:57` — left unchanged; stays the
  exact-key membership test as documented.

## Reproduction Test

A Google Doc whose `?tab=` query string has drifted must stay at its recorded
position in the group instead of being appended to the bottom.

**Target**: `service_worker.test.js` — add to the existing
`describe('recordInGroupTab', ...)` block (around line 771). Run with
`codeyam-editor editor refresh-tests --test recordInGroupTab`.

```js
// heals a drifted same-page doc urlKey in place instead of appending it to the bottom
it('rewrites a drifted Google Doc slot in place rather than pushing to the end', () => {
  const labels = {
    'Ambiguity Everywhere': {
      title: 'Ambiguity Everywhere',
      urlKeys: [
        'url-https://docs.google.com/document/d/ABC/edit?tab=t.0',
        'url-https://other.com'
      ],
      color: '#1873E4'
    }
  };
  fns.recordInGroupTab(
    labels,
    { title: 'Ambiguity Everywhere', color: 'blue' },
    {
      tabKey: 'tab-7',
      urlKey: 'url-https://docs.google.com/document/d/ABC/edit?tab=t.5',
      groupId: 5
    }
  );
  // The doc stays at index 0 (top) with its live key; no duplicate appended.
  expect(labels['Ambiguity Everywhere'].urlKeys).toEqual([
    'url-https://docs.google.com/document/d/ABC/edit?tab=t.5',
    'url-https://other.com'
  ]);
});
```

Status: PROPOSED — confirm red at execution. Expected failure with today's
code: `recordInGroupTab` appends the drifted key, yielding
`['url-...?tab=t.0', 'url-https://other.com', 'url-...?tab=t.5']` — the doc is
duplicated and pushed to the bottom, so the `toEqual([...])` assertion fails.

## Scenarios to Demonstrate

- **Happy path — doc holds its top slot:** A label "Ambiguity Everywhere" with a
  Google Doc at the top. The doc's tab rewrites `?tab=t.0` → `?tab=t.5`, then a
  grouping sync runs (simulating an MV3 restart that wiped in-memory state). The
  doc remains at the top of the group.
- **Same-tab, already-exact:** The incoming urlKey exactly matches the recorded
  slot — no change, no duplication, order preserved.
- **Drop-if-duplicate:** The live drifted key already exists lower in the group
  (e.g. from a prior append before this fix shipped) — the stale higher slot is
  removed, leaving a single entry, no duplication.
- **Genuinely new URL still appends:** A non-doc URL that is a different page
  (`samePageKey` differs) is recorded at the end, exactly as before — the fix
  does not change ordering for real new members.
- **Non-drift group move preserved:** A tab whose Chrome `groupId` genuinely
  changed still appends to its new label (via `handleActiveTabsGroupChanges`) —
  confirming the fix is scoped to same-page drift only.
