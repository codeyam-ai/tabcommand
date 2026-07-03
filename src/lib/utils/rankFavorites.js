import { isTrackableUrl } from './isTrackableUrl';
import { normalizeUrl } from './normalizeUrl';
import {
  decayedVisitScore,
  pruneVisits,
  seedVisitsFromCount,
  HALF_LIFE_MS,
  QUALIFY_MIN,
} from './visitDecay';

// Ranks a user's "Favorites" — the sites they genuinely return to — by a
// TIME-DECAYED sum of visits, so a site the user comes back to weekly outranks
// an old-but-once-heavily-visited one. The Favorites sidebar section is
// declarative; all the scoring lives here so it stays pure (no storage, no DOM)
// and is straightforward to unit test with an injected `now`.
//
// Inputs:
//   allUrls    — the recency-ordered key array (newest at index 0), exactly as
//                the service worker maintains it. Its position is no longer a
//                scoring input (real visit timestamps carry recency now); it is
//                only a deterministic tiebreak for equal decayed scores.
//   urlRecords — a map of `urlKey -> record`. Records carry { title, favicon,
//                url?, visitCount?, visits? }. `visits` is a pruned array of
//                epoch-ms visit timestamps; a legacy record with `visitCount`
//                but no `visits` is seeded lazily (see seedVisitsFromCount).
//   limit      — how many favorites to return (default 5). Pass a large value
//                (or Infinity) from the "View All" page to leave it uncapped.
//   excludedKeys — an optional Set of `urlKey`s to suppress entirely from the
//                result (e.g. sites open in a Chrome-pinned tab, or ones the
//                user removed from Favorites). Defaults to empty.
//   options    — { openKeys, hiddenKeys, now, halfLifeMs, qualifyMin }:
//     openKeys   — an optional Set of `urlKey`s currently open in a NON-pinned
//                  tab. The most-recent (in-progress) visit of such a site is
//                  dropped from its history so an open tab doesn't pad the rank.
//     hiddenKeys — an optional Set of `urlKey`s the user removed from Favorites.
//                  Unlike excludedKeys, these are NOT dropped: they are scored
//                  and qualified normally and returned with `isHidden: true`, so
//                  the "View All" page can render them dimmed with a "Bring
//                  back" action. (The sidebar passes hidden keys via
//                  excludedKeys instead, so they stay hidden there.)
//     now        — epoch-ms "now" for decay (default Date.now()). Injectable so
//                  tests pin behavior instead of relying on wall-clock.
//     halfLifeMs — decay half-life (default HALF_LIFE_MS).
//     qualifyMin — decayed-score qualification threshold (default QUALIFY_MIN).
//
// Each returned row carries the stats the sidebar and View All page need:
//   { urlKey, url, title, favicon, isOpen, isHidden, score, visitCount,
//     lastVisit, recentVisits }
// where `recentVisits` is the merged pruned timestamp array (for a sparkline)
// and `lastVisit` is its max. The sidebar ignores the extra fields, so this is
// additive.
//
// Candidates are gated to real websites (`isTrackableUrl`): any stored key
// pointing at a non-http(s) URL (`about:blank`, `file://`, etc.) is skipped so
// legacy junk recorded before the service worker was gated never surfaces.
//
// Cosmetic duplicates (http/https/www/trailing-slash variants) are collapsed by
// normalized URL, their visit timestamps merged, so a site gets credit for all
// of its variants. Sites whose merged decayed score is below `qualifyMin` are
// dropped — so a site only earns a place by being genuinely (and recently)
// visited, never by being merely recent in the list.

const usableTitle = (record) =>
  record && typeof record.title === 'string' && record.title.length > 0;

