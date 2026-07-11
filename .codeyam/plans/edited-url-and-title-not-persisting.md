---
title: "Edited URL and title not persisting"
mode: ui
createdAt: "2026-07-11T00:20:47Z"
source: manual
---

## Summary

When you edit a saved URL entry (in the URL Details page), two things go wrong:
its **URL edit is ignored on click** — the details page shows the new URL, but
clicking the item still opens the *original* URL — and its **title (and favicon)
edit reverts** shortly after saving. Both stem from the same design fact: every
record is keyed by the URL itself (`getUrlKey(url)` → `url-<original-url>`), and
that key — not the record's fields — is what the row uses to open a tab, while
the background tab tracker continuously rewrites the record's `title`/`favicon`
from the live tab on that same key. The fix makes a URL edit **re-key the
record** (delete the old key, add the record under the new URL's key — "akin to
deleting the first url and adding the new one") and makes any edit **pin** the
record so the background tracker stops overwriting the user's title and favicon.

## Key Decisions

- **Editing the URL re-keys the record (delete-old, add-new).** Per the user:
  an edited URL should make the item *be* the new URL, exactly as if the old URL
  were deleted and the new one added. Rather than storing a separate `url` field
  that navigation ignores, `handleSubmit` writes the record under
  `getUrlKey(newUrl)`, removes the old `url-<old>` key, and migrates the two
  reference lists that point at it: `allUrls` (position preserved) and every
  `labels[*].urlKeys` group membership. This automatically fixes "click opens
  the original" because `Url.jsx` derives the open target from the key, which is
  now the new URL. It also satisfies the chosen behavior "clicking always opens
  the edited URL, even over a live tab": the new key no longer matches the still-
  open original tab, so the click falls through to `chrome.tabs.create` with the
  new URL. Considered but rejected: keeping the old key and teaching `Url.jsx` to
  read a stored `url` field — smaller, but it leaves a permanent mismatch between
  a record's identity and its URL and contradicts the "delete-old, add-new"
  model the user asked for.
- **Any edit pins `title` + `favicon` against the background tracker.** The
  title reverts because `urlUpdates` (service_worker.js:760-762) reassigns
  `url.title`/`url.favicon` from the live tab on every tracking tick for any
  matching open tab. Saving in UrlDetails now stamps the record with
  `edited: true`, and `urlUpdates` skips the title/favicon reassignment when that
  flag is set. Chosen "pin title + favicon" (single flag, most predictable — "I
  curated this, leave it alone") over "pin title only". This is needed *in
  addition to* re-keying, because the title can be edited on an entry whose URL
  is unchanged but whose tab is still open — the re-key path alone wouldn't help
  there.
- **The `edited` flag survives later tracker writes.** `newUrl`
  (service_worker.js:522-527) and `tabUpdates`/`urlUpdates` all spread the
  existing record, so `edited: true` persists through visit-count bumps and
  process sampling. It is only reset if the user later clears the entry.
- **Live tabs are an accepted edge case.** If you edit the URL of a currently-
  open tab, the old key is removed but the still-open tab will cause
  `updateActiveTabs`/`newUrl` to re-add the original URL on the next tick (the
  tab genuinely still exists). The primary scenario — editing history/Favorites
  entries whose tabs are closed — migrates cleanly. Note this in scenarios; do
  not attempt to force-close the live tab.

## Implementation

### 1. Add pure key + label-migration helpers

**File**: `src/lib/utils/urlDetails.js`

Add two pure, storage-free helpers so the re-key logic is unit-testable and
mirrors the service worker's canonical keying:

- `getUrlKey(url)` → `` `url-${String(url).split('#')[0]}` `` — the UI-side twin
  of `service_worker.js`'s `getUrlKey` (line 789). The UI currently has no
  exported keying helper; `normalizeUrl.js`'s header already documents that
  records are keyed as `url-<url-without-#hash>`, so this codifies that rule in
  one reusable place.
- `reassignUrlKeyInLabels(labels, oldUrlKey, newUrlKey)` → returns a new `labels`
  map where every label whose `urlKeys` contains `oldUrlKey` has it replaced by
  `newUrlKey` (in place, position preserved), de-duplicating if `newUrlKey` is
  already present (splice out the old rather than create a duplicate). Do not
  mutate the input — return fresh `urlKeys` arrays for touched labels, matching
  the existing `removeUrlFromLabel` style. This mirrors the drift-healing logic
  already in `service_worker.js:204-222`.

### 2. Re-key the record when the URL changes on save

**File**: `src/lib/pages/UrlDetails/UrlDetails.jsx`

Rework `handleSubmit` (lines 57-67) so that when the edited `url` maps to a
different key than the current `urlKey`, the record migrates instead of being
rewritten in place:

- Compute `newUrlKey = getUrlKey(url)`.
- **Unchanged key** (`newUrlKey === urlKey`, i.e. URL not changed or only its
  `#fragment` changed): keep today's behavior — write
  `{ [urlKey]: buildUrlInfo({ title, url, favicon, notes }), labels }` — but with
  the `edited` flag from change 4.
- **Changed key**: read `allUrls` (via `Chrome.get`), then in the `Chrome.set`
  write:
  - Store the record under `newUrlKey` (from `buildUrlInfo`, carrying the new
    `url` value and `edited: true`).
  - Update `allUrls`: replace the `urlKey` entry with `newUrlKey` at the same
    index (if `newUrlKey` already exists, just remove the old entry so there's no
    duplicate).
  - Update `labels` with `reassignUrlKeyInLabels(labels, urlKey, newUrlKey)` so
    group memberships follow the record.
  - `Chrome.set` all of the above, then `Chrome.remove('UrlDetails1', urlKey)` to
    drop the stale `url-<old>` key.
- Then `goHome()` as today.

Keep the write inside the existing single-callback flow; `Chrome.get`/`set`/
`remove` are the established storage surface here.

### 3. Reflect the pinned/edited URL nowhere else is needed in `Url.jsx`

**File**: `src/lib/components/Url/Url.jsx`

No navigation change is required once re-keying lands — `url()` (line 27),
`handleClick` (lines 130-140), `displayUrl`, and the subtitle already derive from
`urlKey`, which after a URL edit *is* the new URL. Confirm during implementation
that a re-keyed row (new `urlKey` prop from the refreshed `allUrls`) renders and
opens the new URL, and that the old row disappears. If the Home list keys rows by
`urlKey`, the migration in change 2 already makes the old row vanish and a new one
appear. **Do not** add a stored-`url`-field read path here — the key is the
source of truth.

### 4. Pin title + favicon on any edit; honor the flag in the tracker

**File**: `src/lib/utils/urlDetails.js`

In `buildUrlInfo` (persisted-record builder), add `edited: true` to the returned
object so every save marks the record as user-curated. `notes` stays
conditional as today.

**File**: `service_worker.js`

In `urlUpdates` (lines 748-787), guard the two live-tab reassignments with the
flag:

- Line 760: `if (!url.edited && tab.status !== "loading" && tab.title && tab.title.length > 0) url.title = tab.title;`
- Line 762: `if (!url.edited && tab.favIconUrl) url.favicon = tab.favIconUrl;`

Leave the `if (!url.title || !url.title.length) url.title = url.url;` fallback
(line 761), `groupId` (line 763), and all process sampling untouched — those are
not user-editable fields. Because `urlUpdates`/`tabUpdates`/`newUrl` spread the
existing record, `edited` persists across subsequent ticks.

## Reused existing code

- `getUrlKey` from `service_worker.js` (line 789) — the canonical
  `url-<url-without-#hash>` keying rule the new UI-side `getUrlKey` mirrors.
- `removeUrlFromLabel` from `src/lib/utils/urlDetails.js` — style/immutability
  template for the new `reassignUrlKeyInLabels`.
- The label drift-healing block in `service_worker.js:204-222` — reference
  implementation for replacing an old `urlKey` with a new one inside a label's
  `urlKeys`.
- `buildUrlInfo`, `deriveUrlLabels` from `src/lib/utils/urlDetails.js` — the
  existing persisted-record and derived-label helpers this plan extends.
- `Chrome.get` / `Chrome.set` / `Chrome.remove` from
  `src/lib/utils/Chrome/Chrome.js` — the storage surface for the migration.

## Reproduction Test

Two independent red-first tests, one per bug. Each lives in the real test file
whose stack matches the code under test.

**Target A** (URL edit must re-key): `src/lib/pages/UrlDetails/UrlDetails.test.jsx`
— run with `codeyam-editor editor refresh-tests --test "UrlDetails › editing the url migrates the record to the new key"`.

```jsx
// editing the url re-keys the record: the new url-key holds the record and the old key is gone
it('editing the url migrates the record to the new key', async () => {
  seedUrl({ notes: '' });                       // seeds url-https://github.com/codeyam/tabcommand
  seedLabels({ Work: { title: 'Work', urlKeys: [urlKey] } });
  window.localStorage.setItem('allUrls', JSON.stringify([urlKey]));
  installChromeShim();
  render(<UrlDetails urlKey={urlKey} />);

  const urlField = await screen.findByDisplayValue('https://github.com/codeyam/tabcommand');
  await userEvent.clear(urlField);
  await userEvent.type(urlField, 'https://github.com/codeyam/tabcommand-v2');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  const newKey = 'url-https://github.com/codeyam/tabcommand-v2';
  await waitFor(async () => {
    const stored = await get([newKey, urlKey, 'allUrls', 'labels']);
    expect(stored[newKey]).toMatchObject({ url: 'https://github.com/codeyam/tabcommand-v2' });
    expect(stored[urlKey]).toBeUndefined();                 // old key deleted
    expect(stored.allUrls).toEqual([newKey]);               // list migrated in place
    expect(stored.labels.Work.urlKeys).toEqual([newKey]);   // group membership migrated
  });
});
```

Status: PROPOSED — confirm red at execution. Expected failure: today's
`handleSubmit` writes `buildUrlInfo(...)` back under the original `urlKey` and
never touches `allUrls`/`labels` or removes the old key, so `stored[newKey]` is
`undefined` and `stored[urlKey]` is still present — the first `toMatchObject`
assertion throws.

**Target B** (edited title/favicon must not be clobbered):
`service_worker.test.js` — run with
`codeyam-editor editor refresh-tests --test "urlUpdates › preserves an edited title and favicon"`.

```js
// an edited record keeps its user title/favicon instead of taking the live tab's values
it('preserves an edited title and favicon', () => {
  const out = fns.urlUpdates(
    { url: 'https://a.com', title: 'My Title', favicon: 'mine.png', edited: true },
    { status: 'complete', title: 'Live Title', favIconUrl: 'live.png', groupId: -1, url: 'https://a.com' }
  );
  expect(out.title).toBe('My Title');
  expect(out.favicon).toBe('mine.png');
});
```

Status: PROPOSED — confirm red at execution. Expected failure: `urlUpdates`
currently runs `url.title = tab.title` and `url.favicon = tab.favIconUrl`
unconditionally, so `out.title` is `'Live Title'` and `out.favicon` is
`'live.png'` — both `expect(...).toBe(...)` assertions fail.

## Scenarios to Demonstrate

- **Edit URL of a closed (history/Favorites) entry, then click it** — the row
  now shows and opens the new URL; the original URL is gone from the list. (Core
  fix for bug 1.)
- **Edit only the title of an entry whose tab is open, wait for a tracker tick**
  — the edited title sticks instead of reverting to the live tab's title. (Core
  fix for bug 2.)
- **Edit the favicon of an entry** — the edited favicon persists and is not
  overwritten on the next tracking tick.
- **Edit a URL that belongs to a group (label)** — the entry stays in the group
  under its new key; the group chip still lists it, with no duplicate.
- **Edit only the `#fragment` of a URL** — key is unchanged, record is updated in
  place, nothing is duplicated or removed (guards the same-key branch).
- **Edit the URL of a currently-open tab (edge case)** — clicking opens the new
  URL in a new tab; the still-open original tab remains tracked as its own entry
  (documented, accepted behavior).
