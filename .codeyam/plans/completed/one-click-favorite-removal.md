---
title: "One-Click Favorite Removal"
mode: ui
createdAt: "2026-07-21T11:13:46Z"
source: manual
---

## Summary

Removing a favorite takes several clicks: `rankFavorites` rolls every stored page
of a host onto ONE site row (`siteKey` grouping), but the sidebar's × writes only
the representative page's `urlKey` into `favoritesHidden`. The group instantly
re-forms from the next-most-recent page of the same host, so the row reappears
and the user has to click × once per stored `url-*` key of that site. "Bring back"
on the View All page has the mirror-image bug: it un-hides one key while the
site's other keys stay hidden, so a site can end up permanently half-hidden.
Fix: make removal site-level, matching the site-level grouping the rows already
use — hide by site key, honor legacy page-key entries, and remove/restore the
whole site in one click.

## Key Decisions

- **Store site keys in `favoritesHidden`, not page keys.** A row means "espn.com",
  so the removal record must mean the same thing. Anything else (e.g. hiding every
  current member key at click time) leaves the row free to come back the next time
  the user visits any new page on that host.
- **Backward compatible on read, no migration.** Existing installs have
  `url-https://a.com` entries in `favoritesHidden`. Normalize each stored entry
  through `siteKey(entry.replace(/^url-/, ''))` when building the set, so legacy
  page entries keep hiding their site. Writes use the bare site key from then on;
  no storage rewrite or version bump is needed. (This mirrors how `rankFavorites`
  already strips the `url-` prefix off keys to recover raw URLs.)
- **Apply the hidden set at the GROUP level in `rankFavorites`, not the candidate
  level.** The current candidate-level `excluded.has(urlKey)` check is exactly why
  a hidden representative just yields the next member. New `excludedSites` /
  `hiddenSites` options are matched against each group's `groupKey`, which is
  already the host.
- **Keep the existing `excludedKeys` / `hiddenKeys` options.** Pinned-tab exclusion
  still passes page keys and is a separate (page-level) concern; leaving it alone
  keeps the change scoped. Note in passing: pinned-tab exclusion has the same
  re-forming behavior, but it is out of scope here.

## Implementation

### 1. Normalize a stored `favoritesHidden` list into a set of site keys

**New file**: `src/lib/utils/hiddenSiteKeys.js`

`hiddenSiteKeys(favoritesHidden)` → `Set` of site keys. For each entry, strip a
leading `url-`, run it through `siteKey`, and fall back to the raw entry when
`siteKey` returns `''` (unparseable — matching the `siteKey(url) || normalizeUrl(url)`
fallback `rankFavorites` uses for its group keys). Tolerates a non-array / missing
input by returning an empty set. Document that this is the read-side bridge between
legacy page-key entries and the site-key form written from now on.

### 2. Apply hidden/excluded sites at group level

**File**: `src/lib/utils/rankFavorites.js`

Add two options alongside the existing ones:

