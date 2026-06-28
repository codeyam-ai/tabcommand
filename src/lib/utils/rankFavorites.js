// Ranks a user's "Favorites" — their most-visited sites — by blending recency
// with visit frequency, deliberately leaning toward recency. The Favorites
// sidebar section is declarative; all the scoring lives here so it stays pure
// (no storage, no DOM) and is straightforward to unit test.
//
// Inputs:
//   allUrls    — the recency-ordered key array (newest at index 0), exactly as
//                the service worker maintains it.
//   urlRecords — a map of `urlKey -> record`. Records carry { title, favicon,
//                visitCount? }; missing visitCount is treated as 0.
//   limit      — how many favorites to return (default 5).
//
// Scoring: recency is the DOMINANT term. Each candidate's recency is its
// normalized position in `allUrls` (newest = 1, oldest = 0); its frequency is
// its visitCount normalized against the busiest candidate. The blended score is
// `RECENCY_WEIGHT * recency + VISIT_WEIGHT * frequency`, with recency weighted
// higher — so a barely-newer site can't be unseated by visit count alone, but a
// genuinely frequently-visited older site climbs over a marginally newer one.
const RECENCY_WEIGHT = 0.7;
const VISIT_WEIGHT = 0.3;

const usableTitle = (record) =>
  record && typeof record.title === 'string' && record.title.length > 0;

export function rankFavorites(allUrls, urlRecords, limit = 5) {
  if (!Array.isArray(allUrls) || allUrls.length === 0) return [];
  const records = urlRecords || {};

  // Candidates are the recency-ordered keys that actually have a renderable
  // record. We keep each candidate's original index so recency reflects the full
  // allUrls ordering, not just the subset that happens to have records.
  const candidates = [];
  for (let index = 0; index < allUrls.length; index++) {
    const urlKey = allUrls[index];
    const record = records[urlKey];
    if (!usableTitle(record)) continue;
    candidates.push({ urlKey, record, index });
  }
  if (candidates.length === 0) return [];

  const denom = Math.max(1, allUrls.length - 1);
  const maxVisits = candidates.reduce(
    (max, c) => Math.max(max, c.record.visitCount || 0),
    0
  );

  const scored = candidates.map((c) => {
    const recency = (allUrls.length - 1 - c.index) / denom; // newest = 1
    const frequency = maxVisits > 0 ? (c.record.visitCount || 0) / maxVisits : 0;
    const score = RECENCY_WEIGHT * recency + VISIT_WEIGHT * frequency;
    return { ...c, score };
  });

  // Sort by score desc; ties fall back to recency (lower original index wins) so
  // the ordering is fully deterministic.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, limit).map(({ urlKey, record }) => ({
    urlKey,
    url: record.url || urlKey.replace(/^url-/, ''),
    title: record.title,
    favicon: record.favicon || '',
  }));
}

export default rankFavorites;
