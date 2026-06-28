// Produces a canonical grouping key for de-duplicating URLs that are "the same
// site" but differ only in cosmetic ways. The Favorites section keys records as
// `url-<url-without-#hash>`, so two URLs that differ only by a trailing slash,
// `http` vs `https`, or a leading `www.` become distinct storage keys and render
// as separate, visually-identical rows. `normalizeUrl` collapses exactly those
// cosmetic variants into one key so `rankFavorites` can group them.
//
// What IS collapsed (these map to the same key):
//   - scheme: `http` and `https` are treated as equivalent (scheme dropped).
//   - host case: `Example.com` and `example.com`.
//   - leading `www.`: `www.example.com` and `example.com`.
//   - a trailing slash on the path: `/path/` and `/path`, and a bare root `/`.
//   - a `#fragment` (defensive — keys already strip it via getUrlKey).
//
// What is NOT collapsed (these stay distinct — genuinely different pages):
//   - the query string is PRESERVED (`?id=1` and `?id=2` differ).
//   - distinct paths (`/a` vs `/b`).
//
// Defensive: anything that isn't a parseable URL falls back to the trimmed raw
// string so callers never throw on a key-derived or malformed value (mirrors how
// rankFavorites already tolerates url-from-key derivation).
export function normalizeUrl(url) {
  if (typeof url !== 'string') return '';
  const raw = url.trim();
  if (raw.length === 0) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  // Drop the scheme entirely so http/https collapse; lowercase + strip a leading
  // `www.` from the host; drop a trailing slash from the path (so a bare root
  // becomes ''); keep the (lowercase-host) query; drop the fragment.
  const host = parsed.host.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${host}${path}${parsed.search}`;
}

export default normalizeUrl;
