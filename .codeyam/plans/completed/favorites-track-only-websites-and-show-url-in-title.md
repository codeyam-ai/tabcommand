---
title: "Favorites: track only real websites and show full title + URL in tooltip"
mode: ui
createdAt: "2026-06-29T18:20:12Z"
source: manual
---

## Summary

The Favorites sidebar currently lists `about:blank` and other non-website
entries because URL recording in the service worker is not gated to real web
pages. Two fixes: (1) only ever record `http`/`https` URLs into the favorites
history (`allUrls` + `url-*` records), and defensively drop already-stored
non-website entries when ranking so existing junk disappears immediately; and
(2) make each favorite row's hover tooltip show the full title **and** the URL
on separate lines, matching the `title || url()` + URL pattern the bookmark
rows (`Url.jsx`) already use.

## Key Decisions

- **Trackable = `http`/`https` only** (chosen over an explicit blocklist) —
  the strictest, cleanest definition of "website". This excludes `about:*`
  (including `about:blank`), `file://`, `data:`, `view-source:`,
  `chrome://`, `chrome-extension://`, `devtools://`, etc. with one rule
  instead of an ever-growing blocklist.
- **Both stop tracking new junk AND filter existing junk** — gate `newUrl` so
  nothing non-http(s) is ever recorded going forward, and add a defensive
  guard in `rankFavorites` so the ~250 keys already in `allUrls` that point at
  `about:blank`/`file://`/etc. stop surfacing in Favorites right away rather
  than waiting to age out.
- **New shared `isTrackableUrl` util** — a single pure predicate both the
  worker (`newUrl`) and the renderer (`rankFavorites`) import, so the
  "what's a website" rule lives in exactly one place and is unit-testable.
  This complements the existing `validTab` (tab-shaped, worker-only) rather
  than replacing it.
- **Tooltip mirrors `Url.jsx`** — reuse the established
  `` `${title || url}\n\n${url}` `` shape so Favorites tooltips read
  identically to the bookmark rows the user referenced.

## Implementation

### 1. New shared "is this a real website?" predicate

**New file**: `src/lib/utils/isTrackableUrl.js`

A pure function `isTrackableUrl(url)` returning `true` only when `url` parses
as a URL whose protocol is exactly `http:` or `https:`. Returns `false` for
non-strings, empty/whitespace strings, unparseable values, and any other
scheme (`about:`, `file:`, `data:`, `view-source:`, `chrome:`,
`chrome-extension:`, `devtools:`, blob:, etc.). Mirror the defensive,
storage/DOM-free style of `normalizeUrl.js` (try/`new URL`/catch). Export both
named and default.

**New file**: `src/lib/utils/isTrackableUrl.test.js`

Cover: `https://example.com` and `http://example.com/path?q=1` → true;
`about:blank`, `about:newtab`, `file:///Users/x/doc.html`,
`chrome://extensions`, `chrome-extension://abc/page.html`,
`view-source:https://x.com`, `data:text/html,hi`, `''`, `'   '`,
`'not a url'`, `null`, `undefined` → false.

### 2. Stop recording non-website URLs in the service worker

**File**: `service_worker.js`

In `newUrl(tabId, url)` (around line 348), after the existing
`if (!tabId) return; if (!url) return;` guards, add an early return when
`!isTrackableUrl(url)` so a non-http(s) navigation never enters `allUrls`,
never evicts older keys, and never bumps `visitCount`. Import/reference
`isTrackableUrl` (the worker is a plain script — match however other utils are
made available to `service_worker.js`; if it isn't already importing shared
utils, inline the same predicate as a small local function near `validTab`
and keep its logic identical to the util, noting the duplication in a
comment). The two call sites (`onUpdated` at ~line 107, `onCreated` at
~line 178) need no change — gating inside `newUrl` covers both, and `newUrl`
returning `{}` for a skipped URL is already spread-safe into `updates`.

This intentionally sits alongside the existing incognito guard
(`if (!tab.incognito)`) and `validTab` policy — `about:blank` currently slips
through because `newUrl` never consulted `validTab`, and `validTab` itself
doesn't list `about:`.

### 3. Defensively drop non-website entries when ranking

**File**: `src/lib/utils/rankFavorites.js`

In the candidate-collection loop, skip any candidate whose URL is not
`isTrackableUrl`. Derive the URL the same way the existing grouping does
(`record.url || urlKey.replace(/^url-/, '')`) and `continue` past it before it
becomes a candidate, so already-stored `about:blank`/`file://`/etc. keys never
qualify or render. Import `isTrackableUrl` from `./isTrackableUrl`. Update the
module's leading comment to note the trackable-URL guard.

**File**: `src/lib/utils/rankFavorites.test.js`

Add a case proving a stored `about:blank` (or `file://`) record with a high
`visitCount` is excluded from the ranked result, while a normal `https://`
site still ranks.

### 4. Show full title + URL in the favorite tooltip

**File**: `src/lib/components/Favorites/Favorites.jsx`

Replace `title={favorite.title}` on the `Favorites-item` div with a combined
tooltip string built like `Url.jsx`:
`` `${favorite.title || favorite.url}\n\n${favorite.url}` ``. `favorite.url`
is already present on every ranked row (returned by `rankFavorites`), so no
new data plumbing is needed. Leave the inner `.Favorites-item-title` text node
showing just the title (the URL belongs in the hover tooltip, matching the
bookmark rows).

**File**: `src/lib/components/Favorites/Favorites.test.jsx`

Add/extend a test asserting the rendered item's `title` attribute contains
both the title and the URL (separated by the blank line), consistent with the
existing render assertions.

## Reused existing code

- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` (glossary entry:
  `normalizeUrl`) — pattern reference for the new pure URL util's defensive
  `new URL`/try-catch style; still used by `rankFavorites` for grouping.
- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — extended with the trackable-URL guard.
- `newUrl` from `service_worker.js` (glossary entry: `newUrl`) — gated to
  http(s) URLs only.
- `validTab` from `service_worker.js` (glossary entry: `validTab`) — sibling
  predicate; `isTrackableUrl` complements it (URL-shaped vs tab-shaped) and the
  plan notes why a separate helper rather than folding into `validTab`.
- `getUrlKey` from `service_worker.js` (glossary entry: `getUrlKey`) — how
  `url-*` keys are formed; the rankFavorites guard reverses it to recover the
  URL for the trackable check.
- The `` `${title || url}\n\n${url}` `` tooltip shape from
  `src/lib/components/Url/Url.jsx:60` — reused for the Favorites tooltip so it
  matches the bookmark rows the user referenced.

## Scenarios to Demonstrate

- **Happy path**: Favorites listing several real `https://` sites; hovering a
  row shows a tooltip with the site title, a blank line, then the full URL.
- **about:blank excluded (new)**: after visiting `about:blank` several times it
  never appears in Favorites (not recorded at all).
- **Existing junk filtered**: storage seeded with an `about:blank` /
  `file://...` `url-*` record at high `visitCount` — Favorites renders without
  it on first paint (defensive rankFavorites guard), while real sites still
  rank.
- **Title-less favorite**: a record with an empty title falls back to showing
  the URL in both the row text and the tooltip's first line.
- **Empty state**: no qualifying real websites → Favorites section renders
  nothing.
