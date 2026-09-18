import groupSearchUrlsByLabel from './groupSearchUrlsByLabel';

// Shapes raw minisearch hits into the five sections the Full Search page
// renders. It is the overlay's `segmentSearchResults` widened along a second
// axis: the overlay splits by WHERE a URL lives (grouped vs archived), while the
// page also splits by WHY it matched (notes) and by what is on screen right now
// (open tabs).
//
// Returns `{ labels, grouped, history, notes, openTabs }`:
//   - `labels`   — hits carrying `labelTitle` (a group matched by name);
//   - `grouped`  — URL hits carrying `urlLabelTitle`, run through
//                  `groupSearchUrlsByLabel` into per-group sub-sections;
//   - `history`  — URL hits belonging to no group (the archive);
//   - `notes`    — URL hits whose `match` includes the `notes` field;
//   - `openTabs` — URL hits whose id is an `activeTabs[].urlKey`.
//
// The sections deliberately OVERLAP: a URL appears in its location section
// (grouped or history) and again under Notes / Open tabs when it qualifies, so
// each filter chip answers its own question completely. Callers that need the
// unduplicated set (the "All" chip) dedupe by id across sections.
//
// Hits are first deduped by document id, the same way `segmentSearchResults`
// does and for the same reason — overlapping index rebuilds can briefly leave a
// URL indexed twice, which would otherwise surface as two results sharing a
// React key. The first (highest-score) hit per id wins.
const matchedInNotes = (hit) => {
  if (!hit || !hit.match) return false;
  return Object.values(hit.match).flat().indexOf('notes') > -1;
};

const segmentFullSearchResults = (results, activeTabs) => {
  const seen = new Set();
  const unique = (results || []).filter((r) => {
    if (!r || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const labels = unique.filter((r) => r.labelTitle);
  const urlHits = unique.filter((r) => !r.labelTitle);

  const openKeys = new Set(
    (activeTabs || []).map((tab) => tab && tab.urlKey).filter(Boolean)
  );

  return {
    labels,
    grouped: groupSearchUrlsByLabel(urlHits.filter((r) => r.urlLabelTitle)),
    history: urlHits.filter((r) => !r.urlLabelTitle),
    notes: urlHits.filter(matchedInNotes),
    openTabs: urlHits.filter((r) => openKeys.has(r.id)),
  };
};

export default segmentFullSearchResults;
