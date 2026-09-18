import {
  SCOPE_OPEN_TABS,
  SCOPE_ALL_GROUPED,
  SCOPE_HISTORY,
  LABEL_PREFIX,
  HISTORY_LIMIT,
} from './pageContentTargets';

// The ordered list of scopes the Page contents picker offers, as
// `{ value, label }` descriptors.
//
// The ORDER is the product decision this function exists to hold. Open tabs
// leads because it is both the cheapest and the most private option — those
// pages are already loaded, so scanning them reads what is on screen and
// fetches nothing. Recent history is last because it is the widest: fifty pages,
// most of them closed, each costing a request. The groups sit between, ordered
// the way the user arranged them everywhere else in the app.
//
// Pure, so the ordering can be asserted without rendering a <select>.
const scanScopeOptions = (labels) => {
  const groups = Object.values(labels || {})
    .filter((label) => label && label.title)
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((label) => ({
      value: `${LABEL_PREFIX}${label.title}`,
      label: `Group: ${label.title}`,
    }));

  return [
    { value: SCOPE_OPEN_TABS, label: 'Open tabs' },
    { value: SCOPE_ALL_GROUPED, label: 'All grouped URLs' },
    ...groups,
    // The cap is in the label because it is the one scope whose cost is not
    // obvious from its name.
    { value: SCOPE_HISTORY, label: `Recent history (${HISTORY_LIMIT} most recent)` },
  ];
};

export default scanScopeOptions;
