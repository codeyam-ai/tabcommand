// Always-on audit trail of every tab MOVE the extension issues — the third
// sibling of `groupAdditionLog` and `groupRemovalLog`.
//
// Those two record changes to label MEMBERSHIP (which urlKeys a label holds).
// Neither records the thing users actually see: the tab physically moving in the
// Chrome tab strip. `chrome.tabs.group` and `chrome.tabs.ungroup` reposition a
// tab every time they are called, so "TabCommand keeps moving my tabs" is a
// report about CALLS, not about membership — and the existing trails are blind
// to it. Both of those trails were themselves added because a grouping bug
// proved undiagnosable without one; the same was true here.
//
// Like its two siblings this records UNCONDITIONALLY, to its own dedicated
// `chrome.storage.local` key, so the next report is provable from the user's own
// profile instead of re-derived by reading code: each entry names the exact code
// path that issued the move, and where the tab went.
//
// Only calls that are ACTUALLY ISSUED are recorded. A placement suppressed by
// the `tabPlacement` idempotence guards moved nothing and leaves no entry, so a
// quiet steady state is visible as an empty trail rather than inferred.
//
// This module only BUILDS an entry and names the store key/cap; the actual
// append-and-trim reuses the pure `appendGroupingLog` ring buffer, and each
// runtime keeps its own storage I/O. Kept clock-free (`t` is caller-supplied) so
// the entry builder is trivially unit-testable without stubbing `chrome` or
// `Date`.
//
// Read it back with no flag required:
//   chrome.storage.local.get('groupMoveLog', console.log)
export const GROUP_MOVE_LOG_KEY = 'groupMoveLog';
export const GROUP_MOVE_LOG_CAP = 100;

// The fixed vocabulary of code paths that can move a tab. Exported so the
// service worker and the web app tag entries from one source and can't drift
// into two spellings of the same path.
export const MoveSource = {
  WORKER_AUTO_GROUP: 'worker:auto-group',
  WORKER_NAVIGATION_EJECT: 'worker:navigation-eject',
  WORKER_AUTO_GROUP_EJECT: 'worker:auto-group-eject',
  WORKER_NO_MATCHING_LABEL: 'worker:no-matching-label',
  WORKER_AUTO_CLOSE_REVISIT: 'worker:auto-close-revisit',
  UI_DRAG: 'ui:drag',
};

// Build one audit entry. `t` is the caller-supplied `Date.now()` — kept out of
// this function so it stays pure. `action` is `'group'` or `'ungroup'`.
// `fromGroupId` / `toGroupId` are the tab's group before and after the call
// (`-1` for "no group"), which is what makes a move readable at a glance: an
// entry whose from and to are equal would be a no-op reposition, and its absence
// from this trail is the proof the guards are working. `labelTitle` and `urlKey`
// are optional context — an ungroup path often has no label in hand.
export function buildGroupMoveEntry(
  source,
  { action, tabId, fromGroupId, toGroupId, labelTitle, urlKey, t }
) {
  return {
    t,
    source,
    action,
    tabId: tabId == null ? null : tabId,
    fromGroupId: fromGroupId == null ? -1 : fromGroupId,
    toGroupId: toGroupId == null ? -1 : toGroupId,
    label: labelTitle == null ? null : labelTitle,
    urlKey: urlKey == null ? null : urlKey,
  };
}

export default buildGroupMoveEntry;
