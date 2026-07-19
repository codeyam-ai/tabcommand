---
title: "Keep Search Engines Out of Favorites"
mode: ui
createdAt: "2026-07-19T12:49:09Z"
source: manual
---

## Summary

Google searches are hijacking the top of Favorites. Because `rankFavorites`
rolls every page up **by host** (`siteKey`), every distinct Google search URL
(`https://www.google.com/search?q=...`) collapses onto a single `google.com`
row, and the service worker credits `siteVisits['google.com']` on **every**
search. That store climbs to the `MAX_VISITS = 50` cap, giving `google.com` a
huge time-decayed score and pinning it at #1 with a "50 visits" badge — even
right after a single search. Search engines are launchers, not destinations you
return to for their content, so they should never qualify as Favorites. This
fix introduces a curated search-engine-host predicate and filters those hosts
out of Favorites at rank time (which also clears the already-inflated stored
data instantly, no migration), and stops the service worker from accumulating
visit stats for them going forward.

## Key Decisions

- **Whole-host exclusion, not just `/search` URLs.** `siteVisits` is keyed only
  by host (`google.com`), so a stored timestamp can't be traced back to a
  search vs. a homepage visit. Excluding the entire search-engine host is the
  only approach that makes the inflated `google.com` row disappear immediately
  instead of waiting ~2 weeks for 50 recent timestamps to decay below
  `QUALIFY_MIN`. Google's host is effectively only search + homepage, and Google
  properties that are real destinations live on *different* hosts
  (`docs.google.com`, `maps.google.com`, `mail.google.com`), which `siteKey`
  already keeps distinct — so nothing worth favoriting is lost.
- **Curated host list, not a `?q=`/`/search` heuristic.** A `q=` query param and
  a `/search` path appear on plenty of ordinary sites (site-internal search,
  analytics), so a heuristic would produce false exclusions. A curated set of
  known engines is precise. Google's many ccTLDs (`google.co.uk`, `google.de`,
  …) are covered by a small `google.<tld>` rule rather than enumerating every
  TLD.
- **Fix authoritatively at rank time (`rankFavorites`), harden at the source
  (`newUrl`).** The rank-time filter is what actually fixes the bug and the
  already-polluted store, so it is required and fully sufficient on its own. The
  service-worker gate is secondary hygiene: it stops `siteVisits` from growing
  wasteful (but now-invisible) entries for search hosts going forward.
- **Exclude SERP subdomains for portal engines.** `search.yahoo.com` is the
  search host, but `yahoo.com` is a content portal — the list targets the SERP
  host (`search.yahoo.com`, `search.brave.com`) rather than the portal root, so
  a genuine portal visit isn't collateral.

## Implementation

### 1. New predicate: `isSearchEngineUrl`

**New file**: `src/lib/utils/isSearchEngineUrl.js`

A pure, storage/DOM-free predicate mirroring the shape and defensive style of
`isTrackableUrl.js` — takes a URL string, returns `true` when it points at a
known search engine. Reuse `siteKey` to reduce the URL to its canonical host
(lowercased, `www.`-stripped), then test that host against:

- An exact-host `Set` of known engines and SERP subdomains:
  `bing.com`, `duckduckgo.com`, `ecosia.org`, `search.brave.com`,
  `startpage.com`, `baidu.com`, `yandex.com`, `yandex.ru`, `qwant.com`,
  `kagi.com`, `search.yahoo.com`, `ask.com`. (List is easy to extend; keep it
  alphabetized.)
- A Google rule covering ccTLDs: host `=== 'google.com'` or matching
  `^google\.[a-z.]+$` so `google.co.uk`, `google.de`, `google.fr`, etc. all
  count. (Because `siteKey` strips `www.`, `www.google.com` normalizes to
  `google.com` before the check.)

Return `false` for a non-string / unparseable / empty input (defer to
`siteKey` returning `''`, which is not in the set and fails the Google rule).

### 2. Filter search engines out of Favorites at rank time

**File**: `src/lib/utils/rankFavorites.js`

Import `isSearchEngineUrl`. In the candidate loop, immediately after the
existing trackable-URL guard:

```js
const candidateUrl = record.url || urlKey.replace(/^url-/, '');
if (!isTrackableUrl(candidateUrl)) continue;
if (isSearchEngineUrl(candidateUrl)) continue;   // <-- add
```

