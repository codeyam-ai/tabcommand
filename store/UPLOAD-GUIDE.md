# TabCommand — Chrome Web Store upload guide (Public listing, v0.17)

Everything in this `store/` folder is **prepped and ready** for a **public**
listing. The steps below are the parts only you can do — they need your Google
account and a credit card.

## One-time requirement: paid developer account

- Publishing to the Chrome Web Store requires a registered developer account,
  which costs a **one-time US $5 fee** (not per extension, not recurring).
- Register and pay at the Developer Dashboard:
  https://chrome.google.com/webstore/devconsole
- You'll also verify a contact email and accept the developer agreement before
  your first item can be submitted.

## What "public" means

- The item is **listed** — it appears in Web Store search and category browsing,
  and anyone can find and install it.
- Expect **review to take longer and be stricter than unlisted**. TabCommand
  requests `tabs`, which Google treats as access to sensitive user data (browsing
  activity), so a permissions/privacy review is likely. First review for a new
  public item commonly runs from a few days to a couple of weeks.
- If you need to hand the build to someone **today**, don't wait on review: have
  them load `build/` unpacked via `chrome://extensions` → Developer mode → Load
  unpacked.

---

## What's already prepared in this folder

| File | What it is | Where it goes in the dashboard |
|---|---|---|
| `tabcommand-0.17.zip` | The packaged extension (manifest at the zip root, version **0.17**) | Package → Upload new package |
| `icon/tabcommand-icon-128.png` | 128×128 store icon | Store listing → Store icon |
| `screenshots/01…05-*.png` | Five 1280×800 screenshots, in upload order (5 is the max allowed) | Store listing → Screenshots |
| `promo/small-tile-440x280.png` | 440×280 small promo tile — **required to publish** | Store listing → Small promo tile |
| `promo/marquee-1400x560.png` | 1400×560 marquee tile — optional, needed to be eligible for featuring | Store listing → Marquee promo tile |
| `store-listing.md` | Title, summary, description, permission justifications, privacy answers | Store listing + Privacy tabs |
| _(hosted)_ `https://codeyam.com/tabcommand/privacy` | Privacy policy page, in the `codeyam-local` repo | Privacy → Privacy policy URL |

> The `.zip` is gitignored (the repo ignores `*.zip` and `build/`). Regenerate it
> any time with the commands at the bottom of this file.

---

## Before you upload: ship the privacy policy page

The Privacy tab requires a **working** privacy policy URL. TabCommand's policy is
a page on the CodeYam site, added in the `codeyam-local` repo as
`dashboard/app/routes/tabcommand.privacy.tsx`. **It must be merged and deployed
to production before you submit**, or Google will hit a 404 and reject.

Confirm this URL loads in a logged-out browser before submitting:
https://codeyam.com/tabcommand/privacy

---

## Upload steps (you do these)

1. **Register / sign in** at https://chrome.google.com/webstore/devconsole and
   pay the one-time $5 fee if you haven't already.
2. Click **"Add new item"** and upload **`tabcommand-0.17.zip`**.
3. **Store listing** tab:
   - Item name, Summary, Detailed description → copy from `store-listing.md`.
   - Store icon → `icon/tabcommand-icon-128.png`.
   - Screenshots → upload all five from `screenshots/` in numbered order.
     (Five is the cap; the form will reject a sixth.)
   - Small promo tile → `promo/small-tile-440x280.png`. **This one is required**
     — the listing cannot be submitted without it.
   - Marquee promo tile → `promo/marquee-1400x560.png`. Optional, but without it
     the extension is not eligible for marquee featuring.
   - Category → **Productivity**. Language → **English (US)**.
