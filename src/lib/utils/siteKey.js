// The canonical SITE key for a URL: its host, lowercased, with a leading `www.`
// stripped — no scheme, path, query or fragment. This is the key the durable
// `siteVisits` store is written under (service_worker `newUrl`) and the grouping
// key `rankFavorites` rolls candidates up by.
//
// Visit stats are site-level, not page-level, on purpose. Keying them per-page
// (as the `url-*` records are) means a content site the user reads deeply —
// every ESPN article its own key — never accumulates credit on any one key, and
// its individual article keys crowd out the tracked-URL list. `siteKey` collapses
// every page of a site onto one identity, so "23 visits to espn.com" is a number
// the site actually earned.
//
// What collapses to the same key:
//   - scheme:  `http://espn.com` and `https://espn.com`
//   - host case: `ESPN.com` and `espn.com`
//   - leading `www.`: `www.espn.com` and `espn.com`
//   - any path/query/fragment: `espn.com/nfl/story?id=1` and `espn.com`
//
// What stays distinct: different hosts, including subdomains other than `www.`
// (`docs.python.org` is not `python.org`) — a subdomain is usually a genuinely
// different site, and collapsing them would over-merge.
//
// Defensive: a non-string or non-parseable input returns `''` (mirroring how
// `normalizeUrl` tolerates key-derived and malformed values). Callers treat an
// empty key as "no site" and skip it rather than bucketing junk together.
export function siteKey(url) {
  if (typeof url !== 'string') return '';
  const raw = url.trim();
  if (raw.length === 0) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }

  return parsed.host.toLowerCase().replace(/^www\./, '');
}

export default siteKey;
