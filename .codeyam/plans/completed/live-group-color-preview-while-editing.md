---
title: "Live Group Color Preview While Editing"
mode: ui
createdAt: "2026-07-30T11:55:50Z"
source: manual
---

## Summary

Editing a group today is blind: the ⋮ → Edit group form lets you pick a swatch (or a custom color) and retype the name, but the group card underneath keeps its old color and old title until you hit Save and the card remounts. Make the edit form drive a *live preview* on the card it belongs to — as soon as a swatch is clicked, a custom color is dialed in, or the name is retyped, the card's title bar (and its `--group-color` drag-highlight variable) shows the pending values. Cancel — including the ⋮ toggle and the dismiss overlay — reverts the card to its committed appearance; Save makes the previewed values the card's real ones with no flash back to the old color in between.

## Key Decisions

- **Preview lives in `LabelCollection`, not in global state or storage.** The card already owns `currentBackgroundColor` / `currentTitle` in its `useState` bag, and it already owns the menu's open/closed state (`menuDisplayed`) and the cancel path (`toggleMenu`). Adding `previewBackgroundColor` / `previewTitle` next to them makes revert-on-cancel a one-line state reset and keeps the preview from ever touching `chrome.storage` — a previewed color must not leak to the Chrome tab group or to other surfaces.
- **`LabelForm` reports, it does not reach.** The form gets one new optional callback, `onPreview({ title, backgroundColor })`, fired from a `useEffect` on the derived `previewColor` and `title`. Driving it off `previewColor` (rather than off each swatch's `onClick`) means the preset buttons, the `LabelFormCustomColor` native input, and the length-derived auto-color all feed the preview through a single path — no per-control wiring.
- **Save commits through a second callback, `onSaved`, not by clearing the preview.** If Save merely cleared the preview, the card would repaint the *old* color for the frames between `Chrome.set` and the storage-change re-render — a visible flash of exactly the color the user just replaced. `LabelForm.onSubmit` instead hands the committed `{ title, backgroundColor }` to the card, which promotes them into `currentTitle` / `currentBackgroundColor` as it clears the preview. Storage still remains the source of truth; this only removes the gap.
- **Preview covers color *and* title** (per scope confirmation). An emptied name field falls back to the committed title rather than rendering a blank header.
- **Create mode is unaffected.** `LabelFormContainer` passes neither callback; both props are optional, and the "Add Group" form has no card to preview onto.

## Implementation

### 1. Emit preview + save events from the edit form

**File**: `src/lib/components/LabelForm/LabelForm.jsx`

- Add two optional props, `onPreview` and `onSaved`, to the component signature and to `LabelForm.propTypes` (both `PropTypes.func`).
- After the existing `previewColor` / `isCustom` derivations (lines 21-22), add a `useEffect` keyed on `[title, previewColor]` that calls `onPreview({ title, backgroundColor: previewColor })` when `onPreview` is supplied. Import `useEffect` alongside `useState`. Firing on mount is intentional and harmless — the initial values equal the card's committed ones, so the first preview is a no-op visually.
- In `onSubmit`, compute the committed color once (it is currently computed inline at line 34 as `color || Colors[title.length % Colors.length]`), hoist it to a local, use it for `updatedLabel.backgroundColor`, and call `onSaved({ title, backgroundColor: committedColor })` inside the `Chrome.get` callback right after `Chrome.set`, before the existing `if (onCancel) onCancel();` runs. Keep `onCancel()` where it is (outside the callback) — it is what closes the menu.

Note the ordering subtlety: `Chrome.set` is fire-and-forget and `onCancel` runs synchronously after the `Chrome.get` call is *issued*, so `onSaved` may land after the menu has already closed. That is fine — the card's `onSaved` handler only writes state, it does not depend on the menu being open.

### 2. Thread the callbacks through the menu

**File**: `src/lib/components/LabelCollectionMenu/LabelCollectionMenu.jsx`

Accept `onPreview` and `onSaved`, pass both straight down to the `<LabelForm>` it renders (alongside the existing `onCancel` and `label`), and declare them in `propTypes`. Purely a pass-through; the menu holds no state.

### 3. Hold and apply the preview on the group card

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

- Add `previewBackgroundColor: null` and `previewTitle: null` to the `useState` initializer (around lines 66-77) and destructure them with the rest.
- Add a `handlePreview = ({ title: nextTitle, backgroundColor }) => setPartialState({ previewTitle: nextTitle, previewBackgroundColor: backgroundColor })`.
- Add a `handleSaved = ({ title: savedTitle, backgroundColor }) => setPartialState({ currentTitle: savedTitle, currentBackgroundColor: backgroundColor, previewTitle: null, previewBackgroundColor: null })`.
- In `toggleMenu` (line 284), clear the preview on *both* branches — the close branch (`{ menuDisplayed: false, menuAnchor: null }`) and the open branch — so cancelling, clicking the dismiss overlay, or re-clicking ⋮ all revert the card. `toggleMenu` is already the single handler behind the Cancel button, the overlay, and the ⋮ button, so one change covers every dismissal path.
- Derive the displayed values once, near the existing `titleCounts` block, and use them at the three render sites that currently read the committed values:
  - `displayedColor = previewBackgroundColor || currentBackgroundColor` → the `--group-color` custom property on the dropzone (lines 386-390) and the title bar's `backgroundColor` (line 394, keeping the `|| '#707071'` fallback).
  - `displayedTitleText = previewTitle || currentTitle || title` → the `<h3>` at line 398. The `||` chain is deliberate: an emptied name field previews as the committed title rather than an empty header.
- Pass `onPreview={handlePreview}` and `onSaved={handleSaved}` into `<LabelCollectionMenu>` in the `menu()` helper (lines 339-348). Leave `backgroundColor={currentBackgroundColor}` as-is — the form must seed from the committed color, never from a preview, or a cancelled edit would reopen pre-dirtied.

Do **not** touch the element `key`s or the `id={`LabelCollection-${title}`}` — those still derive from the committed props. `Labels.jsx` keys each card `labelCollection-${label.title}-${label.backgroundColor}` (lines 197, 224), so a real save still remounts the card from storage; step 3's `handleSaved` exists only to make the intervening frames correct, and the remount lands on the same values.

### 4. Tests

**File**: `src/lib/components/LabelForm/LabelForm.test.jsx`

- A test that clicking a preset swatch invokes `onPreview` with that color and the current title.
- A test that submitting invokes `onSaved` with the committed `{ title, backgroundColor }`, including the length-derived color when no swatch was clicked.

**File**: `src/lib/components/LabelCollection/LabelCollection.test.jsx`

- Open the ⋮ menu, click a swatch, and assert the card's `.LabelCollection-title` inline `backgroundColor` is the previewed color (this file already has a menu-open helper — the existing "dismisses the open menu when the overlay is clicked" and "portals the open menu out of the clipping card" tests both open it).
- Then click Cancel (or the overlay) and assert the title bar is back to the original color and the original heading text — the revert guarantee, which is the half most likely to regress.

Run with `codeyam-editor editor refresh-tests --test <name>`.

## Reused existing code

- `LabelForm` from `src/lib/components/LabelForm/LabelForm.jsx` (glossary: the form's `previewColor` derivation is the single source the new `onPreview` rides on) — no new color-derivation logic is introduced.
- `LabelFormCustomColor` from `src/lib/components/LabelForm/LabelFormCustomColor.jsx` (glossary entry: `LabelFormCustomColor`) — already renders `previewColor` as a live dot; it needs no change because its `onSelect` feeds the same `color` state the new effect watches.
- `setPartialState` in `src/lib/components/LabelCollection/LabelCollection.jsx` — the existing merge-into-the-state-bag helper; all new state writes go through it rather than adding a second `useState`.
- `toggleMenu` in `src/lib/components/LabelCollection/LabelCollection.jsx` — already the one handler behind Cancel, the dismiss overlay, and the ⋮ button, which is why revert-on-cancel is a single edit.
- The `--group-color` custom property already set on `LabelCollection-dropzone` — the drag-over highlight follows the preview for free.

**Existing-implementation survey:** grepped `src/` for any existing preview/pending-color mechanism (`preview`, `pending`, `draft` against color/label state). The only `preview*` identifiers are `previewColor` inside `LabelForm`/`LabelFormCustomColor`, which is form-local and never reaches the card. There is no existing card-level preview, no draft-label store, and nothing in `chrome.storage` that holds an uncommitted label — so this is genuinely new state, not a duplicate of an existing seam. `service_worker.js`'s `mapColors` is untouched: preview never writes storage, so the Chrome tab-group color cannot follow a preview.

## Scenarios to Demonstrate

- **Edit menu open, swatch clicked** — card title bar renders the newly picked preset while the form is still open and unsaved.
- **Custom color dialed in** — the custom-color pill's dot and the card title bar show the same non-preset hex.
- **Name retyped alongside the color** — card header shows the pending title and the pending color together.
- **Name cleared to empty** — card header falls back to the committed title instead of rendering blank.
- **Cancelled edit** — after picking a color and clicking Cancel, the card is back to its committed color and title.
- **Dismissed via the overlay** — same revert, through the click-outside path rather than the Cancel button.
- **Saved edit** — after Save, the card shows the new color/title with no intermediate frame of the old color.
- **Create-group form (`LabelFormContainer`)** — unchanged: no card exists to preview onto, and the form works exactly as before.
- **Drag-over highlight during preview** — a group card being previewed highlights in the previewed color when a tab is dragged over it.