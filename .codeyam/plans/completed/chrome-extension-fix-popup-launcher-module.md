---
title: "chrome-extension: Fix the popup launcher so the packaged extension loads"
mode: ui
createdAt: "2026-06-24T19:44:17Z"
source: manual
prefix: "chrome-extension"
---

## Summary

The built extension in `build/` is **not actually loadable as a working
extension today**: `build/popup/popup.html` is a `CRXJS DEV MODE` placeholder
that renders *"An unknown error occurred. Failed to load the script."* This is
the known follow-up already flagged in `MODERNIZATION.md` (lines 167–169):
`@crxjs/vite-plugin` drops the classic `popup/popup.js` from the production build
because `popup/popup.html` loads it as a **non-module** `<script src="./popup.js">`.
Since the toolbar icon's popup is the only launcher that opens the full-page app
(`chrome.runtime.getURL("index.html")` in a pinned tab), clicking the icon in a
loaded build errors instead of opening TabCommand. This plan makes `popup.js` an
ES module so crxjs keeps it in the build, verifies the packaged popup launches
the app, and adds the short "run it locally / share a build" instructions that
are currently absent from the repo (no README, no Setup section).

## Key Decisions

- **Make `popup.js` an ES module rather than rewriting the launcher.** The
  launcher logic is tiny and correct (query tabs → focus the existing
  TabCommand tab or create a pinned one → `window.close()`); the only problem is
  packaging. Changing `popup/popup.html` to `<script type="module" src="./popup.js">`
  is exactly the fix the modern template uses
  (`templates/chrome-extension-react/popup.html` in codeyam-editor loads its popup
  entry as `type="module"`), so crxjs processes and emits it.
- **Keep faithful to the reference behavior.** The 2022 reference popup
  (`../tabcommand/`) bundled `popup.js` via CRA and it worked; the modern build
  just needs the module signal. Do not change what the popup *does* — only how
  it's loaded/emitted.
- **Document install + off-store sharing in the repo.** The user's original
  observation was that there are no instructions for installing locally or
  sharing without the Chrome Web Store. Add a concise "Running & sharing the
  extension" section (load-unpacked + zip handoff), so the now-working build is
  also discoverable. Keep it short and faithful to this repo's actual commands.

## Implementation

### 1. Load the popup script as a module

**File**: `popup/popup.html`

Change the head's `<script src="./popup.js">` to
`<script type="module" src="./popup.js">`. This is the signal `@crxjs` needs to
treat `popup.js` as a build input and emit it (and its assets) into `build/`
instead of dropping it.

### 2. Confirm `popup.js` is module-safe

**File**: `popup/popup.js`

The current launcher (`init()` querying tabs and opening/focusing the pinned
TabCommand tab) is module-compatible as written — it touches only `chrome.*` and
`window`, with no globals it exports or expects to be global. Verify there is no
remaining reliance on the script being a classic (non-module) global: an inline
`onload`/global-function reference in the HTML, or an implicit global `init`
call. If `init()` is invoked via a global hook, replace that with an explicit
call (or `DOMContentLoaded` listener) inside the module so it still runs.

### 3. Verify the build emits a real popup

**Files**: `vite.config.mjs`, `manifest.json` (verification only)

After `npm run build`, confirm `build/popup/popup.html` is the real popup markup
(not the `CRXJS DEV MODE` placeholder) and that the built HTML references the
emitted module. The manifest's `action.default_popup` already points at
`popup/popup.html`; crxjs should now carry it through. If crxjs still does not
emit the popup from the manifest reference alone, add `popup/popup.html` as an
explicit `rollupOptions.input` entry in `vite.config.mjs` (mirroring how
`index.html` is already registered there as an explicit input).

### 4. Manual load-unpacked check (verification)

Build, then load `build/` as an unpacked extension (chrome://extensions →
Developer mode → Load unpacked → choose `build/`), click the toolbar icon, and
confirm it opens the full-page TabCommand app in a pinned tab rather than the
error page. Capture the result in the plan's verification notes.

### 5. Document running & sharing the extension

**File**: `MODERNIZATION.md`

- Update the "Known follow-up" note (lines ~167–169) to mark the popup-launcher
  issue resolved (or remove it).
- Add a short **"Running & sharing the extension"** section: `npm install` →
  `npm run build` → load `build/` unpacked; and for handing it to a teammate /
  tester, zip the `build/` directory and have them Load unpacked (note: no
  auto-update, and Chrome shows the developer-mode warning). Keep it to the
  commands this repo actually uses.

## Reused existing code

- `popup/popup.js` launcher logic (faithful to `../tabcommand/` reference) — unchanged behavior
- `vite.config.mjs` existing `rollupOptions.input` pattern (the `index.html` explicit-input precedent)
- `manifest.json` `action.default_popup` wiring (already correct)
- The module-script pattern from `templates/chrome-extension-react/popup.html` (codeyam-editor) as the reference fix

## Scenarios to Demonstrate

This change is runtime/packaging (the popup launcher and build emission), which
the deferred-runtime note in `MODERNIZATION.md` already classifies as outside the
seeded scenario set — the existing 12 seeded scenarios cover the full-page app's
states and are unaffected. Verification here is the manual load-unpacked check in
step 4 (icon click opens the app) plus a clean `npm run build` that emits a real
`build/popup/popup.html`.
