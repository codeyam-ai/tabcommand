---
title: "Heal Group Membership on In-Page URL Drift"
mode: backend
createdAt: "2026-07-01T14:32:20Z"
source: manual
---

## Summary

A Google Doc saved in the "Ambiguity Everywhere" group keeps getting dropped
because group membership is keyed by the full URL **including the query
string**. `getUrlKey` (`service_worker.js:653`) only strips the `#` fragment,
so the doc was recorded in `label.urlKeys` as
`url-…/edit?tab=t.whli3qfeqr1i`. Google Docs then rewrites `?tab=t.…` in-page
via the History API, so the tab's *live* key drifts away from the *recorded*
key. Recorded key ≠ live key, so the exact-key eject/reconciliation paths
conclude the URL is no longer a member and ungroup it. The prior fix
(`183fc5c`, "Keep Tabs in Groups Through In-Page URL Changes") only gated the
**synchronous `onUpdated` eject** and, by explicit decision, left `getUrlKey`
and the stored membership untouched — so the drift persists and the *other*
paths (the auto-grouped eject in `groupTabs`, `handleActiveTabsGroupChanges`,
and post–service-worker-restart reconciliation) still drop the doc. This plan
does two things: (1) **heals the drift** — when the `onUpdated` handler sees an
in-page URL change on a grouped tab, it rewrites the label's stale `urlKey` to
the live one so every downstream exact-key comparison keeps matching; and (2)
adds **durable, runtime-toggleable grouping diagnostics** — a persisted ring
buffer that survives MV3 service-worker restarts — so the exact eject path is
observable if this ever regresses.

## Key Decisions

- **Heal on drift, not re-key membership.** Keep `getUrlKey` and exact-key
  membership exactly as-is everywhere (Search, Favorites, `allUrls`, visit
  counts all depend on the query being part of the key). Instead, on a
  detected in-page change we rewrite the *one* drifted entry in the group's
  `label.urlKeys` to follow the live URL. This is surgical, needs no storage
  migration, and can't conflate distinct query URLs elsewhere. We rejected
  normalizing stored keys (touches `getUrlKey`, risks conflating distinct
  searches) and rejected switching the eject comparison to `samePageKey`
  (would change membership semantics globally).
- **Locate the drifted entry by page identity, compare membership by exact
  key.** To heal we must find *which* stored key is the drifted doc. Use
  `samePageKey` only to **locate** the member of the group whose page identity
  matches the live URL, then set that slot to the live `urlKey`. The
  eject/match paths still compare exact keys — `samePageKey` never becomes the
  membership test, staying true to the heal-on-drift decision. This also
  covers the case where the recorded key is a *third* `?tab=` variant, not
  literally the immediately-previous one.
- **Heal reuses the existing `onUpdated` in-page branch.** The prior fix
  already computes `isNavigation` at `service_worker.js:119`. The
  `!isNavigation && tab.groupId > -1` case is exactly "in-page change on a
  grouped tab" — the precise moment to heal. No new listener, no new timer.
- **Diagnostics must survive service-worker death.** MV3 kills the worker
  constantly, so `console.log` and the compile-time `DEBUG_GROUPING = false`
  (`:28`) are useless for a bug that manifests across restarts. Persist
  breadcrumbs to a capped ring buffer in `chrome.storage.local` so the last N
  grouping decisions can be inspected after the fact, and gate it on a
  runtime storage flag (not a source-edit-and-reload constant).
- **No auto-heal of the already-dropped doc.** Per the earlier plan's
  precedent, the user re-adds the doc once; this change keeps it from
  drifting out again. We do not rewrite historical `label.urlKeys`.

## Implementation

### 1. Heal the drifted label entry on an in-page URL change

**File**: `service_worker.js` (the `chrome.tabs.onUpdated` listener, the
`if (changeInfo.url)` → `if (oldTabUrl)` block, `:109-128`)

Today the block ejects only on a real navigation:

```js
const oldUrl = oldTabUrl.urlKey.replace(/^url-/, '');
const isNavigation = samePageKey(oldUrl) !== samePageKey(changeInfo.url);

if (tab.groupId > -1 && isNavigation) {
  pendingUngroups.add(tab.id);
  chrome.tabs.ungroup(tab.id, () => { … });
}
```

