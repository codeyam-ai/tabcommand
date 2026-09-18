// Turns a segmented Full Search result set into the ordered list of sections the
// page renders, plus the flat row list its keyboard navigation indexes into.
//
// THE INVARIANT this function exists to hold: `flatRows` is exactly the
// concatenation of `sections[].rows`, in render order. The page derives BOTH the
// markup and the Arrow/Enter target list from this one return value, so they
// cannot drift. The earlier shape — a running index incremented during render,
// next to a separately-built activation array — is precisely the arrangement
// where arrowing to one row and pressing Enter opens another, and it is the bug
// the overlay already had to fix once with `flatUrls`.
//
// Section order is the page's information hierarchy: what a match IS (a group),
// then where it lives (in a group / in the archive), then why it matched
// (notes), then what is on screen right now (open tabs), then the opt-in
// outside source (Chrome history). A section with no rows is dropped rather than
// rendered as a heading with nothing under it.
const SECTION_TITLES = {
  labels: 'Groups',
  grouped: 'In my groups',
  history: 'History',
  notes: 'Notes',
  openTabs: 'Open tabs',
  chromeHistory: 'Chrome history',
};

const buildFullSearchSections = (results, chromeHits, filter) => {
  const safe = results || {};
  const showing = (key) => filter === 'all' || filter === key;

  const flatGrouped = (safe.grouped || []).flatMap((group) => (group && group.urls) || []);

  const candidates = [
    { key: 'labels', rows: safe.labels || [] },
    { key: 'grouped', rows: flatGrouped, groups: safe.grouped || [] },
    { key: 'history', rows: safe.history || [] },
    { key: 'notes', rows: safe.notes || [] },
    { key: 'openTabs', rows: safe.openTabs || [] },
    { key: 'chromeHistory', rows: chromeHits || [] },
  ];

  const sections = candidates
    .filter((section) => showing(section.key) && section.rows.length > 0)
    .map((section) => ({
      key: section.key,
      title: SECTION_TITLES[section.key],
      rows: section.rows,
      // Only the grouped section carries sub-sections; leaving the key absent
      // (rather than an empty array) is what the renderer branches on.
      ...(section.groups ? { groups: section.groups } : {}),
    }));

  return {
    sections,
    flatRows: sections.flatMap((section) => section.rows),
  };
};

export default buildFullSearchSections;
