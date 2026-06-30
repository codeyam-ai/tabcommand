# TabCommand — Unlisted Chrome Web Store upload guide

Everything in this `store/` folder is **prepped and ready**. The steps below are
the parts only you can do (they need your Google account and a credit card).

## What "unlisted" actually means — read first

- **Unlisted ≠ private or instant.** An unlisted item is simply hidden from Web
  Store search and category browsing. Anyone with the **direct link can still
  install it**, and it is **not** an internal/whitelist-only channel.
- **Unlisted still goes through Google's review.** Publishing as unlisted does
  *not* skip review. First-time review for a new item commonly takes anywhere
  from a few hours to a couple of weeks, especially with sensitive permissions
  (see the `tabs` / `processes` note below). Plan for a wait; it is not a
  same-day private share.
- If you need to hand a build to a handful of people *today* with no review,
  use **"Load unpacked"** from `build/` in `chrome://extensions` (Developer
  mode on), or zip `build/` and have them load it unpacked. That is the true
  instant path; the Web Store is the durable, auto-updating one.

## One-time requirement: paid developer account

- Publishing anything to the Chrome Web Store requires a **registered Chrome
  Web Store developer account**, which costs a **one-time US $5 fee** (not per
  extension, not recurring).
- Register and pay at the **Developer Dashboard**:
  https://chrome.google.com/webstore/devconsole
- You will also be asked to verify a contact email and accept the developer
  agreement before your first item can be submitted.

---

## What's already prepared in this folder

| File | What it is | Where it goes in the dashboard |
|---|---|---|
| `tabcommand-0.14.zip` | The packaged extension (manifest at the zip root, version **0.14**) | "Package" → Upload new package |
| `icon/tabcommand-icon-128.png` | 128×128 store icon | Store listing → Store icon |
| `screenshots/01…05-*.png` | Five 1280×800 screenshots | Store listing → Screenshots |
| `store-listing.md` | Title, summary, full description, permission justifications, privacy answers | Store listing + Privacy tabs |

> The `.zip` is gitignored (the repo ignores `*.zip` and `build/`). Regenerate it
> any time with the commands at the bottom of this file.

---

## Upload steps (you do these)

1. **Register / sign in** at https://chrome.google.com/webstore/devconsole and
   pay the one-time $5 fee if you haven't already.
2. Click **"Add new item"** and upload **`tabcommand-0.14.zip`**.
3. **Store listing** tab:
   - Item name, Summary, Detailed description → copy from `store-listing.md`.
   - Store icon → `icon/tabcommand-icon-128.png`.
   - Screenshots → upload all five from `screenshots/` (drag to order them).
   - Category → Productivity. Language → English (US).
4. **Privacy** tab:
   - Single-purpose description → from `store-listing.md`.
   - Permission justifications → paste the table rows from `store-listing.md`.
   - Data usage → "No data collected" (TabCommand stores everything locally via
     `chrome.storage.local`). Certify the policy compliance checkbox.
5. **Distribution** tab:
   - Visibility → **Unlisted**.
6. Click **Submit for review**. You'll get email when it's approved; the install
   link appears on the item's dashboard page.

---

## Note: the `processes` permission was removed

- The `processes` permission has been **dropped** from `manifest.json` for this
  build. `chrome.processes` is a Dev/Canary-only API and would have drawn a
  likely review question on a stable-channel extension.
- No functionality is lost on stable Chrome: `service_worker.js` checks
  `processesApiAvailable()` and falls back to `system.cpu` / `system.memory`,
  which is exactly what stable Chrome uses anyway. Verified — all 70 worker/popup
  tests pass after removal.
- The only effect: on Dev/Canary you no longer get the richer per-tab process
  breakdown. The Browser Load gauge and Heaviest Tabs panel still work from
  system-level CPU/memory.

---

## Regenerate the package (if you change code)

```bash
# 1. bump the version in manifest.json (Web Store rejects re-used versions)
# 2. rebuild
npm run build
# 3. repackage — manifest.json must be at the ZIP ROOT
cd build && zip -rqX "../store/tabcommand-<version>.zip" . -x ".*" && cd ..
```
