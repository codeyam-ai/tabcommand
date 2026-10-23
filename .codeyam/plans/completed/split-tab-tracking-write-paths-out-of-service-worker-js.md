---
title: "Split tab-tracking write paths out of service_worker.js"
mode: backend
createdAt: "2026-10-23T12:48:08Z"
source: proposed-plan
---

## Summary

`service_worker.js` is 1871 production lines against a 500-line budget, and its three longest functions (`groupTabs` 172, `recordInGroupTab` 130, `handleActiveTabsGroupChanges` 119) are over the 150-line entity budget. The url-* record write paths (`tabUpdates`, `urlUpdates`, `newUrl`, `recordAccess`) that the raw-URL-title fix had to touch live inside this file, which made each fix site slow to find and hard to test in isolation; the worker test harness has to strip imports and inject every helper by name.

## Key Decisions

- Move the url-* record tracking (`tabUpdates`, `urlUpdates`, `newUrl`, `recordAccess`, `getUrlKey`, `pruneVisits`) into `src/lib/worker/urlTracking.js` as pure-ish functions taking `getStorage` / `chrome.tabs.get` as parameters, like `src/lib/utils/urlRecordDisplay.js` already does for the display rules.
- Keep the chrome event listeners in `service_worker.js`; they become thin callers.
- Behaviour-preserving only: no logic changes in this plan.

## Implementation

1. Create `src/lib/worker/urlTracking.js` and move the functions listed above, injecting storage and tab access.
2. Update `service_worker.js` imports and the listener call sites (`onCreated`, `onUpdated`, `onActivated`).
3. Move the `describe('urlUpdates')`, `describe('newUrl')` and `describe('tabUpdates')` blocks from `service_worker.test.js` into `src/lib/worker/urlTracking.test.js`, calling the functions directly instead of through the `new Function` harness.
4. Remove the moved names from the harness parameter list in `service_worker.test.js`.

## Reproduction Test

Not a bug fix; the existing urlUpdates/newUrl tests (including `keeps a real title when the live tab reports its raw url`) must stay green after the move.