# Contributing to TabCommand

Thanks for your interest! TabCommand is a Manifest V3 Chrome extension built with the
[codeyam](https://codeyam.com) plan workflow, where every UI state is captured as a
scenario and the tests and code glossary stay in sync with the source.

## Getting started

```bash
npm install
npm run dev      # Vite dev server on http://localhost:3000
```

The app runs in a normal browser tab — no extension install required. See the
[README](./README.md) for how to load the built extension and explore the scenarios.

## Before you open a pull request

Please make sure these all pass locally — CI runs the same checks on every PR:

```bash
npm run lint     # ESLint 9
npm test         # Vitest + React Testing Library
npm run build    # produces the unpacked MV3 extension in build/
```

- Keep changes focused, and add or update tests for any behavior you change.
- If you change a component's appearance or its states, update or add the matching
  scenario under `.codeyam/scenarios/` so the screenshots stay accurate.
- The richest workflow is to drive changes through `codeyam-editor` (see the README),
  which keeps tests, the glossary, and scenarios in sync automatically — but plain
  `npm` development is fully supported.

## Reporting bugs

Open an issue at <https://github.com/codeyam-ai/tabcommand/issues> with steps to
reproduce, what you expected, and what actually happened.
