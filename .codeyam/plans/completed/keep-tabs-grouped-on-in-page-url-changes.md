---
title: "Keep Tabs in Groups Through In-Page URL Changes"
mode: backend
createdAt: "2026-06-30T13:32:49Z"
source: manual
---

## Summary

Tabs that mutate their own URL in-page — most visibly Google Docs, which
rewrites the `?tab=t.…` query string via the History API as you click around a
document — silently get ejected from their tab group. The reported case: the
doc `https://docs.google.com/document/d/1GMK…/edit?tab=t.whli3qfeqr1i` was in
the "Ambiguity Everywhere" group and disappeared from it. The cause is the
`chrome.tabs.onUpdated` handler, which ungroups **any** grouped tab whose URL
changes, without distinguishing a real navigation from an in-page URL
rewrite. The fix is a single, general structural rule: a URL change whose
**origin and pathname are unchanged** (only the query string or fragment
moved) is an in-page change, and the tab stays in its group. A change to a
different origin or path still ejects, exactly as today. No per-site logic, so
it can't break when a site changes how it constructs its URLs.

## Key Decisions

- **Structural rule, not a host allow-list.** Decide "in-page vs navigation"
  by comparing `origin + pathname`. This is general (covers Google Docs,
  Notion, Figma, and any SPA that carries state in the query/hash) and robust
  to sites changing their URL schemes. We explicitly rejected a per-host
  normalization table because it would rot the moment a site changed behavior.
- **Gate only the ungroup call — leave URL tracking untouched.** The handler
  still runs `closeUrl(oldKey)` + `newUrl(newUrl)` so visit tracking and the
  `allUrls` MRU list stay accurate. The *only* behavioral change is skipping
  `chrome.tabs.ungroup(...)` on an in-page change. Verified that `closeUrl`
  (service_worker.js:416-424) only reorders `allUrls` and does not touch
  grouping or `label.urlKeys`, so this is a surgical, isolated change.
- **Do NOT change `getUrlKey`.** `getUrlKey` is the global tracking key used
  across `activeTabs`, `allUrls`, visit counts, etc. Stripping the query string
  there would conflate distinct URLs (e.g. two different searches) everywhere.
  The in-page/navigation distinction lives only in the eject path.
- **No migration / no auto-heal of already-removed docs.** Per the user's
  choice, the already-ejected doc is re-added manually once. This fix prevents
  future ejections; it does not rewrite existing `label.urlKeys`.
- **New `samePageKey` helper lives in `src/lib/utils/`.** Matches the existing
  pattern (e.g. `normalizeUrl`, `isTrackableUrl`, `deriveSystemTotals` already
  live there and `service_worker.js` already imports two of them at the top),
  so it is independently unit-testable and registerable in the glossary.

## Implementation

### 1. Add a general "same page" helper

**New file**: `src/lib/utils/samePageKey.js`

Export a function `samePageKey(url)` that returns a stable page identity for a
URL: its **origin + pathname**, with the query string and hash fragment
dropped. Use the `URL` API (`const u = new URL(url); return u.origin + u.pathname;`).
Wrap in a try/catch so an unparseable / non-http value (e.g. `chrome://`,
`about:blank`, empty string) falls back to returning the raw input string
unchanged — that way two unparseable values only compare equal when they are
literally identical, preserving today's eject behavior for those cases.

Examples of intended behavior:
- `https://docs.google.com/document/d/1GMK…/edit?tab=t.A` and
  `…/edit?tab=t.B` → both `https://docs.google.com/document/d/1GMK…/edit`
  (equal → in-page).
- `https://example.com/a` vs `https://example.com/b` → different (navigation).
- `https://example.com/page` vs `https://other.com/page` → different
  (navigation).
- `https://site.com/page#x` vs `https://site.com/page#y` → equal (in-page).

### 2. Gate the ungroup-on-navigation on a real navigation

**File**: `service_worker.js` (the `chrome.tabs.onUpdated` listener, the
`if (changeInfo.url)` branch around lines 102-128)

