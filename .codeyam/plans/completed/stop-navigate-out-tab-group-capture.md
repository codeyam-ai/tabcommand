---
title: "Stop Navigate-Out Tab-Group Capture"
mode: ui
createdAt: "2026-06-28T18:28:46Z"
source: manual
---

## Summary

URLs are being added to tab-group labels that the user never put there — often
pages they navigated to *today*. Root cause: when a tab that is parked in a
named group navigates to a new URL, the service worker tries to ungroup it, but
`chrome.tabs.ungroup` is async. In the same `onUpdated` turn, `newUrl(...)` runs
`updateActiveTabs()`, which writes an `activeTabs` entry built from the live tab —
carrying the **new URL** but the **stale old groupId** (the ungroup hasn't landed
yet). That storage write triggers `groupTabs()`, which sees a tab "in" the old
group and **permanently pushes the new URL into that group's label**. The
existing removal path (`changeInfo.groupId === -1`) is racy and uses a
non-normalized key, so it frequently fails to undo the bad add. This plan closes
the capture window so a tab on its way *out* of a group is never recorded into
it, and makes the removal path's key matching reliable.

## Key Decisions

- **Suppress capture during a pending ungroup rather than reorder the async
  work.** Reordering `onUpdated` (awaiting `ungroup` before `newUrl`) wouldn't
  help: `groupTabs` also runs from the independent `chrome.storage.onChanged`
  listener, so the only robust guard is to make `groupTabs`/the group-change
  handler refuse to capture a tab whose ungroup is in flight. We track pending
  ungroups in an in-memory `Set` of tab ids in the worker.
- **Also guard on URL/group consistency as a backstop.** Even setting the race
  aside, a capture should only happen when the tab's stored URL is the one that
  actually belongs in that group. We additionally skip capture when the tab's
  navigation just changed its URL in the same cycle (the `closeUrl` /
  `oldTabUrl` signal already present in `onUpdated`). The pending-ungroup Set is
  the primary fix; this is defense in depth.
- **Normalize the removal-path key to `getUrlKey(tab.url)`.** The
  `changeInfo.groupId === -1` cleanup currently builds `url-${tab.url}` inline,
  which does NOT strip the `#fragment` the way `getUrlKey` does, so cleanup
  silently misses any hashed URL. Switching to `getUrlKey(tab.url)` makes
  removal match what `groupTabs` actually stored. This is a small, isolated
  correctness fix worth doing regardless of the race.
- **Keep the passive sync behavior for genuinely-grouped tabs.** We do NOT
  remove `groupTabs`'s ability to record URLs for tabs that truly sit in a
  group — that's the intended Chrome-group ↔ label sync. We only stop it from
  recording tabs that are mid-exit.

## Implementation

### 1. Track in-flight ungroups

**File**: `service_worker.js`

Add a module-level `const pendingUngroups = new Set();` near the existing
`let removing;` worker state (top of file, ~line 5).

In the `onUpdated` handler, where a navigated grouped tab is ungrouped
(currently `service_worker.js:78-80`):

```js
if (tab.groupId > -1) {
  pendingUngroups.add(tab.id);
  chrome.tabs.ungroup(tab.id, () => {
    void (chrome.runtime && chrome.runtime.lastError);
    pendingUngroups.delete(tab.id);
  });
}
```

Use the ungroup callback to clear the flag once Chrome has actually applied the
change (mirrors the swallow-lastError pattern already used in `autoCloseSweep`).
If `chrome.tabs.ungroup` in the test stub doesn't invoke a callback, clear the
flag defensively (see test note below) — but prefer the callback form so the
window is exactly the async gap.

### 2. Refuse to capture a tab whose ungroup is pending

**File**: `service_worker.js`

In `groupTabs()` (the grouped branch at `service_worker.js:783-808`), before the
label push, skip tabs that are mid-ungroup:

```js
if (pendingUngroups.has(parseTabId(activeTab))) continue;
```

Place it right after the `if (!group || group.title === "~~~ CLOSING ~~~") continue;`
guard so a tab leaving a group is never recorded into it. `parseTabId` already
exists (`service_worker.js:667`) and turns `tab-<id>` into the integer id.

Apply the same guard in `handleActiveTabsGroupChanges()` (the add path around
`service_worker.js:702-709`): if the tab's id is in `pendingUngroups`, skip the
`labels[newGroup.title].urlKeys.push(...)`.

### 3. Normalize the removal-path key

**File**: `service_worker.js`

In the `changeInfo.groupId === -1` branch (`service_worker.js:106`), replace the
inline key with the normalized helper so cleanup matches stored keys:

