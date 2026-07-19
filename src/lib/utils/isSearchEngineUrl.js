import { siteKey } from './siteKey';

// Is this URL a search engine? Search engines are launchers, not destinations
// you return to for their content, so they must never qualify as Favorites —
// otherwise every distinct `google.com/search?q=…` collapses onto one
// `google.com` row (via siteKey) whose visit count climbs to the cap and pins it
// at the top of Favorites. This is the single source of truth for that judgment,
// shared by `rankFavorites` (renderer) and a byte-identical mirror in
// service_worker.js (which cannot import ES modules), mirroring the pure,
// storage/DOM-free style of `isTrackableUrl`.
//
// Matching is whole-HOST, by design: `siteVisits` is keyed only by host, so a
// stored timestamp can't be traced back to a search vs. a homepage visit —
// excluding the entire host is the only way to make an already-inflated
// `google.com` row disappear immediately. Google properties that are real
// destinations live on DIFFERENT hosts (`docs.google.com`, `mail.google.com`,
// `maps.google.com`), which siteKey keeps distinct, so nothing worth favoriting
// is lost. For portal engines the SERP subdomain is targeted (`search.yahoo.com`,
// `search.brave.com`) rather than the content-portal root (`yahoo.com`).
//
// Keep this host set alphabetized and byte-identical to the mirror in
// service_worker.js (search for SEARCH_ENGINE_HOSTS there) so the two never drift.
const SEARCH_ENGINE_HOSTS = new Set([
  'ask.com',
  'baidu.com',
  'bing.com',
  'duckduckgo.com',
  'ecosia.org',
  'kagi.com',
  'qwant.com',
  'search.brave.com',
  'search.yahoo.com',
  'startpage.com',
  'yandex.com',
  'yandex.ru',
]);

// Google's many ccTLDs (`google.com`, `google.co.uk`, `google.de`, …) all count.
// siteKey strips `www.`, so `www.google.com` normalizes to `google.com` first.
const GOOGLE_HOST = /^google\.[a-z.]+$/;

export function isSearchEngineUrl(url) {
  // Reduce to the canonical host (lowercased, `www.`-stripped) so the check lines
  // up exactly with the grouping key and the `siteVisits` store key. A non-string
  // / unparseable / empty input yields '', which is in neither the set nor the
  // Google rule, so it correctly returns false.
  const host = siteKey(url);
  if (host.length === 0) return false;
  return SEARCH_ENGINE_HOSTS.has(host) || GOOGLE_HOST.test(host);
}

export default isSearchEngineUrl;