Import `samePageKey` alongside the existing `src/lib/utils` imports at the top
of the file.

Inside the `if (oldTabUrl) { … }` block, the current code unconditionally
ungroups when `tab.groupId > -1`:

```js
if (oldTabUrl) {
  closeUrl(oldTabUrl.urlKey);
  if (tab.groupId > -1) {
    pendingUngroups.add(tab.id);
    chrome.tabs.ungroup(tab.id, () => { … });
  }
}
```

Change it so the ungroup only happens on a genuine navigation. Derive the old
URL from the stored key (`oldTabUrl.urlKey` is `url-<old-url-minus-fragment>`;
strip the leading `url-`), compute whether origin+path changed, and only
ungroup when it did:

```js
if (oldTabUrl) {
  closeUrl(oldTabUrl.urlKey);
  const oldUrl = oldTabUrl.urlKey.replace(/^url-/, '');
  const isNavigation = samePageKey(oldUrl) !== samePageKey(changeInfo.url);
  if (tab.groupId > -1 && isNavigation) {
    pendingUngroups.add(tab.id);
    chrome.tabs.ungroup(tab.id, () => { … });
  }
}
```

Leave the rest of the branch (`closeUrl`, the incognito-guarded `newUrl`
bookkeeping) exactly as-is so URL tracking continues to follow the live URL.

### 3. Tests

**New file**: `src/lib/utils/samePageKey.test.js`

Unit tests for the helper: query-only change → equal; fragment-only change →
equal; path change → not equal; origin change → not equal; the exact Google
Docs `?tab=` case → equal; unparseable inputs (`chrome://newtab`, `''`) → fall
back to identity comparison.

**File**: `service_worker.test.js`

Add tests around the `onUpdated` ungroup path (near the existing ungroup /
eject tests, service_worker.test.js:480-660, and the membership-splice test at
:711-735):
- A grouped tab (`groupId > -1`) whose URL changes only in the **query string**
  (Google Docs `?tab=t.A` → `?tab=t.B`) is **not** ungrouped — `chrome.tabs.ungroup`
  is not called and the tab stays in its group. This is the regression test for
  the reported bug; there is currently no test for a query-only in-page change.
- A grouped tab whose URL changes only in the **fragment** is likewise not
  ungrouped.
- A grouped tab that navigates to a **different path/origin** is still ungrouped
  (existing behavior preserved).

## Reused existing code

- `getUrlKey` from `service_worker.js` (glossary entry: `getUrlKey`) — left
  unchanged; referenced to explain why the query string is part of the key.
- `closeUrl` from `service_worker.js` (glossary entry: `closeUrl`) — confirmed
  it only reorders the `allUrls` MRU list, so gating the ungroup call is safe.
- `newUrl` from `service_worker.js` (glossary entry: `newUrl`) — the navigation
  bookkeeping that continues to run unchanged.
- `normalizeUrl`, `isTrackableUrl`, `deriveSystemTotals` from
  `src/lib/utils/` — the existing `src/lib/utils` helper pattern the new
  `samePageKey` follows (the last two are already imported by
  `service_worker.js`).
- `pendingUngroups` / `urlKeyIsMember` from `service_worker.js` — the
  surrounding grouping machinery the change interacts with.

## Scenarios to Demonstrate

- **The reported bug, fixed.** A Google Doc tab in the "Ambiguity Everywhere"
  group; interacting with the doc rewrites `?tab=t.whli3qfeqr1i` → `?tab=t.other`.
  The tab stays in the group.
- **Fragment churn.** A grouped page that updates its `#hash` (SPA anchor
  navigation) stays in its group.
- **Real navigation still ejects.** A grouped tab navigated from
  `example.com/a` to `example.com/b` (different path) is removed from the
  group — confirming we didn't over-correct.
- **Cross-origin navigation still ejects.** A grouped tab navigated to a
  different domain is removed from the group.
- **Helper edge cases.** `samePageKey` on `chrome://newtab`, `about:blank`, and
  an empty string fall back to identity comparison without throwing.
