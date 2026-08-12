// The label titles a `labels` change REMOVED — present in the previous map,
// absent from the next one. That is exactly the set of groups the user just
// deleted, and it is the trigger for dissolving their Chrome tab groups.
//
// Pure and area-agnostic on purpose: the caller (the worker's
// `storage.onChanged` listener) already knows which event carries `labels`, and
// keeping the set difference out of that listener is what makes it testable
// without stubbing chrome.* at all.
//
// Both sides are tolerated as null/undefined. `newValue` is undefined when the
// key is REMOVED wholesale rather than rewritten — deleting the last remaining
// group does that — and treating it as `{}` is what makes that case report the
// deletion instead of silently reporting nothing.
export default function deletedLabelTitles(previousLabels, nextLabels) {
  const previous = previousLabels || {};
  const next = nextLabels || {};

  return Object.keys(previous).filter((title) => !(title in next));
}
