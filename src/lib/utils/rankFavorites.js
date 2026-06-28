import { normalizeUrl } from './normalizeUrl';

// Ranks a user's "Favorites" — the sites they genuinely return to — by EARNED
// frequency, so Favorites reads as a list of real preferences rather than recent
// history. The Favorites sidebar section is declarative; all the scoring lives
// here so it stays pure (no storage, no DOM) and is straightforward to unit test.
//
// Inputs:
//   allUrls    — the recency-ordered key array (newest at index 0), exactly as
//                the service worker maintains it.
//   urlRecords — a map of `urlKey -> record`. Records carry { title, favicon,
//                url?, visitCount? }; missing visitCount is treated as 0.
//   limit      — how many favorites to return (default 5).
//   excludedKeys — an optional Set of `urlKey`s to suppress entirely from the
//                result (e.g. sites open in a Chrome-pinned tab, or ones the user
//                explicitly removed from Favorites). Defaults to empty.
//   options    — { openKeys, minVisits }:
//     openKeys  — an optional Set of `urlKey`s currently open in a NON-pinned
//                 tab. Each such key has its visit count discounted by 1 (the
//                 in-progress visit shouldn't count while the tab is still open),
//                 floored at 0. Defaults to empty.
//     minVisits — the minimum EFFECTIVE (post-discount, post-aggregation) visit
//                 count a site must have to qualify. Defaults to MIN_VISITS.
//
// Ranking is FREQUENCY-FIRST: candidates are de-duplicated by normalized URL
// (collapsing http/https/www/trailing-slash variants), their effective visit
// counts summed across the merged variants, sites below `minVisits` dropped, and
// the survivors ordered by effective visits descending with recency (position in
// allUrls) as the deterministic tiebreak.
const MIN_VISITS = 2;

const usableTitle = (record) =>
  record && typeof record.title === 'string' && record.title.length > 0;

export function rankFavorites(
  allUrls,
  urlRecords,
  limit = 5,
  excludedKeys,
  options = {}
) {
  if (!Array.isArray(allUrls) || allUrls.length === 0) return [];
  const records = urlRecords || {};
  const excluded = excludedKeys || new Set();
  const openKeys = options.openKeys || new Set();
  const minVisits = options.minVisits != null ? options.minVisits : MIN_VISITS;

  // Candidates are the recency-ordered keys that actually have a renderable
  // record. We keep each candidate's original index so recency reflects the full
  // allUrls ordering, not just the subset that happens to have records.
  const candidates = [];
  for (let index = 0; index < allUrls.length; index++) {
    const urlKey = allUrls[index];
    if (excluded.has(urlKey)) continue;
    const record = records[urlKey];
    if (!usableTitle(record)) continue;
    // Discount a currently-open (non-pinned) tab's in-progress visit, floored at
    // 0 — a tab that's still open shouldn't have its visit padding the ranking.
    const openCount = openKeys.has(urlKey) ? 1 : 0;
    const effectiveVisits = Math.max(0, (record.visitCount || 0) - openCount);
    candidates.push({ urlKey, record, index, effectiveVisits });
  }
  if (candidates.length === 0) return [];

  // Group cosmetic duplicates (slash/www/protocol variants) onto one row: the
  // most-recent (lowest-index) member is the representative the row opens and
  // renders, group recency is that min index, and effective visit counts are
  // summed so the site gets credit for all of its variants.
  const groups = new Map();
  for (const candidate of candidates) {
    const url = candidate.record.url || candidate.urlKey.replace(/^url-/, '');
    const groupKey = normalizeUrl(url);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.effectiveVisits += candidate.effectiveVisits;
      // Candidates iterate in recency order, so the first-seen member already has
      // the lowest index; later members only add to the visit total.
    } else {
      groups.set(groupKey, {
        representative: candidate,
        index: candidate.index,
        effectiveVisits: candidate.effectiveVisits,
      });
    }
  }

  // Keep only sites that have EARNED their place (enough effective visits), then
  // order frequency-first with recency as the deterministic tiebreak.
  const qualifying = [...groups.values()].filter(
    (group) => group.effectiveVisits >= minVisits
  );
  qualifying.sort(
    (a, b) => b.effectiveVisits - a.effectiveVisits || a.index - b.index
  );

  return qualifying.slice(0, limit).map(({ representative }) => {
    const { urlKey, record } = representative;
    return {
      urlKey,
      url: record.url || urlKey.replace(/^url-/, ''),
      title: record.title,
      favicon: record.favicon || '',
    };
  });
}

export default rankFavorites;
