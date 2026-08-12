// Resolve which label claims a urlKey — the ONE place that answers "where does
// this URL belong?".
//
// It exists because two callers need that answer and disagreeing is a bug:
//
//   - `groupTabs` picks the destination group for an ungrouped tab. It used to
//     loop every label and queue the tab into EVERY one that claimed the URL, so
//     a urlKey filed under two labels was grouped twice in a single pass —
//     moved into group A, then into group B. Which one won depended on async
//     `chrome.tabGroups.query` ordering, so it could differ from pass to pass.
//     That is the literal back-and-forth users reported.
//   - `updateActiveTabs` asks the yes/no form ("is this URL a member of ANY
//     label?") before ejecting a revisited auto-closed tab.
//
// Returning the FIRST match makes the destination single and deterministic.
// First-by-`Object.keys` order is arbitrary as a choice of label, but it is
// stable across passes — and stability is the property that stops the flip-flop.
// A tab that lands in one group and stays there is correct behavior even if the
// label it landed in was picked arbitrarily; a tab that alternates is not.

// Returns the title of the first label whose urlKeys contain `urlKey`, or `null`
// when no label claims it. Null-tolerant on both arguments so callers can pass
// straight from storage without an existence check.
export function findLabelForUrlKey(labels, urlKey) {
  if (!labels || !urlKey) return null;

  for (const labelTitle of Object.keys(labels)) {
    const label = labels[labelTitle];
    if (label && Array.isArray(label.urlKeys) && label.urlKeys.indexOf(urlKey) > -1) {
      return labelTitle;
    }
  }

  return null;
}

export default findLabelForUrlKey;
