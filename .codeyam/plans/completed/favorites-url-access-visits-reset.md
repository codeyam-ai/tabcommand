---
title: "Favorites: Show URL, Count Tab Access, and Reset Tracking"
mode: ui
createdAt: "2026-07-03T00:00:00Z"
source: manual
---

## Summary

Three related improvements to the Favorites experience. (1) On the Favorites
View All page, each row currently shows a clickable **globe icon** to open the
site — replace it with the site's **actual URL**, shown as text and clickable to
open/focus the tab. (2) Make favorites ranking reward tabs you keep open and
return to: record a visit when a tab is **accessed** (activated), not only when
it is opened/navigated — throttled to at most once per ~30 min per site so rapid
alt-tabbing can't inflate a rank. (3) Add a **"Reset favorites tracking"** button
to the Favorites page that clears the visit signal (per-site `visits` /
`visitCount`) and the `favoritesHidden` list so the favorites list starts over,
guarded by an inline **confirmation button** before it executes. The reset keeps
History & Search intact (their sites, titles, favicons, and closed-tab history
are untouched).

## Key Decisions

- **Show the URL as the open control** — the globe button is replaced by the
  URL text itself. Clicking the URL opens/focuses the tab (same `onOpen`
  behavior the globe had), so no affordance is lost. Full URL kept in the
  `title` tooltip; the visible URL is CSS-truncated so long URLs don't break
  the row layout.
- **Access counts as a visit, throttled ~30 min** (user-selected). A "visit" is
  currently only recorded by `newUrl` on tab open / navigation. We add a
  throttled access path in the `onActivated` handler so a tab you switch back to
  earns credit, but re-activating the same site within ~30 min does not append a
  second visit. The throttle also neatly avoids double-counting the
  open-then-immediately-activate sequence a brand-new tab produces.
- **Reset clears the favorites signal + hidden only** (user-selected), not all
  history. It zeroes `visits` and `visitCount` on every `url-*` record and sets
  `favoritesHidden: []`. Because `url-*` records are shared with History &
  Search, we rewrite each record in place (preserving `title`, `favicon`, `url`,
  and every other field) rather than deleting it — so only the ranking signal is
  reset. With empty visits every site falls below `QUALIFY_MIN`, so the
  Favorites sidebar and View All page go empty, i.e. a true "start over".
- **Inline two-step confirmation, not `window.confirm`.** The request asks for a
  confirmation *button*. Rather than the native `confirm()` used elsewhere in the
  app, the button reveals an inline "Yes, reset everything" / "Cancel" pair
  (component state), so the destructive action always takes a deliberate second
  click.

## Implementation

### 1. Show the URL instead of the globe icon

**File**: `src/lib/components/FavoriteRow/FavoriteRow.jsx`

In the `FavoriteRow-titleRow`, replace the globe `<button className="FavoriteRow-open">`
(currently rendering `<Icon name="globe" size={13} />`) with a button whose
visible content is `favorite.url`, e.g. `className="FavoriteRow-url"`. Keep the
existing click handler wiring exactly: `onClick={(e) => { e.stopPropagation();
onOpen(e, favorite); }}` (so clicking the URL opens/focuses the tab and does not
toggle the row's expand), keep `aria-label={`Open ${favorite.title ||
favorite.url}`}` and `title={`Open ${favorite.url}`}`. Update the component's
doc comment (lines ~17–24 and the block describing "An explicit open link
beside the title") to describe the URL text as the open control instead of the
globe. The `Icon` import stays (still used for the caret and the "Bring back"
restore icon); `globe` is simply no longer referenced here.

**File**: `src/lib/components/FavoriteRow/FavoriteRow.css`

Add a `.FavoriteRow-url` rule: link-styled (subtle/muted color, hover
underline/accent), single-line with `overflow: hidden; text-overflow: ellipsis;
white-space: nowrap;` and a sensible `max-width` so long URLs truncate instead
of pushing the sparkline. Repurpose or remove the old `.FavoriteRow-open`
(globe-button) styles.

### 2. Count tab access as a throttled visit

**File**: `service_worker.js`

- Add an access-throttle constant near the visit tunables (`VISIT_RETENTION_MS`
  / `MAX_VISITS`, ~line 92): `const ACCESS_THROTTLE_MS = 1000 * 60 * 30;` with a
  comment explaining it debounces access-driven visits so alt-tabbing and the
  open→activate sequence don't inflate a rank.
- Add a `recordAccess(tabId)` helper. It resolves the activated tab
  (`chrome.tabs.get`), bails on `chrome.runtime.lastError` / missing tab /
  non-trackable URL (`isTrackableUrl`), then reads the existing `url-<key>`
  record (`getUrlKey(tab.url)`), computes `lastVisit = max(record.visits || [])`
  (0 if none), and — only if `now - lastVisit >= ACCESS_THROTTLE_MS` — delegates
  to the existing `newUrl(tab.id, tab.url)` so the record write, `allUrls`
  maintenance, pruning, and `visitCount` bump all reuse the one code path.
  Returns the `newUrl` updates object (or `undefined` when throttled/ineligible).
- Wire it into the existing `onActivated` listener (line ~277), keeping the
  current `updateActiveTabs()` call:
  ```js
  chrome.tabs.onActivated.addListener(async (tabInfo) => {
    updateActiveTabs();
    const updates = await recordAccess(tabInfo.tabId);
    if (updates) update(updates);
  });
  ```
- Export `recordAccess` in the test harness's returned `fns` block (the
  `;return { fns: { ... } }` list at the bottom of `service_worker.js`, alongside
  `newUrl`, `pruneVisits`, etc.) so it is unit-testable.

