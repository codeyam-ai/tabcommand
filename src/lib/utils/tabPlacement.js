// Idempotence guards for the two Chrome calls that physically MOVE a tab.
//
// `chrome.tabs.group` and `chrome.tabs.ungroup` are not assertions — they are
// repositions. `group` appends the tab to the end of its target group (and pulls
// it into that group's window); `ungroup` pops the tab out to the right of the
// group it left. Chrome honors both even when the tab is already exactly where
// the call would put it, so an unguarded "re-assert the grouping" pass is a
// user-visible tab move.
//
// That is what turns a re-assert into a loop: a move fires `chrome.tabs.onMoved`
// -> `updateActiveTabs` -> `chrome.storage.local.set` -> `storage.onChanged` ->
// `groupTabs` -> `chrome.tabs.group` -> `onMoved` ... and `storage.local.set`
// fires `onChanged` even when the written value is byte-identical, so nothing
// damps the cycle except a grouping pass that issues no Chrome calls at all.
// These two predicates are how a steady-state pass reaches zero calls: the
// worker asks "is this tab already where it belongs?" before every placement.
//
// Kept pure — no `chrome`, no storage — following the neighboring
// `healDriftedLabelSlot` / `navigatedAwayFromRecordedSlot` pattern, so the
// decision logic is unit-testable and the worker keeps its own I/O.

// Chrome's TAB_GROUP_ID_NONE. A tab that is in no group reports this.
const NO_GROUP = -1;

// Treat a missing group id as "no group". Note what this deliberately does NOT
// do: collapse `0` into "no group". `0` is falsy but a perfectly valid Chrome
// group id, and the worker's older `if (activeTab.groupId && activeTab.groupId > -1)`
// test mishandles exactly that case. Compare against NO_GROUP explicitly.
function normalizeGroupId(groupId) {
  return groupId === undefined || groupId === null ? NO_GROUP : groupId;
}

// Does this tab actually need a `chrome.tabs.group` call to reach `targetGroupId`?
//
// `false` when the tab is pinned (pinned tabs are never grouped) or when it is
// already sitting in the target group — that call would only reposition it.
// A `targetGroupId` of `undefined`/`null`/`-1` means "no Chrome group exists for
// this label yet, one is about to be created", so every unpinned tab genuinely
// needs to be in the create call.
export function needsGroupCall(activeTab, targetGroupId) {
  if (!activeTab) return false;
  if (activeTab.pinned) return false;

  const target = normalizeGroupId(targetGroupId);
  if (target === NO_GROUP) return true;

  return normalizeGroupId(activeTab.groupId) !== target;
}

// Does this tab actually need a `chrome.tabs.ungroup` call?
//
// `false` when it is already in no group — ungrouping an ungrouped tab still
// moves it in the strip, which is the "my tabs jump around while I do nothing"
// report.
export function needsUngroupCall(activeTab) {
  if (!activeTab) return false;
  return normalizeGroupId(activeTab.groupId) !== NO_GROUP;
}

// Split the tabs bound for one label into per-window buckets.
//
// A label legitimately has one Chrome group per window. `chrome.tabGroups.query`
// is NOT window-scoped, so a title-only query can return a group living in
// another window — and `chrome.tabs.group({ groupId })` against it physically
// DRAGS the tab into that other window. Bucketing first is what lets each window
// resolve its own group and keeps tabs in the window the user put them in.
//
// Pinned tabs are dropped here: they are never grouped, so they should not
// influence which windows get a group (a bucket holding only pinned tabs would
// otherwise create an empty group).
//
// Returns a Map keyed by windowId. Entries persisted by a build that predates
// `windowId` on activeTabs bucket under `undefined`; the caller falls back to the
// unscoped query for those until `updateActiveTabs` rewrites the entry.
export function bucketTabsByWindow(tabs) {
  const byWindow = new Map();
  if (!tabs) return byWindow;

  for (const tab of tabs) {
    if (!tab || tab.pinned) continue;
    const windowId = tab.windowId;
    if (!byWindow.has(windowId)) byWindow.set(windowId, []);
    byWindow.get(windowId).push(tab);
  }

  return byWindow;
}
