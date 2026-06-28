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
// Each returned row also carries an `isOpen` flag: true when any variant of the
// site is currently open in a non-pinned tab (i.e. its key is in
// `options.openKeys`). It's a pure render hint for the "already open" cue and
// does not affect ranking or qualification.
//
// Qualification is FREQUENCY-FIRST: candidates are de-duplicated by normalized
// URL (collapsing http/https/www/trailing-slash variants), their effective visit
// counts summed across the merged variants, and sites below `minVisits` dropped —
// so a site only earns a place by being genuinely visited, never by being recent.
// ORDERING then blends that frequency with a recency decay: the score is
// `effectiveVisits * recencyWeight(index)`, where the weight falls off linearly
// from 1 (newest qualifying site) to RECENCY_FLOOR (oldest retained) — never to
// zero, so frequency still dominates within a similar recency band while a
// daily-used recent site outranks a long-abandoned heavy-use one. Recency
// (position in allUrls) remains the deterministic tiebreak for equal scores.
const MIN_VISITS = 2;

// The oldest retained site keeps this fraction of its frequency-based score
// rather than collapsing to zero, so a hugely-visited slightly-older site is not
// unfairly buried — frequency still matters, recency only tilts the order.
const RECENCY_FLOOR = 0.25;

const usableTitle = (record) =>
  record && typeof record.title === 'string' && record.title.length > 0;

// Map a candidate's recency `index` (position in allUrls, newest = 0) to a weight
// in [RECENCY_FLOOR, 1]: newest → 1, oldest retained → RECENCY_FLOOR, linear in
// between. Pure and storage/DOM-free, like the rest of this module.
const recencyWeight = (index, total) => {
  if (total <= 1) return 1;
  const t = index / (total - 1);
  return 1 - t * (1 - RECENCY_FLOOR);
};

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
    const isOpen = openKeys.has(urlKey);
    const openCount = isOpen ? 1 : 0;
    const effectiveVisits = Math.max(0, (record.visitCount || 0) - openCount);
    candidates.push({ urlKey, record, index, effectiveVisits, isOpen });
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
      // The cue fires if ANY variant of the site is open, even when the open
      // variant isn't the representative row the group renders.
      existing.isOpen = existing.isOpen || candidate.isOpen;
      // Candidates iterate in recency order, so the first-seen member already has
      // the lowest index; later members only add to the visit total.
    } else {
      groups.set(groupKey, {
        representative: candidate,
        index: candidate.index,
        effectiveVisits: candidate.effectiveVisits,
        isOpen: candidate.isOpen,
      });
    }
  }

  // Keep only sites that have EARNED their place (enough RAW effective visits, so
  // the recency decay never changes who qualifies — only the order), then sort by
  // the frequency × recency-decay blend, with raw recency as the deterministic
  // tiebreak for equal weighted scores.
  const qualifying = [...groups.values()].filter(
    (group) => group.effectiveVisits >= minVisits
  );
  const total = allUrls.length;
  for (const group of qualifying) {
    group.score = group.effectiveVisits * recencyWeight(group.index, total);
  }
  qualifying.sort((a, b) => b.score - a.score || a.index - b.index);

  return qualifying.slice(0, limit).map(({ representative, isOpen }) => {
    const { urlKey, record } = representative;
    return {
      urlKey,
      url: record.url || urlKey.replace(/^url-/, ''),
      title: record.title,
      favicon: record.favicon || '',
      isOpen,
    };
  });
}

export default rankFavorites;
