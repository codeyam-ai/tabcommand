// Always-on audit trail of every group-membership ADDITION — the mirror image of
// `groupRemovalLog`.
//
// The removal trail was built because a URL vanished from a group and nothing
// recorded how. This one exists for the opposite failure: groups that GROW
// members the user never filed (the CodeYam group collecting several "App Store
// Connect" rows from a single add). Diagnosing that was guesswork for the same
// reason — the only grouping breadcrumbs, `groupingLog`, are gated behind a
// default-off `debugGrouping` flag and console-only, so by the time a phantom
// member is noticed there is no evidence of which path appended it.
//
// Like the removal trail this records UNCONDITIONALLY, to its own dedicated
// `chrome.storage.local` key, so a phantom member is provable rather than
// inferred: each entry names the exact code path that did the appending.
//
// This module only BUILDS an entry and names the store key/cap; the actual
// append-and-trim reuses the pure `appendGroupingLog` ring buffer, and each
// runtime keeps its own storage I/O (worker: getLocalStorage/update; web app:
// Chrome.get/Chrome.set). Kept clock-free (`t` is caller-supplied) so the entry
// builder is trivially unit-testable without stubbing `chrome` or `Date`.
//
// Read it back with no flag required:
//   chrome.storage.local.get('groupAdditionLog', console.log)
export const GROUP_ADDITION_LOG_KEY = 'groupAdditionLog';
export const GROUP_ADDITION_LOG_CAP = 100;

// The fixed vocabulary of code paths that can add a member. Exported so the
// service worker and the web app tag entries from one source and can't drift
// into two spellings of the same path.
export const AdditionSource = {
  WORKER_GROUP_CHANGED: 'worker:group-changed',
  WORKER_IN_GROUP_SYNC: 'worker:in-group-sync',
  WORKER_DRIFT_HEAL: 'worker:drift-heal',
  UI_DRAG: 'ui:drag',
};

// Build one audit entry. `urlKeys` is coerced to an array so single-key additions
// can pass a bare key or `[key]`. `t` is the caller-supplied `Date.now()` — kept
// out of this function so it stays pure. `tabId` is optional (null when the
// adding path has no tab in hand). `total` is the label's member count AFTER the
// add — the additive counterpart of the removal entry's `remaining` — so a group
// growing one member at a time is visible at a glance. `previousKey` is set only
// by the drift-heal source, where the add is a rewrite-in-place of an existing
// slot: recording both keys makes a rewrite chain readable.
export function buildGroupAdditionEntry(
  source,
  { labelTitle, urlKeys, tabId, total, previousKey, t }
) {
  return {
    t,
    source,
    label: labelTitle,
    urlKeys: Array.isArray(urlKeys) ? urlKeys : [urlKeys],
    tabId: tabId == null ? null : tabId,
    total,
    previousKey: previousKey == null ? null : previousKey,
  };
}

export default buildGroupAdditionEntry;
