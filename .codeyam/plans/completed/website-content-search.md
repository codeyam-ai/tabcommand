---
title: "Website Content Search"
mode: ui
createdAt: "2026-09-10T13:09:50Z"
source: manual
dependsOn: ["full-search-page"]
---

## Summary

Add website content search to the Full Search page. After the user clicks **"Search page contents"**, TabCommand loads the pages in a chosen scope and searches their text for the query. The scope is one of: open tabs, one group, all grouped URLs, or recent history. Matches stream into a new **"Page contents"** section, each with a text snippet around the hit and a progress bar showing how many pages have been scanned. Today TabCommand has no host permissions and reads no page content, and its store listing makes a point of this. So the capability is strictly opt-in: host access is requested at runtime as an optional permission, and nothing changes for users who never turn it on.

## Key Decisions

- **Optional host permissions, requested on first use.** Add `"optional_host_permissions": ["<all_urls>"]` and `"optional_permissions": ["scripting"]`, and call `chrome.permissions.request` when the user first clicks "Search page contents". The install-time permission warnings stay exactly as they are today. That keeps the store-listing claim at `store/store-listing.md:124` ("no host permissions… no scripting") true for the default install, but the listing needs a new optional-permission section.
- **Two extraction strategies, used in tiers:**
  1. **Open tabs:** run `chrome.scripting.executeScript` on the live tab to get `document.body.innerText`. This is instant, sees JS-rendered content, and loads nothing new.
  2. **Closed URLs (groups and history):** call `fetch(url)` from the extension page and parse the response with `DOMParser` to get the text. This is cheap and needs no tabs, but it misses content that only exists after JavaScript renders the page. If the fetch yields almost no text (below a threshold, e.g. 200 characters), optionally fall back to opening a background tab, which is inactive and outside the user's window groups. The fallback runs `executeScript` there and then closes the tab. It is behind a "Deep scan (loads pages)" checkbox, off by default.
  
  Also considered: an `offscreen` document. It still can't run a page's own JavaScript for cross-origin pages, so it adds nothing over fetch + DOMParser.
- **Bounded, cancellable, local.** At most 4 pages run at once, with a per-page timeout, a Cancel button, and a hard cap on the number of pages per scan (e.g. 100). Results live only in memory for the page session. A persisted text cache is left for a follow-up because of the size limits on `chrome.storage.local`. Nothing leaves the device.
- **Login-walled pages** return whatever `fetch` gets back, and may not match. The deep-scan tier uses the user's real session. Label the snippets with which tier produced them.
- **Privacy copy must change.** `PRIVACY.md` line 19 says "It does not read page content", which becomes false once the feature is enabled. Update it to: reads page content only when you run a content search, locally, never transmitted. Then flag the external codeyam.com/tabcommand/privacy page for the same edit.

## Implementation

### 1. Manifest

**File**: `manifest.json`: add `optional_host_permissions: ["<all_urls>"]` and add `scripting` to `optional_permissions` (the full-search plan adds that key for `history`).

### 2. Content-scan engine

**New file**: `src/lib/utils/pageContentScan.js` (+ test)

`scanPages({ targets, query, concurrency, deep, signal, onResult, onProgress })`:
- Each target is `{ urlKey, url, tabId? }`.
- A target with a `tabId` uses `executeScript`. The rest use fetch + `DOMParser`, with the optional deep tab fallback.
- Matching is case-insensitive over the text, with snippets built by `searchNotesSnippet`.
- Aborting via the `AbortSignal` cancels any in-flight fetches and closes deep-scan tabs.

Keep the matching and snippet logic as a pure function (`matchPageText(text, query)`) so it can be unit tested.

### 3. Full Search integration

**File**: `src/lib/pages/FullSearch/FullSearch.jsx` (created by the full-search plan)

- A "Page contents" panel with: a scope select (Open tabs · a group · All grouped URLs · Recent history, 50 most recent), a Deep scan checkbox, and a Search / Cancel button.
- A progress readout ("Scanned 23 / 60").
- A new "Page contents" chip and section. Each hit shows the favicon, the title, the snippet, and a tier badge (live / fetched / deep).
- Targets come from `activeTabs`, `labels[].urlKeys`, and `allUrls`.

### 4. Dev shim

**File**: `src/lib/utils/chromeShim/chromeShim.js`: add `scripting.executeScript` and `permissions` stubs that return canned page text, so scenarios can show a scan in progress, finished with results, and denied.

### 5. Store and privacy

**File**: `store/store-listing.md`: add justifications for the optional `<all_urls>` host permission and the optional `scripting` permission. Reword the "no host permissions" line to "no host permissions at install".

**File**: `PRIVACY.md`: update the page-content sentence. Also flag the external privacy page.

## Reused existing code

- `searchNotesSnippet` from `src/lib/utils/searchNotesSnippet.js` (glossary: `searchNotesSnippet`), for content snippets
- `Chrome.get` from `src/lib/utils/Chrome`, for `activeTabs` / `labels` / `allUrls`
- Shim patterns in `src/lib/utils/chromeShim/chromeShim.js`
- The Full Search page and `segmentFullSearchResults` from the prerequisite plan

## Scenarios to Demonstrate

- Before opting in: the "Search page contents" button with an explanation of the permission prompt
- Permission denied: an inline message and a retry button
- Scan in progress: the progress bar, with partial results streaming in
- Scan complete with hits across open tabs and fetched pages, showing the tier badges
- Scan complete with no hits
- A scan cancelled partway through