- `excludedSites` — a `Set` of site keys dropped entirely (the sidebar's use).
- `hiddenSites` — a `Set` of site keys scored and returned with `isHidden: true`
  (the View All page's use).

Apply both in the qualifying loop where `groupKey` is in hand: `continue` when
`excludedSites.has(groupKey)`; set `group.isHidden = true` when
`hiddenSites.has(groupKey)`. Keep the existing per-candidate `excluded` /
`hiddenKeys` behavior unchanged so pinned-tab exclusion is untouched. Update the
header comment block to describe the two new options and to say plainly that
hiding is site-level because rows are site-level.

### 3. Sidebar: hide the site, not the page

**File**: `src/lib/components/Favorites/Favorites.jsx`

- Build `excludedSites` from `favoritesHidden` via `hiddenSiteKeys(...)` and pass it
  in the options object; drop `favoritesHidden` from the `excludedKeys` set (pinned
  tabs stay there).
- `removeFavorite` writes the site key: `const key = siteKey(favorite.url) || favorite.urlKey;`
  guard on `hidden.includes(key)` and append `key`.

### 4. View All: flag and restore by site

**File**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.jsx`

- Pass `hiddenSites: hiddenSiteKeys(favoritesHidden)` instead of the page-key
  `hiddenKeys` set, so a hidden site's row renders dimmed regardless of which of
  its pages is currently representative.
- `bringBack` removes EVERY entry that normalizes to the site's key — including
  legacy `url-*` entries — so one click fully restores the site:
  filter `hidden` by `siteKey(entry.replace(/^url-/, '')) !== target`.

### 5. Tests

**File**: `src/lib/components/Favorites/Favorites.test.jsx`

Add the reproduction test below. Also extend the existing
`excludes a site present in favoritesHidden` test with a bare-site-key entry
(`'a.com'`) so both storage forms are covered.

**File**: `src/lib/pages/ViewAllFavorites/ViewAllFavorites.test.jsx`

A multi-page site whose representative was removed renders dimmed with "Bring
back", and one click on it restores the whole site (nothing site-related left in
`favoritesHidden`).

**New file**: `src/lib/utils/hiddenSiteKeys.test.js`

Legacy `url-` entries, bare site keys, `www.`/scheme variants collapsing, and
junk-tolerant fallback.

## Reused existing code

- `siteKey` from `src/lib/utils/siteKey.js` (glossary entry: `siteKey`) — the
  canonical host key; the same function `rankFavorites` groups by, so hiding and
  grouping agree by construction.
- `rankFavorites` from `src/lib/utils/rankFavorites.js` (glossary entry:
  `rankFavorites`) — extended, not replaced; the group loop already has `groupKey`.
- `normalizeUrl` from `src/lib/utils/normalizeUrl.js` — the fallback shape for an
  unparseable URL, matching `rankFavorites`' own `siteKey(url) || normalizeUrl(url)`.
- `Chrome` from `src/lib/utils/Chrome.js` — existing storage read/write wrapper used
  by both callers.
- `installChromeShim` from `src/lib/utils/chromeShim.js` — the storage shim the
  existing Favorites/ViewAllFavorites tests seed against.

**Existing-implementation survey:** grepped for site-level hiding before writing
this plan — `favoritesHidden` appears only in `Favorites.jsx`,
`ViewAllFavorites.jsx`, `FavoritesResetControl.jsx` (clears it), and the two test
files. There is no existing site-key-aware hidden set and no
`hiddenSites`/`excludedSites` option on `rankFavorites` — nothing equivalent
exists, so this adds the dimension rather than duplicating one.

## Reproduction Test

Pins that removing a site with more than one stored page hides it in ONE click,
instead of the row re-forming from the site's next page.

**Target**: `src/lib/components/Favorites/Favorites.test.jsx` — run with
`codeyam-editor editor refresh-tests --test "hides a multi-page site in a single click"`.

```jsx
// A site with several stored pages is one row, so one × click must remove it —
// the row must not re-form from the site's next-most-recent page.
it('hides a multi-page site in a single click', async () => {
  seed('allUrls', [
    'url-https://espn.com/nfl/story',
    'url-https://espn.com/',
    'url-https://b.com',
  ]);
  seed('url-https://espn.com/nfl/story', { title: 'ESPN Story', favicon: '', visitCount: 3 });
  seed('url-https://espn.com/', { title: 'ESPN', favicon: '', visitCount: 3 });
  seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 3 });
  installChromeShim();

  render(<Favorites />);

  const espnRow = await screen.findByText('ESPN Story');
  const remove = espnRow
    .closest('.Favorites-item')
    .querySelector('.Favorites-item-remove');
  fireEvent.click(remove);

  await waitFor(() =>
    expect(screen.queryByText('ESPN Story')).not.toBeInTheDocument()
  );
  // The site is gone entirely — no second espn.com row took its place.
  expect(screen.queryByText('ESPN')).not.toBeInTheDocument();
  expect(screen.getByText('Bravo')).toBeInTheDocument();
});
```

Status: PROPOSED — confirm red at execution. Expected failure: after the click
only `url-https://espn.com/nfl/story` lands in `favoritesHidden`, so the group
re-forms with `url-https://espn.com/` as representative and the
`queryByText('ESPN')` assertion finds a rendered row (`expected element not to be
in the document`). The two-page fixture is the minimum that reproduces it; confirm
empirically at execution that the row really does re-form before trusting the red.

## Scenarios to Demonstrate

- Sidebar Favorites with a multi-page site (espn.com across several articles) — one
  × click removes the whole site.
- Sidebar Favorites where `favoritesHidden` holds a LEGACY `url-https://espn.com/`
  entry — the site is still hidden after the change (no regression for existing users).
- View All Favorites showing a removed multi-page site dimmed with "Bring back".
- View All Favorites after one "Bring back" click — the site is fully restored and
  reappears in the sidebar.
- A single-page site removed and restored (the pre-existing behavior still works).
- Empty state: every favorite removed → sidebar section renders nothing.