```js
const urlKeyIndex = label.urlKeys.indexOf(getUrlKey(tab.url));
```

`getUrlKey` is defined at `service_worker.js:583`. This fixes silent cleanup
misses for any URL containing a `#fragment`.

### 4. Harden the add path against a missing label (latent throw)

**File**: `service_worker.js`

While in `handleActiveTabsGroupChanges()` (`service_worker.js:702-717`): the
current code computes `const label = labels[newGroup.title] || { urlKeys: [] }`
but then pushes to `labels[newGroup.title].urlKeys`, which throws if that label
doesn't exist yet. Seed it before pushing:

```js
if (newGroup) {
  labels[newGroup.title] ||= { title: newGroup.title, urlKeys: [], color: mapColors(newGroup.color) };
  const label = labels[newGroup.title];
  if (label.urlKeys.indexOf(newTab.urlKey) === -1 && !pendingUngroups.has(parseTabId(newTab))) {
    label.urlKeys.push(newTab.urlKey);
    changed = true;
  }
}
```

Note `mapColors` is currently a local inside `groupTabs`; if reused here, lift it
to a module-level helper or inline the color (the editor workflow can decide the
cleanest factoring — the requirement is just "don't throw when the label is
absent"). Guard the `oldGroup` removal at `service_worker.js:711-717` the same
way (skip if `labels[oldGroup.title]` is undefined).

### 5. Tests

**File**: `service_worker.test.js`

Add cases under the existing `groupTabs` and `handleActiveTabsGroupChanges`
describe blocks (`service_worker.test.js:401,411`):

- **Navigate-out is not captured**: simulate a tab whose id is in
  `pendingUngroups`, with `activeTab.groupId` still pointing at a real group;
  assert `groupTabs` does NOT push its urlKey into `labels[title].urlKeys`.
- **Genuinely-grouped tab is still captured**: same setup but id NOT pending;
  assert the urlKey IS added (guards against over-suppressing).
- **Removal matches normalized key**: a label holding `getUrlKey(url)` for a
  URL with a `#fragment`; drive the `groupId === -1` path and assert the key is
  removed (would fail before the `getUrlKey` change).
- **Add path tolerates a missing label**: `handleActiveTabsGroupChanges` with a
  `newGroup.title` absent from `labels`; assert it seeds the label and does not
  throw.

The test harness strips imports and evaluates the worker source, exposing
internals via `fns` (`service_worker.test.js:64-74`). If `pendingUngroups` needs
to be reachable from tests, expose it the same way the other internals are
surfaced, or drive it through the public `onUpdated` listener so the Set is
populated naturally. The `chrome.tabs.ungroup` stub may need to invoke its
callback so the pending flag clears — extend the existing chrome mock
accordingly.

## Reused existing code

- `getUrlKey` from `service_worker.js` (glossary entry: `getUrlKey`) — normalize
  removal keys to match stored ones.
- `parseTabId` from `service_worker.js:667` — derive integer tab id from a
  `tab-<id>` key for the `pendingUngroups` lookup.
- `groupTabs` from `service_worker.js` (glossary entry: `groupTabs`) — the
  passive group→label sync we are guarding.
- `handleActiveTabsGroupChanges` from `service_worker.js` (glossary entry:
  `handleActiveTabsGroupChanges`) — the groupId-change add/remove path.
- `getTabGroup` / `trackGroup` from `service_worker.js` (glossary entries:
  `getTabGroup`, `trackGroup`) — group-title resolution used by the capture
  paths.
- The swallow-`lastError` callback pattern from `autoCloseSweep`
  (`service_worker.js:295-298`) — reuse for the `ungroup` callback.

## Scenarios to Demonstrate

- **Happy path — navigate out of a group**: a tab in group "Work" navigates from
  `a.com` to `b.com`; `b.com` does NOT appear in the "Work" label, and the tab
  is ungrouped. (The bug: `b.com` gets captured into "Work".)
- **Genuine grouping still works**: a tab that actually belongs to group "Work"
  has its URL recorded into the "Work" label as before (no regression in the
  intended sync).
- **Hashed-URL cleanup**: a URL like `docs.com/page#section` that was captured
  into a label is correctly removed when the tab leaves the group (previously
  the fragment mismatch left it stranded).
- **Missing-label add path**: a tab moves into a group whose title has no
  existing label; the label is seeded and the URL added without throwing.
- **Empty state**: no groups / no labels — `groupTabs` and the change handler
  run without error and add nothing.
- **Edge — rapid re-navigation**: a grouped tab navigates twice in quick
  succession; neither destination URL is captured into the old group.
