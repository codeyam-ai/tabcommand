// The number on every Full Search filter chip.
//
// Five of the seven counts are just a section's length. "All" is the one that
// needs thought: the sections deliberately OVERLAP — a URL appears in its
// location section (grouped or history) and AGAIN under Notes if the match
// landed in its notes, or under Open tabs if it is on screen right now. Summing
// the sections would report a result set two or three times larger than the one
// the user is looking at, so All dedupes by id across the location sections plus
// Chrome history: the partition, counted once.
//
// Notes and Open tabs are deliberately NOT part of the All union. Every hit they
// contain is already in a location section, so adding them could only
// double-count; they are views onto the same set, not additional members of it.
//
// Page contents IS part of the union, unlike Notes and Open tabs, and for the
// reason that distinguishes it from them: a page whose TEXT matched need not
// have matched anywhere else, so it can be a member the location sections never
// saw. It is deduped by the same id, so a page that matched both its title and
// its text still counts once.
const countFullSearchSections = (results, chromeHits, pageContentResults) => {
  const safe = results || {};
  const labels = safe.labels || [];
  const grouped = (safe.grouped || []).flatMap((group) => (group && group.urls) || []);
  const history = safe.history || [];
  const notes = safe.notes || [];
  const openTabs = safe.openTabs || [];
  const chrome = chromeHits || [];
  // A page-content result is keyed by `urlKey`, which is the same value a
  // tracked hit carries as `id` — so the two dedupe against each other.
  const pageContents = (pageContentResults || []).map((result) => ({ id: result.urlKey }));

  const all = new Set();
  for (const hit of [...labels, ...grouped, ...history, ...chrome, ...pageContents]) {
    if (hit) all.add(hit.id);
  }

  return {
    all: all.size,
    labels: labels.length,
    grouped: grouped.length,
    history: history.length,
    notes: notes.length,
    openTabs: openTabs.length,
    chromeHistory: chrome.length,
    pageContents: pageContents.length,
  };
};

export default countFullSearchSections;
