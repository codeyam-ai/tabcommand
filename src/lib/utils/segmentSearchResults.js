// Shapes raw minisearch hits into what the SearchResults overlay renders: a
// `{ labels, urls }` split (a hit is a label when it carries `labelTitle`,
// otherwise a labeled URL). Hits are first deduped by document id — overlapping
// index rebuilds (the seed-time `onChanged` plus StrictMode's double mount-read)
// can briefly leave a URL indexed twice, which would otherwise surface as two
// results sharing a React key. The first (highest-score, since minisearch sorts
// by score) hit per id is kept. Factored out of Search so the segmentation +
// dedupe is unit-testable independent of minisearch and React.
const segmentSearchResults = (results) => {
  const seen = new Set();
  const unique = (results || []).filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return {
    labels: unique.filter((r) => r.labelTitle),
    urls: unique.filter((r) => !r.labelTitle),
  };
};

export default segmentSearchResults;