// Resolve a candidate record's visit timestamps: real `visits` when present,
// else a lazy migration seed from `visitCount` so pre-upgrade favorites survive.
// Always returns a pruned (retention- and cap-bounded) ascending array.
const visitsFor = (record, now) => {
  if (Array.isArray(record.visits) && record.visits.length > 0) {
    return pruneVisits(record.visits, now);
  }
  if ((record.visitCount || 0) > 0) {
    return pruneVisits(seedVisitsFromCount(record.visitCount, now), now);
  }
  return [];
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
  const hiddenKeys = options.hiddenKeys || new Set();
  const now = options.now != null ? options.now : Date.now();
  const halfLifeMs = options.halfLifeMs != null ? options.halfLifeMs : HALF_LIFE_MS;
  const qualifyMin = options.qualifyMin != null ? options.qualifyMin : QUALIFY_MIN;

  // Candidates are the recency-ordered keys that actually have a renderable
  // record. We keep each candidate's original index only as a deterministic
  // tiebreak for equal decayed scores.
  const candidates = [];
  for (let index = 0; index < allUrls.length; index++) {
    const urlKey = allUrls[index];
    if (excluded.has(urlKey)) continue;
    const record = records[urlKey];
    if (!usableTitle(record)) continue;
    // Defensively drop already-stored non-website entries (e.g. legacy
    // `about:blank`/`file://` keys recorded before `newUrl` was gated) so they
    // never qualify or render.
    const candidateUrl = record.url || urlKey.replace(/^url-/, '');
    if (!isTrackableUrl(candidateUrl)) continue;

    let visits = visitsFor(record, now);
    // Discount a currently-open (non-pinned) tab's in-progress visit by dropping
    // its most-recent timestamp — a tab that's still open shouldn't have that
    // visit padding the rank while it's open.
    const isOpen = openKeys.has(urlKey);
    if (isOpen && visits.length > 0) visits = visits.slice(0, -1);

    candidates.push({
      urlKey,
      record,
      index,
      visits,
      isOpen,
      isHidden: hiddenKeys.has(urlKey),
    });
  }
  if (candidates.length === 0) return [];

  // Group cosmetic duplicates (slash/www/protocol variants) onto one row: the
  // most-recent (lowest-index) member is the representative the row opens and
  // renders, and visit timestamps are merged so the site is scored across all of
  // its variants.
  const groups = new Map();
  for (const candidate of candidates) {
    const url = candidate.record.url || candidate.urlKey.replace(/^url-/, '');
    const groupKey = normalizeUrl(url);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.visits = existing.visits.concat(candidate.visits);
      // The cue fires if ANY variant of the site is open, even when the open
      // variant isn't the representative row the group renders.
      existing.isOpen = existing.isOpen || candidate.isOpen;
      // A site counts as hidden only when its representative (rendered) key is
      // the hidden one; a hidden cosmetic variant doesn't hide the whole row.
      // Candidates iterate in recency order, so the representative is first-seen.
    } else {
      groups.set(groupKey, {
        representative: candidate,
        index: candidate.index,
        visits: candidate.visits.slice(),
        isOpen: candidate.isOpen,
        isHidden: candidate.isHidden,
      });
    }
  }

  // Score each group by its merged decayed visits and keep only those that clear
  // the qualification threshold, then sort by decayed score desc with recency
  // (latest visit, then list position) as the deterministic tiebreak.
  const qualifying = [];
  for (const group of groups.values()) {
    const visits = pruneVisits(group.visits, now);
    const score = decayedVisitScore(visits, now, halfLifeMs);
    if (score < qualifyMin) continue;
    group.visits = visits;
    group.score = score;
    group.lastVisit = visits.length ? visits[visits.length - 1] : null;
    qualifying.push(group);
  }
  qualifying.sort(
    (a, b) =>
      b.score - a.score ||
      (b.lastVisit || 0) - (a.lastVisit || 0) ||
      a.index - b.index
  );

  const capped = limit === Infinity ? qualifying : qualifying.slice(0, limit);
  return capped.map((group) => {
    const { urlKey, record } = group.representative;
    return {
      urlKey,
      url: record.url || urlKey.replace(/^url-/, ''),
      title: record.title,
      favicon: record.favicon || '',
      isOpen: group.isOpen,
      isHidden: group.isHidden,
      score: group.score,
      visitCount: group.visits.length,
      lastVisit: group.lastVisit,
      recentVisits: group.visits,
    };
  });
}

export default rankFavorites;
