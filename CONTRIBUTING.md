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
Requires Node.js 22+.

```bash
# Install dependencies
npm install

# Run the test suite and the linter
npm test
npm run lint

# Build the extension
npm run build
```

To try your build in Chrome: open `chrome://extensions`, enable **Developer
mode**, choose **Load unpacked**, and select the `build/` folder. After code
changes, re-run `npm run build` and reload the extension to pick them up.

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
