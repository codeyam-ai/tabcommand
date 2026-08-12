# Contributing

Thanks for your interest in contributing! TabCommand is a Manifest V3 Chrome
extension built with React and Vite, and developed with
[codeyam-editor](https://codeyam.com) — the app's code and its runnable data
**scenarios** are authored side by side against a live preview, and its test
suite is captured and maintained as part of the same workflow.

## The recommended workflow: codeyam-editor

We strongly recommend making your change through codeyam-editor. It keeps the
three things that have to stay in sync — code, tests, and scenarios — aligned
automatically, so your change lands with its scenarios captured and its tests
registered instead of drifting apart over time.

```bash
# Clone the repo
git clone https://github.com/codeyam-ai/tabcommand && cd tabcommand

# Install codeyam-editor
npm install -g @codeyam-editor/codeyam-editor@latest

# Launch the editor (split-screen terminal + live preview)
codeyam-editor editor
```

codeyam-editor requires a subscription to Claude, Gemini, or Codex. Inside the
editor you describe or make a change and it walks you through capturing the
scenarios and tests that cover it, so nothing you contribute goes untested or
unillustrated.

## Building and testing by hand

If you're working without the editor, the standard workflow is fully supported.
Requires Node.js 22.22.2+.

```bash
# Install dependencies (pins the npm version via corepack, then installs)
npm run setup

# Run the test suite and the linter
npm test
npm run lint

# Build the extension
npm run build
```

To try your build in Chrome: open `chrome://extensions`, enable **Developer
mode**, choose **Load unpacked**, and select the **`dist/extension/`** folder.
After code changes, re-run `npm run build` and reload the extension to pick them
up.

Load `dist/extension/`, never `build/`. Vite builds with `emptyOutDir`, so
`build/` is deleted and recreated on every build; if Chrome reads it mid-rewrite
it treats the extension as uninstalled and destroys its `chrome.storage.local`
along with it. `npm run build` mirrors the output into `dist/extension/`, which
is created once and never removed wholesale, writing `manifest.json` last so the
directory is never momentarily invalid. It sits under `dist/` because every tool
here already excludes that path, so the mirrored bundle is never linted, scanned
for tests, or enrolled in the glossary.

Note that `manifest.json` carries a `key` field pinning the extension ID to
TabCommand's published identity. That is deliberate — without it, the unpacked
build and the Web Store install present separate storage partitions, so a user's
groups appear to vanish when they switch between them. It also means you cannot
have both loaded at once.

## Pull requests

1. Fork and create a topic branch off `main`.
2. Make your change — ideally in codeyam-editor, so its scenarios and tests are
   captured and registered as you go.
3. Ensure `npm test`, `npm run lint`, and `npm run build` all pass.
4. Open a PR describing what changed and why.

## Code of conduct

Please keep interactions respectful and constructive; by participating you
agree to help keep this a welcoming community. To report a security issue, see
[SECURITY.md](SECURITY.md).