Add the mirror case: **grouped tab + in-page change ⇒ heal**. When
`tab.groupId > -1 && !isNavigation`:

1. Resolve the group's label title. Prefer the in-memory `groups[tab.groupId]`
   map (populated by `trackGroup`), and when it's cold — the common case right
   after a service-worker restart — fall back to
   `await getTabGroup(tab.groupId)` and read its `.title`. Mirror the lookup
   already used by the `changeInfo.groupId === -1` branch at `:149-151`.
2. Load the label (`labels[title]`; the module-scope `labels` is kept in sync
   from storage at `:694`/`:705`). If no label, nothing to heal — stop.
3. Compute `newUrlKey = getUrlKey(changeInfo.url)`. Find the drifted slot:
   `idx = label.urlKeys.findIndex(k => samePageKey(k.replace(/^url-/, '')) === samePageKey(changeInfo.url))`.
   (Reuse the same `url-` strip the eject path already uses.)
4. If `idx > -1` and `label.urlKeys[idx] !== newUrlKey`:
   - If `newUrlKey` is already present elsewhere in `label.urlKeys`, just
     remove the stale slot (`splice(idx, 1)`) to avoid a duplicate; otherwise
     set `label.urlKeys[idx] = newUrlKey`.
   - Persist via the same `updates`/`labels` write the surrounding branch
     already performs (fold `labels` into the `updates` object, consistent
     with `:160-164`), so a single storage write carries the heal.
   - Emit a `debugGroup('onUpdated: heal drifted label urlKey', { tabId, oldUrlKey: label-slot, newUrlKey, label: title, groupId: tab.groupId })`
     breadcrumb (see step 3).

Leave `closeUrl`, the `newUrl` bookkeeping, and the navigation-eject path
exactly as-is. The heal is additive and only fires on the in-page branch that
previously did nothing for grouped tabs.

### 2. Add a breadcrumb at the navigation eject site

**File**: `service_worker.js` (`:121-127`)

The navigation eject currently calls `chrome.tabs.ungroup` with **no**
`debugGroup` call, so a real-navigation drop is invisible. Add
`debugGroup('onUpdated: eject grouped tab (navigation)', { tabId: tab.id, oldUrl, newUrl: changeInfo.url, groupId: tab.groupId })`
just before `pendingUngroups.add(...)`. This makes every ungroup decision in
the worker traceable, which is the whole point of the logging half.

### 3. Make `debugGroup` durable and runtime-toggleable

**New file**: `src/lib/utils/groupingLog.js`