Dropping the candidate before grouping means no `google.com` group is ever
formed, so the polluted `siteVisits['google.com']` is never unioned in and
`google.com` cannot qualify — fixing both the live symptom and the stored data
in one pass. Extend the header comment block (the "Candidates are gated to real
websites (`isTrackableUrl`)…" paragraph) to note that search-engine hosts are
also skipped, and why (they're launchers, not returned-to destinations).

### 3. Stop crediting search-engine hosts in the service worker (hygiene)

**File**: `service_worker.js`

`newUrl` still records search pages into `allUrls` / `visitCount` (they remain
part of browsing history for the extension's own features), but should no
longer accumulate Favorites scoring signal for them. Gate the per-record
`visits` append and the `siteVisits[host]` write behind a search-engine check
so those stores stop growing entries that `rankFavorites` now discards anyway.

The service worker cannot import ES modules, so — exactly as it already mirrors
`siteKey` (line ~123) and `pruneVisits` (line ~112) — add a small mirrored
`isSearchEngineUrl(url)` helper (or inline the host-set + Google-ccTLD check)
near those mirrors, and use it in `newUrl` (around lines 547–568) to skip the
`visits`/`siteVisits` writes when the URL is a search engine. Keep the mirrored
host set byte-identical to the canonical one and cross-reference it in a comment
so the two don't drift, matching the existing mirror convention. This step is
secondary; if it complicates review it can ship separately, since step 2 alone
resolves the reported bug.

## Reused existing code

- `siteKey` from `src/lib/utils/siteKey.js` (glossary entry: `siteKey`) —
  canonical host normalization (`www.`-strip, lowercase) reused by the new
  predicate so its host matching lines up exactly with the grouping key and the
  `siteVisits` store key.
- `isTrackableUrl` from `src/lib/utils/isTrackableUrl.js` (glossary entry:
  `isTrackableUrl`) — the pattern this new predicate mirrors (pure, defensive,
  URL-shaped, shared by worker + renderer) and the guard it sits beside in
  `rankFavorites`.
- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — the candidate loop and its `isTrackableUrl` guard are the
  exact insertion point.
- `pruneVisits` / `MAX_VISITS` / `siteVisits` in `service_worker.js` (glossary
  entry: `pruneVisits`) — the existing mirror-in-the-worker convention the new
  mirrored predicate follows.
- **Existing-implementation survey:** grepped `src/lib/utils/` and
  `service_worker.js` and ran `glossary-find searchEngine --substring` — no
  existing search-engine / SERP predicate exists (the `segmentSearchResults`,
  `buildSearchDocuments`, `groupSearchUrlsByLabel`, `searchNotesSnippet` utils
  are about the extension's *own* note/history search, not web search engines).
  This predicate is genuinely new.

## Reproduction Test

Pins that a search-engine host (`google.com`) with a heavy visit history is
kept out of Favorites entirely.

**Target**: `src/lib/utils/rankFavorites.test.js` — run with
`codeyam-editor editor refresh-tests --test rankFavorites`.

```js
// A search-engine host never qualifies as a Favorite, even when its durable
// siteVisits history is at the cap (the "google.com, 50 visits at the top" bug).
it('excludes search-engine hosts from Favorites despite heavy visit history', () => {
  const allUrls = ['url-google-search'];
  const records = {
    'url-google-search': {
      title: 'weather - Google Search',
      favicon: '',
      url: 'https://www.google.com/search?q=weather',
      visitCount: 50,
      visits: [],
    },
  };
  // Durable site store at the MAX_VISITS cap, all recent — what pins it at #1.
  const siteVisits = {
    'google.com': Array.from({ length: 50 }, (_, i) =>
      Math.round(NOW - i * 60 * 60 * 1000)
    ),
  };
  const result = rankFavorites(allUrls, records, 5, undefined, opts({ siteVisits }));
  expect(result).toEqual([]);
});
```

Status: PROPOSED — confirm red at execution. Expected failure before the fix:
`google.com` rolls up 50 recent visits, clears `QUALIFY_MIN`, and is returned as
one row, so `toEqual([])` fails with a length-1 array (a `google.com` row whose
`visitCount` is `50`). After the fix the candidate is filtered, no group forms,
and the result is `[]`.

## Scenarios to Demonstrate

- **The bug, reproduced:** a fresh profile that has only done Google searches —
  before the fix `google.com` sits at the top of Favorites with a "50 visits"
  badge; after the fix Favorites is empty.
- **Real favorites survive alongside searches:** history mixing many Google
  searches with a genuinely revisited site (e.g. `github.com`) — only
  `github.com` appears; `google.com` is gone.
- **Google properties on other hosts are unaffected:** frequent
  `docs.google.com` / `mail.google.com` visits still qualify (distinct hosts,
  not the search engine).
- **Multiple engines:** history across `bing.com`, `duckduckgo.com`, and a
  `google.co.uk` ccTLD search — none appear in Favorites.
- **Edge — portal vs. SERP:** `search.yahoo.com` is excluded while a
  `yahoo.com` portal visit is not, confirming the SERP-subdomain targeting.
- **View All page:** the "View All Favorites" page shows the same exclusion, and
  its reset control still behaves correctly with search hosts absent.