---
name: seed-via-localstorage-field
description: TabCommand scenarios seed chrome.storage via the scenario `localStorage` field, not the `seed`+adapter path
metadata:
  type: project
---

TabCommand scenarios must seed `chrome.storage.local` through the editor's
**`localStorage` scenario field** (a `{ key: "<json-string>" }` map of
pre-stringified values), NOT through the `seed` field.

**Why:** The editor canonicalizes the `seed` field into array-per-table rows
(`crates/types/src/seed_input.rs` `from_scenario_value`) *before* the seed
adapter runs. TabCommand's `labels`, `uxSettings`, and `autoClosed` keys are
object-valued (`{ id: {...} }`), so they fail that array-only validation
("scenario seed table '<key>' must be an array of row objects"). Only array
keys (`activeTabs`, `allUrls`, `previousLabels`) could pass `seed`. The
`localStorage` field bypasses canonicalization and carries object + array
values uniformly. Decision confirmed by the user on 2026-06-09.

**How to apply:** In each scenario JSON, write
`"localStorage": { "labels": "{...}", "activeTabs": "[...]", ... }` where each
value is `JSON.stringify`'d. The shim hydrates these via
`JSON.parse(localStorage.getItem(key))` on boot. The `.codeyam/seed-adapter.ts`
localStorage adapter stays installed and unit-verifiable (`npx tsx
.codeyam/seed-adapter.ts <file>`) but is off the scenario-capture path.
Registering with the `localStorage` field prints a harmless "without seed data"
warning — the field is still applied and captured. Relates to the chrome shim
spine built in the chrome-storage-layer plan.
