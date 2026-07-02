// Pure ring-buffer helper for the grouping diagnostics breadcrumb trail.
//
// MV3 kills the service worker constantly, so a grouping bug that manifests
// across a restart (a doc recorded under one `?tab=` key, then ejected after
// the worker was recycled) is invisible to `console.log`. service_worker.js
// persists breadcrumbs to a capped array in `chrome.storage.local` instead;
// this helper is the append-and-trim step, kept pure (no `chrome`, no I/O) so
// it is trivially unit-testable without stubbing the extension APIs.
//
// Given the current stored array (or a missing/empty store), it appends one
// entry and returns a NEW array trimmed to the most-recent `cap` items. It does
// not mutate its input — the caller writes the returned array back to storage.
export function appendGroupingLog(store, entry, cap = 200) {
  const existing = Array.isArray(store) ? store : [];
  const next = existing.concat([entry]);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export default appendGroupingLog;