A tiny, unit-testable ring-buffer helper the worker can import, matching the
existing `src/lib/utils/` pattern (like `samePageKey`). Export
`appendGroupingLog(store, entry, cap = 200)` that takes the current array,
appends `entry`, and returns the array trimmed to the last `cap` items (pure,
no I/O — so it's trivially testable without mocking `chrome`).

**File**: `service_worker.js` (`:28-32`, the `DEBUG_GROUPING` / `debugGroup`
definitions)

Rework `debugGroup(event, details)` so that, in addition to the existing
(now-optional) `console.log`, it persists the breadcrumb:

- Read a runtime flag from `chrome.storage.local` (`debugGrouping`, default
  off) instead of relying solely on the compile-time `DEBUG_GROUPING`
  constant. Keep the constant as an OR fallback so existing behavior is a
  superset (`if (!DEBUG_GROUPING && !flag) return;`).
- When enabled, read `groupingLog` from `chrome.storage.local`, call
  `appendGroupingLog(existing, { t: Date.now(), event, details })`, and write
  it back. Cap at 200 entries so it can't grow unbounded. Fire-and-forget
  (don't block the caller); tolerate the async storage round-trip since every
  `debugGroup` call site is already inside an async context or a
  fire-and-forget path.

This gives a persisted, post-hoc-inspectable trail — read
`chrome.storage.local.get('groupingLog')` in the extension's service-worker
devtools console — that survives the worker being killed between the drift and
the eject. Toggle it on with
`chrome.storage.local.set({ debugGrouping: true })`; no reload or source edit
needed. (A user-facing settings toggle is intentionally **out of scope** — the
storage flag is enough to diagnose in the wild.)

### 4. Tests

**New file**: `src/lib/utils/groupingLog.test.js`

Unit tests for `appendGroupingLog`: appends in order; trims to `cap`, keeping
the most-recent `cap` entries; treats a missing/empty store as `[]`; does not
mutate the input array (returns a new array).

**File**: `service_worker.test.js` (near the existing ungroup/eject and
membership-splice tests, `:480-735`)

- **Regression test (the reported bug):** a grouped tab (`groupId > -1`) whose
  URL changes only in the query string (Google Docs `?tab=t.A` → `?tab=t.B`),
  where `label.urlKeys` holds the `?tab=t.A` key, results in
  `label.urlKeys` now holding the `?tab=t.B` key and the tab **not** ungrouped.
  This is the drift-heal that was missing.
- **Third-variant heal:** `label.urlKeys` holds `?tab=t.A`, the live change is
  to `?tab=t.C` (neither the immediately-previous nor the base) — the stale
  slot is still located by page identity and rewritten to `?tab=t.C`.
- **No duplicate:** if `label.urlKeys` already contains both the stale and the
  new key, healing removes the stale one and does not duplicate the new one.
- **Navigation still ejects and no false heal:** a grouped tab navigated to a
  different path/origin is still ungrouped and the label is not rewritten
  (guard the heal behind `!isNavigation`).
- **Cold `groups` map fallback:** when `groups[tab.groupId]` is undefined (SW
  just restarted), the heal still resolves the label via `getTabGroup` and
  rewrites the key.

## Reused existing code

- `samePageKey` from `src/lib/utils/samePageKey.js` (glossary entry:
  `samePageKey`) — reused to **locate** the drifted member by page identity;
  its origin+pathname reduction already handles the Google Docs `?tab=` case.
- `getUrlKey` from `service_worker.js` (glossary entry: `getUrlKey`) — left
  unchanged; used to compute the live `newUrlKey` to write into the label.
- `getTabGroup` from `service_worker.js` (`:729`) — the cold-`groups`-map
  fallback for resolving a group's title after a worker restart.
- `debugGroup` from `service_worker.js` (glossary entry: `debugGroup`) —
  upgraded in place from a compile-time console logger to a durable,
  runtime-gated ring-buffer writer; existing call sites keep working.
- `urlKeyIsMember` / `ejectAutoGroupedTab` / `recordInGroupTab` from
  `service_worker.js` (glossary entries: `urlKeyIsMember`,
  `ejectAutoGroupedTab`, `recordInGroupTab`) — the exact-key eject/record
  machinery whose false mismatches the heal eliminates; unchanged, referenced
  to explain why healing the stored key fixes them all at once.
- `closeUrl` / `newUrl` from `service_worker.js` (glossary entries: `closeUrl`,
  `newUrl`) — the URL/visit tracking that continues to run unchanged in the
  `onUpdated` branch.
- `update` / `getLocalStorage` from `service_worker.js` (`:373`, `:743`) — the
  storage write/read helpers the heal and the ring buffer use.

## Scenarios to Demonstrate

- **The reported bug, fixed at the root.** A Google Doc in the "Ambiguity
  Everywhere" group recorded under `?tab=t.whli3qfeqr1i`; interacting with the
  doc churns the query to a new `?tab=`. The label's stored key follows the
  live URL, so the doc stays grouped across reconciliation and across a
  service-worker restart.
- **Auto-grouped eject no longer misfires.** A doc that Chrome auto-inherited
  into the group (open-from-group / session restore, flagged in
  `autoGroupedTabs`) is no longer ejected by `groupTabs`, because the healed
  key now matches `urlKeyIsMember`.
- **Real navigation still ejects.** A grouped tab navigated from `/a` to `/b`
  (different path) is still removed from the group — heal only fires on an
  in-page change.
- **Diagnostics captured across a restart.** With `debugGrouping` enabled, the
  `groupingLog` ring buffer in `chrome.storage.local` shows the heal and any
  eject decisions with `{ tabId, urlKey, label, groupId }`, still present after
  the service worker is killed and restarted.
- **Ring buffer stays bounded.** After more than 200 grouping events, only the
  most-recent 200 entries remain in `groupingLog`.
