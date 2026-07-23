// Always-on audit trail of every group-membership removal.
//
// When a URL silently disappeared from a group (the "CodeYam Fleet" drop) we
// could not tell how: the only grouping diagnostics — the `groupingLog`
// breadcrumb trail — are gated behind a default-off `debugGrouping` flag and
// never record the actual member-removal splices. This trail is different: it
// records every removal UNCONDITIONALLY, to a dedicated `chrome.storage.local`
// key, so the next unexplained drop is captured with no flag to pre-enable and
// no noise from the high-frequency auto-group decisions in `groupingLog`.
//
// This module only BUILDS an entry and names the store key/cap; the actual
// append-and-trim reuses the pure `appendGroupingLog` ring buffer, and each
// runtime keeps its own storage I/O (worker: getLocalStorage/update; web app:
// Chrome.get/Chrome.set). Kept clock-free (`t` is caller-supplied) so the entry
// builder is trivially unit-testable without stubbing `chrome` or `Date`.
//
// Read it back with no flag required:
//   chrome.storage.local.get('groupRemovalLog', console.log)
export const GROUP_REMOVAL_LOG_KEY = 'groupRemovalLog';
export const GROUP_REMOVAL_LOG_CAP = 100;

// The fixed vocabulary of code paths that can remove a member. Exported so the
// service worker and the web app tag entries from one source and can't drift
// into two spellings of the same path.
export const RemovalSource = {
  WORKER_TAB_UNGROUPED: 'worker:tab-ungrouped',
  WORKER_GROUP_CHANGED: 'worker:group-changed',
  WORKER_DRIFT_HEAL_DEDUP: 'worker:drift-heal-dedup',
  UI_REMOVE_URL: 'ui:removeUrl',
  UI_DELETE_LABEL: 'ui:deleteLabel',
  UI_DRAG: 'ui:drag',
};

// Build one audit entry. `urlKeys` is coerced to an array so single-key removals
// can pass a bare key or `[key]`. `t` is the caller-supplied `Date.now()` — kept
// out of this function so it stays pure. `tabId` is optional (null when the
// removing path has no tab in hand). `remaining` is the label's member count
// AFTER the removal, so a group emptied to zero is visible at a glance.
export function buildGroupRemovalEntry(
  source,
  { labelTitle, urlKeys, tabId, remaining, t }
) {
  return {
    t,
    source,
    label: labelTitle,
    urlKeys: Array.isArray(urlKeys) ? urlKeys : [urlKeys],
    tabId: tabId == null ? null : tabId,
    remaining,
  };
}

export default buildGroupRemovalEntry;
