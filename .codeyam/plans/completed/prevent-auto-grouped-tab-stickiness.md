---
title: "Prevent Chrome Auto-Grouped Tabs From Sticking to Labels"
mode: backend
createdAt: "2026-06-29T18:13:08Z"
source: prototype
step: 8
---

## Summary

Users repeatedly saw URLs they never added show up as permanent members of a
tab group/label. Instrumented logging (`[TC-GROUP]`) on the live extension
proved the mechanism end-to-end: **Chrome** natively places a new tab opened
*from* a grouped tab into that same group (the new tab is born with
`groupId > -1` and an `openerTabId` pointing at the originating grouped tab,
before any of our code runs and before its URL has even loaded). Our service
worker then **made that membership permanent** — `groupTabs` treated "this tab
is currently in a group" as "the user wants this URL bound to the label" and
wrote the URL into `labels[title].urlKeys`, so it auto-re-grouped forever, even
after the user removed it.

The prototype fixes this by distinguishing Chrome's per-tab inheritance from
deliberate user intent: tabs Chrome auto-groups at birth are flagged and, once
their real URL loads, are **ejected from the group** instead of recorded —
unless that URL is genuinely a deliberate member of the label. A fresh-storage
membership re-check before ejecting eliminates an ungroup→regroup flicker for
URLs that legitimately belong.

## Key Decisions

- **Stop making auto-grouped tabs sticky AND eject them** (user-selected over
  the more conservative "stop sticky but leave them grouped"). A freshly opened
  tab no longer silently joins — and permanently binds to — a group.
- **Detect Chrome inheritance at `onCreated`**, where `tab.groupId > -1` on a
  brand-new tab is the unambiguous signal (the URL is still empty at that point,
  so this is purely relationship-based, exactly like Chrome's behavior). Tracked
  in an in-memory `autoGroupedTabs` Set, mirroring the existing `pendingUngroups`
  pattern.
- **Membership beats the flag.** If the tab's URL is a deliberate member of the
  group's label, it stays grouped and the flag is cleared — whatever put it
  there, it belongs.
- **Explicit intent overrides the flag.** A deliberate groupId change
  (`handleActiveTabsGroupChanges`) and the in-app drag-to-label both make the
  URL a real member, which the membership check then honors; the flag is cleared
  on an explicit group change.
- **Fresh-storage re-check before ejecting** to avoid a flicker: `groupTabs`
  runs on overlapping storage events, each with its own in-memory `labels`
  snapshot. A stale snapshot could eject a tab that another event just made a
  member, causing a visible ungroup→regroup. Re-reading `labels` from storage
  immediately before the ungroup confirms true non-membership.
- **Startup sync preserved.** Pre-existing Chrome groups present when the worker
  boots are NOT flagged (no `onCreated` fired for them), so they still seed
  labels as before. Only Chrome's per-tab inheritance is diverted.

## Implementation

### 1. Track Chrome-auto-grouped tabs

**File**: `service_worker.js`

- New module-level `const autoGroupedTabs = new Set()` (alongside
  `pendingUngroups`), with an explanatory comment.
- In `chrome.tabs.onCreated`, when a brand-new, **unpinned** tab is already in a
  group (`tab.groupId != null && tab.groupId > -1`), add `tab.id` to the set —
  this is Chrome's inheritance, not user intent.
- In `chrome.tabs.onRemoved`, `autoGroupedTabs.delete(tabId)` so the set never
  leaks stale ids.

### 2. Eject auto-grouped non-members instead of recording them

**File**: `service_worker.js` (the in-group branch of `groupTabs`)

- If the tab's URL is already a member of the group's label →
  `autoGroupedTabs.delete(...)` and keep it (existing "continue" behavior, now
  also clearing the flag).
- Else, if the tab is flagged in `autoGroupedTabs`:
  - Skip while the URL is still unloaded (`urlKey === 'url-'`) — wait for the
    real URL so we don't act on the transient `about:blank` state.
  - **Re-read `labels` from storage** and, if the URL turns out to be a member
    of `group.title` after all, clear the flag and keep it (flicker guard).
  - Otherwise ungroup the tab via `chrome.tabs.ungroup`, guarded by
    `pendingUngroups` (so the in-flight ungroup isn't mis-recorded by a
    concurrent pass), and clear the flag.
- The original "record in-group tab urlKey into label" path now only runs for
  non-auto-grouped tabs (e.g. startup sync), making Chrome inheritance no longer
  a recording trigger.

### 3. Clear the flag on deliberate group changes

**File**: `service_worker.js` (`handleActiveTabsGroupChanges`)

- When recording an explicit groupId change into a label,
  `autoGroupedTabs.delete(parseTabId(newTab))` first — a deliberate move is
  intent and must win over an earlier auto-grouped flag.

### 4. Diagnostic logging — gate or remove during formalization

**File**: `service_worker.js`

The prototype added unconditional `console.log('[TC-GROUP] …')` statements at
every group decision point (`onCreated`, both `chrome.tabs.group` calls, the two
`urlKeys.push` record sites, the auto-group match, and both ungroup paths). They
were essential for diagnosis but must not ship as unconditional console noise.
During Deconstruct decide between: (a) removing them, or (b) gating them behind a
debug flag (e.g. a `settings.debugGrouping` / `DEBUG_GROUPING` guard). Preference
is a single small `debugGroup(...)` helper so the call sites stay readable.

### 5. Regression tests

**File**: `service_worker.test.js`

Add coverage (existing 52 tests still pass) for the new behavior:
- Auto-grouped tab whose URL is **not** a label member → gets ungrouped, URL is
  **not** recorded into the label.
- Auto-grouped tab whose URL **is** a label member → stays grouped, flag cleared,
  no ungroup.
- Auto-grouped flag cleared on an explicit group change
  (`handleActiveTabsGroupChanges`) and on `onRemoved`.
- Fresh-storage re-check: stale in-memory `labels` says non-member but storage
  says member → tab is kept (no flicker / no ungroup).
- Non-auto-grouped in-group tab (startup-sync path) still records as before.

## Reused existing code

- `groupTabs`, `handleActiveTabsGroupChanges`, `getTabGroup`, `getUrlKey`,
  `parseTabId`, `getLocalStorage` from `service_worker.js` (glossary entries:
  `groupTabs`, `handleActiveTabsGroupChanges`, `getTabGroup`, `getUrlKey`,
  `parseTabId`, `getLocalStorage`).
- `pendingUngroups` Set pattern — `autoGroupedTabs` mirrors its lifecycle and
  its role as a guard the capture/record paths consult.
- Existing test harness and chrome stubs in `service_worker.test.js`.

## Known follow-up (out of scope unless requested)

- The fix is **preventive**: URLs already recorded into a label before the fix
  (e.g. `url-https://www.espn.com/`, the captured Google search) remain sticky
  until removed in the UI. A one-time retroactive cleanup of previously
  auto-captured entries was discussed but not built.

## Scenarios to Demonstrate

- New tab opened from a grouped tab to a brand-new URL → tab is ejected from the
  group; URL is never added to the label.
- New tab opened from a grouped tab to a URL that is a deliberate label member →
  tab stays grouped, no flicker.
- User deliberately drags a URL into a group (in-app) → it groups and sticks.
- User drags an existing tab into a Chrome group → recorded and sticky.
- Worker boot with a pre-existing Chrome group → group still seeds its label.
