---
title: "Copy Button On The Current Snapshot"
mode: ui
createdAt: "2026-08-13T11:17:54Z"
source: manual
---

## Summary

On the Import / Export page, every **Previous** snapshot has its own Copy button but the **Current** snapshot does not — copying the backup you most likely want means hand-selecting the JSON out of a read-only textarea. Give Current the same Copy button the Previous entries already have by rendering it through the existing `SnapshotField` component instead of a bare `SnapshotBox`.

## Key Decisions

- **Reuse `SnapshotField` rather than adding a second copy control.** `SnapshotField` already wraps a read-only `SnapshotBox` with a Copy button that flips to a green "Copied ✓" for ~1.6s and swallows the `navigator.clipboard.writeText` rejection that occurs in headless captures / non-secure contexts. Reusing it means Current and Previous copy identically, with zero new clipboard code and no new CSS.
- **Reverse a deliberate decision, so retire its rationale.** The Export panel carries a comment (and a matching glossary description) explaining that Current *deliberately* has no Copy button because it is "the field the sync warnings point at, so it is the one the user is most likely to be reading rather than reaching for." That reasoning no longer holds — the page's own intro tells users to "copy a snapshot below to keep a working backup," and Current is the snapshot a backup should be taken from. The comment must be rewritten in the same edit, or the code and its documented intent will contradict each other.
- **No layout work.** `SnapshotField` is a flex row (`.SnapshotField`) whose `.SnapshotBox` is `flex: 1`, so Current keeps its full width with the button beside it, matching the Previous rows. Its `margin-bottom: 12px` collapses against the `.ExportPanel-subhead` 18px top margin, so vertical rhythm is unchanged. The Export panel stylesheet needs no edit.

## Implementation

### 1. Render Current through `SnapshotField`

**File**: `src/lib/components/ExportPanel/ExportPanel.jsx`

Replace the `SnapshotBox` rendered under the "Current" subhead with `SnapshotField`, passing the same `current` value (`SnapshotField` is already read-only). Drop the now-unused `SnapshotBox` import — `SnapshotField` imports it itself; keep the `SnapshotField` import that the Previous list already uses.

Rewrite the component's leading comment: remove the "The current snapshot deliberately has NO Copy button" paragraph and replace it with the new intent — every snapshot on the page, current and previous, is copyable in one click, because the page's whole purpose is handing the user a snapshot they can paste somewhere safe. Keep the surviving note that the Previous entries are a list where a per-row button is the only way to act on a specific row. This comment is the source of the glossary description for `ExportPanel`, so the glossary text will follow it.

### 2. Cover the new button in the page test

**File**: `src/lib/pages/ImportExport/ImportExport.test.jsx`

Add a test asserting the Current snapshot is copyable: seed `labels`, render `ImportExport`, wait for the Current box to serialize, click the Copy button that sits in the same `SnapshotField` as the Current box, and assert the clipboard write was called with the Current snapshot's value. Stub `navigator.clipboard` with a `vi.fn()` in the test (jsdom has no clipboard). The 1.6s "Copied ✓" revert is `SnapshotField`'s own behavior and does not need re-testing here.

The existing tests query by read-only textarea content (`readonlyBoxContaining`), which is unaffected by adding a sibling button, so no existing test needs to change.

### 3. Refresh the ExportPanel scenario descriptions and captures

**File**: `.codeyam/scenarios/exportpanel-with-snapshot-history.json`

Its description says the prior snapshots each have "its own Copy button," implicitly contrasting with a Current that does not. Update it to say every snapshot — current and previous — is copyable, keeping the point that the Previous stack is what makes the page a recovery tool. The desktop screenshots for both `exportpanel-with-snapshot-history` and `exportpanel-nothing-to-fall-back-to` change (a new button appears on Current) and should be re-captured.

## Reused existing code

- `SnapshotField` from `src/lib/components/SnapshotField/SnapshotField.jsx` (glossary entry: `SnapshotField`) — the read-only snapshot + Copy button pair, including the clipboard-rejection swallow and the 1.6s "Copied ✓" state. This is the whole feature; nothing new is written.
- `SnapshotBox` from `src/lib/components/SnapshotBox/SnapshotBox.jsx` (glossary entry: `SnapshotBox`) — still the underlying textarea, now reached through `SnapshotField` instead of directly.
- `Icon` from `src/lib/components/Icon/Icon.jsx` — used by `SnapshotField` for the `copy` / `check` glyphs; no direct use in the Export panel.
- Existing-implementation survey: there is **no** separate copy helper, copy hook, or standalone copy-button component anywhere under `src/lib/components` — `SnapshotField` is the only clipboard-writing code in the app (a clipboard grep across the whole source tree hits only that file). So reuse means reusing `SnapshotField` itself, not extracting a shared button.
- The `readonlyBoxContaining` test helper already in `src/lib/pages/ImportExport/ImportExport.test.jsx` — used to locate the Current box in the new test.

## Scenarios to Demonstrate

- `exportpanel-with-snapshot-history` — Current and several Previous snapshots, every one of them now showing a Copy button in the same row position.
- `exportpanel-nothing-to-fall-back-to` — fresh install: a Current snapshot with its Copy button and an empty Previous list, proving the button does not depend on history existing.
- Copy-confirmed state on Current — the button in its green "Copied ✓" state immediately after a click (the state `snapshotfield-copy-confirmed` already demonstrates in isolation, now visible on the Current field).
- Empty Current — the page before storage resolves, where Current is an empty string: the Copy button renders and copying an empty snapshot is a harmless no-op.