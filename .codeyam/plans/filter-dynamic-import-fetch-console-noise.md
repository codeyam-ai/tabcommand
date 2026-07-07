---
title: "Filter Benign Dynamic-Import Fetch Console Errors in Scenario Capture"
mode: ui
createdAt: "2026-07-07T14:55:00Z"
source: manual
---

## Summary

The Live Preview intermittently logs `TypeError: Failed to fetch dynamically
imported module: https://tabcommand.editor.fleet.codeyam.com/src/index.jsx?import&t=<ts>`.
This is **benign reload-race noise**, not a broken build: the `@crxjs/vite-plugin`
dev HTML loader dynamically `import()`s the app entry (`/src/index.jsx`) with a
cache-busting `?t=<Date.now()>` query, and when a rapid iframe reload
(scenario re-activation) aborts that in-flight import, the loader's own
`catch (error) { console.error(error) }` logs the rejected promise. The app
reloads cleanly on the very next load. The real harm is that
`handleConsoleMessage` in the capture pipeline treats *any* unrecognized
console error as a scenario `console` issue, so this transient message
intermittently flags an otherwise-healthy scenario as errored (`ok = false`).
Fix: add this message to the existing "known dev-server WebSocket/HMR errors"
ignore branch so capture no longer mistakes it for a real defect.

## Key Decisions

- **Filter the console message rather than change app source or crxjs** — The
  error originates in vendored `@crxjs/vite-plugin`
  (`node_modules/@crxjs/vite-plugin/dist/index.mjs:1785`), whose dev loader
  appends `?t=Date.now()` and `await import(req)` inside a `try/catch` that
  ends in `console.error(error)`. That matches the observed message and the
  `?import&t=` query exactly. The abort is triggered by codeyam's own rapid
  scenario-activation reloads (`.codeyam/logs/container.log` shows two
  `load-refreshed` transitions straddling the error timestamp
  `t=1783435649459`). crxjs is required for the extension build, so we don't
  touch it or the app entry; we classify the message as benign at the capture
  boundary, exactly like the existing WebSocket/HMR filter.
- **Match narrowly on `dynamically imported module`** (per confirmed scope) —
  Ignore only the dynamic-import fetch failure. This substring covers both the
  Chrome phrasing (`Failed to fetch dynamically imported module`) and the
  Firefox phrasing (`error loading dynamically imported module`) without
  broadening to unrelated errors. We deliberately do NOT also swallow Vite
  dep-optimize 504s.
- **Safe against masking real breakage** — A genuinely broken entry/import
  fails deterministically on *every* load, so the scenario would render blank
  and still be caught by `buildResult`'s `loaded && hasContent` gates and by
  the `handlePageError` (`pageerror`) path. Only the flaky, reload-race variant
  of this one message is silenced.

## Implementation

### 1. Ignore the transient dynamic-import fetch error in console classification

**File**: `.codeyam/scenario-handlers.js`

In `handleConsoleMessage`, extend the existing ignore branch that currently
skips `"WebSocket connection to"` and `"Unsupported Media Type"` so it also
returns `null` when the error text includes `"dynamically imported module"`.
Update the branch's comment to note this covers crxjs/Vite dev-loader
reload-race import aborts (benign; the entry reloads on the next navigation).
Keep the match a simple `text.includes(...)` substring test, consistent with
the sibling conditions, and leave the `insecureContextAdvisory` precedence
check above it untouched so a genuine insecure-context refusal still wins.

Concretely, the branch becomes (illustrative):

```js
// Ignore known dev-server WebSocket/HMR errors from Vite proxy, plus the
// crxjs dev loader's dynamic-import abort when a rapid iframe reload cancels
// the in-flight import of the app entry (benign — the entry reloads next nav).
if (
  text.includes("WebSocket connection to") ||
  text.includes("Unsupported Media Type") ||
  text.includes("dynamically imported module")
) {
  return null;
}
```

No other call sites change — `handleConsoleMessage` is consumed by
`.codeyam/capture.js` and its `null` return already means "not an issue."

## Reused existing code

- `handleConsoleMessage` from `.codeyam/scenario-handlers.js` — the pure
  console-error classifier; the fix extends its existing HMR/WebSocket ignore
  branch.
- `createIssue` / `buildResult` from `.codeyam/scenario-issues.js` — unchanged;
  `buildResult` still gates scenario health on `loaded && hasContent &&
  issues.length === 0`, which is what continues to catch *real* load failures
  after this benign message is filtered.
- `handlePageError` from `.codeyam/scenario-handlers.js` — unchanged; a true
  boot failure still surfaces as a `pageerror` issue.

## Reproduction Test

Pins that a crxjs/Vite reload-race `Failed to fetch dynamically imported module`
console error is classified as benign (returns `null`) instead of a scenario
`console` issue.

**Target**: `.codeyam/scenario-handlers.test.js` (new — no existing test covers
this tooling module; `handleConsoleMessage` is a pure CommonJS export testable
under the repo's vitest/jsdom config). Run with
`codeyam-editor editor refresh-tests --test handleConsoleMessage_ignores_dynamic_import_fetch_error`.

```js
// Reload-race dynamic-import fetch errors from the crxjs dev loader are benign and must not flag a scenario
const { handleConsoleMessage } = require("./scenario-handlers");

it("ignores 'Failed to fetch dynamically imported module' console errors", () => {
  const message = {
    type: () => "error",
    text: () =>
      "TypeError: Failed to fetch dynamically imported module: " +
      "https://tabcommand.editor.fleet.codeyam.com/src/index.jsx?import&t=1783435649459",
  };
  expect(handleConsoleMessage(message)).toBeNull();
});
```

Status: PROPOSED — confirm red at execution. Expected failure before the fix:
`handleConsoleMessage` falls through to `createIssue("console", text)` and
returns `{ kind: "console", message: "...", url: null, status: null }`, so
`toBeNull()` fails. After the fix it returns `null` and the test passes.

## Scenarios to Demonstrate

- Happy path: `Home - Automatically Closed` scenario captures cleanly with no
  `console` issue even when a reload race fires the dynamic-import error
  (`ok = true`).
- Benign-noise case: a console error whose text contains
  `Failed to fetch dynamically imported module` → classified as not-an-issue.
- Firefox-phrasing variant: `error loading dynamically imported module` → also
  ignored (same substring guard).
- Real-breakage guard (unchanged): a genuine console error (e.g.
  `Uncaught ReferenceError: foo is not defined`) → still surfaces as a
  `console` issue, and a blank/never-loading entry still fails via
  `loaded && hasContent`.
