// Turns the flat list of grouped-URL search hits into an ordered set of
// per-group sub-sections for the SearchResults overlay. Each grouped hit
// carries `urlLabelTitle` (its group) and `urlLabelColor` (the group's color,
// stamped by `buildUrlDocuments`); this collapses them into
// `[{ title, color, urls }]` where:
//   - groups appear in first-appearance order across the input,
//   - URLs keep their input order within each group.
// Kept free of React so the grouping is unit-testable in isolation. Consumers
// flatten `groups.flatMap((g) => g.urls)` to recover the flat activation order,
// which stays aligned with render order regardless of input order. A
// null/empty/non-array input yields `[]`.
const groupSearchUrlsByLabel = (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) return [];

  const groups = [];
  const byTitle = new Map();

  for (const url of urls) {
    const title = url && url.urlLabelTitle;
    let group = byTitle.get(title);
    if (!group) {
      group = { title, color: url && url.urlLabelColor, urls: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.urls.push(url);
  }

  return groups;
};

export default groupSearchUrlsByLabel;