4. **Privacy** tab:
   - Single-purpose description → from `store-listing.md`.
   - Permission justifications → paste the table rows from `store-listing.md`
     (one per permission — Google rejects blanks here).
   - Privacy policy URL → `https://codeyam.com/tabcommand/privacy`
     (**not** `/privacy` — that's the company policy and it describes data
     collection TabCommand doesn't do)
   - Data usage → **no** data-collection categories checked. Tick all three
     certification checkboxes.
5. **Distribution** tab:
   - Visibility → **Public**.
   - Regions → All (or narrow if you prefer).
6. Click **Submit for review**. You'll get email on approval; the public install
   link then appears on the item's dashboard page.

### If review comes back with questions

The most likely question is about `tabs`. The answer: TabCommand reads tab titles
and URLs **only to display, search, and organize them locally for the user**; it
reads no page content and transmits nothing. That's already the wording in
`store-listing.md` and `PRIVACY.md`.

---

## Note: the `processes` permission was removed

- `processes` was dropped from `manifest.json`. `chrome.processes` is a
  Dev/Canary-only API and would have drawn a review question on a stable-channel
  extension.
- No functionality is lost on stable Chrome: `service_worker.js` checks
  `processesApiAvailable()` and falls back to `system.cpu` / `system.memory`,
  which is what stable Chrome uses anyway.
- The only effect: on Dev/Canary you no longer get the richer per-tab process
  breakdown. The Browser Load gauge and Heaviest Tabs still work from
  system-level CPU/memory.

---

## What the production build deliberately excludes

`npm run build` strips all codeyam artifacts from the package:

- The isolation harness (`.codeyam/harness/isolate.jsx`) is swapped for a stub
  that renders `<App/>` directly. The harness only does anything when the URL has
  `?isolate=`, which never happens in a packaged extension.
- With it go `ISOLATION_PROPS` and the `codeyam:components` /
  `codeyam:component-scenarios` manifests — i.e. all **scenario mock data**.

Before this, the published `.zip` contained internal URLs (Notion, Linear, Figma)
and placeholder favicon links pointing at `google.com/s2/favicons`. Now it doesn't.
Bundle dropped 351 kB → 338 kB.

Dev is untouched: `npm run dev` still loads the real harness, so `?isolate=` and
codeyam scenario capture work exactly as before. Set `CODEYAM_KEEP_HARNESS=1` to
force the harness into a build if you ever need to.

Sanity-check any new package before uploading:

```bash
unzip -qq store/tabcommand-<version>.zip -d /tmp/zc
grep -rl "codeyam\|s2/favicons\|notion.so\|fonts.googleapis" /tmp/zc   # → no matches
```

## Regenerate the package (if you change code)

```bash
# 1. bump the version in manifest.json (the Web Store rejects re-used versions)
# 2. rebuild
npm run build
# 3. repackage — manifest.json must be at the ZIP ROOT
cd build && zip -rqX "../store/tabcommand-<version>.zip" . -x ".*" && cd ..
```

## Regenerate the promo tiles

The tiles are built from `promo/tiles.html` (self-contained: the icon is embedded
as a base64 data URI, so there are no external assets). Render each element with
Playwright at `deviceScaleFactor: 2`, then downscale to the exact spec — this is
sharper than rendering at 1×:

```bash
# renders #small and #mq from promo/tiles.html, then:
sips -z 280 440  small@2x.png --out store/promo/small-tile-440x280.png
sips -z 560 1400 mq@2x.png    --out store/promo/marquee-1400x560.png
```

Sizes must be **exact** (440×280 / 1400×560); the dashboard rejects anything else.

## Regenerate the screenshots

They're downscaled straight from codeyam scenario captures (2880×1800 → 1280×800,
same 1.6 aspect ratio, so no cropping):

```bash
S=.codeyam/scenarios/screenshots
sips -z 800 1280 "$S/home-open-and-saved-tabs--desktop.png"   --out store/screenshots/01-tab-groups.png
sips -z 800 1280 "$S/search-active-results--desktop.png"      --out store/screenshots/02-search-everything.png
sips -z 800 1280 "$S/home-running-hot--desktop.png"           --out store/screenshots/03-browser-load-gauge.png
sips -z 800 1280 "$S/home-settings-popover-open--desktop.png" --out store/screenshots/04-auto-close-settings.png
sips -z 800 1280 "$S/history-populated--desktop.png"          --out store/screenshots/05-history.png
```

Exactly five — the Web Store rejects a sixth. (A dark-mode shot was cut for this.)