**File**: `service_worker.test.js`

Add tests under a `recordAccess` describe: (a) records a visit (delegates to
`newUrl`) when the site's last visit is older than `ACCESS_THROTTLE_MS`;
(b) records **nothing** when the last visit is within the throttle window;
(c) ignores non-trackable / missing tabs. Use the existing `makeChrome()` /
`loadWorker()` harness and stub `chrome.tabs.get` + `chrome.storage.local.get`.

### 3. "Reset favorites tracking" button with inline confirmation

**File**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.jsx`

- Add `confirmingReset` component state (`useState(false)`).
- Render a reset control in the page header area (near the `Page-intro`): a
  "Reset favorites tracking" button. When `confirmingReset` is false it shows the
  single button; when true it shows an explanatory line plus a
  "Yes, reset everything" (destructive) button and a "Cancel" button. Clicking
  the first button sets `confirmingReset` true; Cancel sets it false; confirm
  runs `resetFavorites()` then sets it false.
- `resetFavorites()`:
  ```js
  Chrome.get('ViewAllFavoritesReset0', 'allUrls', ({ allUrls }) => {
    const keys = allUrls || [];
    const finish = (updates) => {
      chrome.storage.local.set({ ...updates, favoritesHidden: [] });
    };
    if (keys.length === 0) return finish({});
    Chrome.get('ViewAllFavoritesReset1', keys, (records) => {
      const updates = {};
      for (const key of keys) {
        const rec = records[key];
        if (!rec) continue;               // key with no record — nothing to clear
        updates[key] = { ...rec, visits: [], visitCount: 0 };
      }
      finish(updates);
    });
  });
  ```
  Setting `visits: []` **and** `visitCount: 0` prevents `rankFavorites` from
  lazily re-seeding visits from a legacy `visitCount`. The existing
  `chrome.storage.onChanged` listener already reloads on `allUrls` / `url-*` /
  `favoritesHidden` changes, so the list empties reactively — no extra reload
  wiring needed. Preserving every other field on each record keeps History &
  Search unaffected.

**File**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.css`

Style the reset button and its inline confirm state — a quiet default button
that reads as secondary/utility, and a clearly destructive-styled "Yes, reset
everything" button so the second click looks intentional.

**File**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.test.jsx`

Add tests: (a) clicking "Reset favorites tracking" reveals the confirm buttons
and does **not** yet write storage; (b) confirming writes every `url-*` record
back with `visits: []` / `visitCount: 0` and sets `favoritesHidden: []`, while
preserving `title`/`favicon`; (c) Cancel dismisses the confirm without writing.

## Reused existing code

- `newUrl` from `service_worker.js` — the single visit-recording path
  (`allUrls` maintenance + `visits`/`visitCount` write + prune); `recordAccess`
  delegates to it so access-visits and open-visits stay identical in shape.
- `getUrlKey`, `isTrackableUrl`, `pruneVisits` from `service_worker.js` — URL
  keying and trackability gating reused by the access throttle.
- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — the `QUALIFY_MIN` gate is what makes reset "just work":
  emptied visits drop every site from the list. Its `visitsFor` seed-from-count
  behavior is why reset must also zero `visitCount`.
- `FavoriteRow` (glossary entry: `FavoriteRow`) and `ViewAllFavorites` (glossary
  entry: `ViewAllFavorites`) — the row and page being edited; `onOpen` /
  `openFavorite` wiring is reused verbatim for the new URL open control.
- `Chrome` from `src/lib/utils/Chrome/Chrome.js` — `get` / `set` storage
  abstraction used for the reset read/write.
- `makeChrome` / `loadWorker` harness in `service_worker.test.js` — reused to
  unit-test `recordAccess`.

## Scenarios to Demonstrate

- **Favorites row shows its URL** — a populated row renders `favorite.url` as
  text in place of the globe, clicking it opens/focuses the tab.
- **Long URL truncates** — a favorite with a very long URL truncates with an
  ellipsis and keeps the sparkline aligned (full URL in the tooltip).
- **Open-cued row** — a favorite currently open in a tab still shows the open
  accent alongside its URL.
- **Hidden favorite** — a dimmed hidden row shows its URL and the "Bring back"
  action together.
- **Access bumps a kept-open favorite** — switching back to a long-open tab
  after >30 min adds a visit and nudges its rank/sparkline up.
- **Throttle holds** — rapidly re-activating the same tab within 30 min does not
  add extra visits.
- **Reset — confirm step** — clicking "Reset favorites tracking" reveals the
  "Yes, reset everything" / "Cancel" pair and changes nothing until confirmed.
- **Reset — executed** — after confirming, the Favorites list (including hidden
  rows) is empty and starting over, while the History page still lists the same
  sites.
- **Reset — empty state** — resetting with no favorites yet is a harmless no-op.
