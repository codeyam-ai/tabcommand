---
title: "Never Replace a Real Tab Title with a Raw URL"
mode: backend
createdAt: "2026-10-23T11:37:04Z"
source: manual
---

## Summary

After a URL joins a tab group, its row sometimes flips from a real page title and favicon to the raw URL with the monogram fallback. Two worker paths in `service_worker.js` can cause this, and both write a weaker title over a better one:

1. **Raw-URL titles are accepted.** `urlUpdates` copies `tab.title` whenever the tab isn't `"loading"`. Chrome reports the URL itself as `tab.title` in short windows: before the page sets its `<title>`, for `"unloaded"` (discarded or lazily restored) tabs, and around moves into a group. That raw string overwrites the stored real title.
2. **Stale whole-record writes from `newUrl`.** `newUrl` rebuilds `url-*` from a storage snapshot (`{ ...urlRecord, visitCount, lastVisit, visits }`, or `{ url }` when no record exists yet). `onCreated` and `onUpdated` then spread that over the fresher record from `tabUpdates` (`{ ...tabUpdates, ...newUrl }`), and `recordAccess` (from `onActivated`) runs it alongside them. If the snapshot predates the title/favicon write, the record goes back to having no title and no favicon. This is the only path that can drop the **favicon**, because `urlUpdates` never clears one. That matches the symptom where both disappear at once.

Expected behavior: once a record has a real title (and favicon), no automatic tracking write may replace it with a raw URL or an empty value. A real title can still replace another real title, and a real title still upgrades a raw-URL placeholder.

## Key Decisions

- **One shared rule for "is this a real title".** A new pure helper, `isRawUrlTitle(title, url)`, decides whether a title is just the URL: empty, equal to the URL, or the URL without scheme, `www.` or a trailing slash. A companion `mergeUrlDisplay(stored, incoming)` keeps the better title and favicon of two records. Every write path uses these two helpers instead of repeating the logic inline. They live in `src/lib/utils/`, next to the other helpers the worker imports.
- **Keep the stored `title = url` fallback.** Brand-new records still get `url.title = url.url`, so the existing test "uses the url as title when title is missing" and consumers such as `usableTitle` in `rankFavorites` keep working. Because the helper classifies that fallback as raw, a real title still replaces it later.
- **Fix the merge points, not `update()`.** Turning `update()` into a read-before-write would change timing for every caller. The plan fixes the three places that actually combine records (the `onCreated` and `onUpdated` merges, and `newUrl`'s own snapshot rebuild).
- **`edited: true` records stay untouched.** The existing user-curated pin keeps priority over everything.
- **The row component gets a display guard too.** `Url.jsx` ignores an incoming raw/empty title or empty favicon when it already shows a real one. This is a backstop for any write path missed here; the storage fixes are still the real fix.

## Implementation

### 1. Title/favicon helpers

**New file**: `src/lib/utils/urlRecordDisplay.js` (plus `urlRecordDisplay.test.js`)

- `isRawUrlTitle(title, url)` returns true for a missing or empty title, or for a title that matches `url` after normalization (strip `http(s)://`, a leading `www.`, a trailing `/`, and the `#hash`).
- `mergeUrlDisplay(stored, incoming)` returns `incoming` with `title` and `favicon` taken from `stored` whenever `incoming`'s value is raw or empty and `stored`'s is real. It never mutates its inputs.

### 2. `urlUpdates` stops accepting raw titles over real ones

**File**: `service_worker.js` (`urlUpdates`, ~line 1130)

Copy `tab.title` only if it isn't raw (`!isRawUrlTitle(tab.title, tab.url)`) or the record has no real title yet. Leave the `edited` guard, the `"loading"` guard, and the `title = url` fallback as they are.

### 3. `newUrl` and the event merges keep the freshest display fields

**File**: `service_worker.js` (`newUrl` ~line 785, `onCreated` ~line 536, `onUpdated` ~line 349/483)

- In `onCreated` and `onUpdated`, combine the `url-*` entry from `tabUpdates` with the one from `newUrl` using `mergeUrlDisplay(tabUpdatesRecord, newUrlRecord)` instead of a plain key-replacing spread. All other keys still spread as before.
- In `newUrl`: when the snapshot has no real title or favicon, fill them from the live tab (`chrome.tabs.get(tabId)`, wrapped in try/catch like `recordAccess`), using the same raw-title rule. Then a standalone `recordAccess` write can't strip the display fields either.
- Add `isRawUrlTitle` and `mergeUrlDisplay` to the worker's import list, and to the `new Function(...)` parameter list in `service_worker.test.js`. The harness strips imports and injects each one by name.

### 4. Display backstop in the row

**File**: `src/lib/components/Url/Url.jsx` (`handleUrl` / `setPartialState`)

When a storage change arrives, keep the current `title` if the incoming one is raw (`isRawUrlTitle`) and the current one isn't. Keep the current `favicon` if the incoming one is empty. The initial load is unchanged.

## Reused existing code

- `urlUpdates`, `tabUpdates`, `newUrl`, `recordAccess` from `service_worker.js` (glossary entry: `urlUpdates`). These are the sites being fixed.
- `getUrlKey` from `service_worker.js`: hash-stripping convention to mirror in `isRawUrlTitle`.
- `usableTitle` from `src/lib/utils/rankFavorites.js`: existing "has a title" check; unaffected, since the stored fallback is kept.
- Test harness in `service_worker.test.js` (`describe('urlUpdates')`, `describe('newUrl')` with `chrome.storage.local.get.mockImplementation`): extend in place.

## Reproduction Test

A completed tab whose `tab.title` is just its URL overwrites a stored real title.

**Target**: `service_worker.test.js`, inside `describe('urlUpdates')`. Run with `codeyam-editor editor refresh-tests --test "keeps a real title when the live tab reports its raw url"`.

```js
// a tab whose title is just its url must not overwrite a real stored title
it('keeps a real title when the live tab reports its raw url', () => {
  const out = fns.urlUpdates(
    { url: 'https://example.com/page', title: 'Example Page', favicon: 'ex.png' },
    { status: 'complete', title: 'example.com/page', favIconUrl: '', groupId: 7, url: 'https://example.com/page' }
  );
  expect(out.title).toBe('Example Page');
  expect(out.favicon).toBe('ex.png');
});
```

Status: PROPOSED — confirm red at execution. Expected failure: `out.title` is `'example.com/page'`, so the first `toBe('Example Page')` fails.

Companion test for cause 2 (add with the fix; also confirm red first): in `describe('newUrl')`, storage returns no `url-https://new.com` record, and `chrome.tabs.get` resolves `{ id: 1, url: 'https://new.com', title: 'New Site', favIconUrl: 'n.png', status: 'complete' }`. Expect `updates['url-https://new.com'].title` to be `'New Site'` and `.favicon` to be `'n.png'`. Today both are `undefined`.

## Scenarios to Demonstrate

- A group row with a real title and favicon stays unchanged after a raw-URL tracking tick (the bug case)
- A brand-new URL added to a group shows its URL briefly, then its real title and favicon once loaded
- A page with no `<title>` keeps showing its URL (the fallback still works)
- A user-edited (`edited: true`) record keeps its custom title through live-tab changes
- A real title change on the site (e.g. an unread-count prefix) still updates the row