---
title: "Obvious Custom Color Button and Shorter Save Label"
mode: ui
createdAt: "2026-07-28T18:16:13Z"
source: manual
---

## Summary

Two polish fixes in the group popup (`LabelForm`, used both for "New group" from the Add Group tile and "Edit group" from a group card's ⋮ menu). First, the custom-color affordance is a bare rainbow circle tucked at the end of the preset swatch row — it reads as "just another color" rather than "open a color picker", so nobody discovers it. Replace it with an explicit, labeled button on its own row beneath the swatches: a preview dot plus the text "Custom color…", still wrapping the native `<input type="color">` so the OS picker opens on click. Second, in edit mode the submit button reads "Save Changes", which wraps to two lines in the narrow popup; shorten it to "Save".

## Key Decisions

- **Keep the native `<input type="color">`, change only its presentation.** The current implementation (`LabelForm.jsx:88-103`) wraps a fully-transparent `<input type="color">` inside a styled `<label>`, which is the only reliable way to open the OS color picker. That mechanism is correct and stays; what changes is the wrapper's shape, position, and the fact that it now carries visible text. No new dependency, no custom picker UI.
- **Move it out of `.LabelForm-colors` onto its own row.** As long as the control sits inside the swatch flex row it will be read as a tenth swatch. A full-width bordered button below the row makes it structurally distinct, which is the actual complaint.
- **Preview dot instead of the conic rainbow gradient.** The rainbow was carrying the "this is a picker" signal on its own; with a text label doing that job, the swatch is better spent showing the *currently chosen* color (`previewColor`, already computed at `LabelForm.jsx:17`). The rainbow gradient CSS is deleted rather than kept unused.
- **"Save", not "Save Changes".** Only the edit-mode string changes. "Create group" stays as-is — it is on the create path, already fits, and is pinned by the first existing test.
- **Selected state stays keyed on `isCustom`.** The existing `isCustom` derivation (`!!color && !Colors.includes(color)`, `LabelForm.jsx:18`) already tells us when a non-preset color is active; the new button reuses it for its `selected` styling, so no new state is introduced.

## Implementation

### 1. Restructure the custom-color control

**File**: `src/lib/components/LabelForm/LabelForm.jsx`

Remove the `<label className='LabelForm-custom'>` block currently nested inside `.LabelForm-colors` (lines 88-103), so that div contains only the nine preset swatch buttons. Render the custom control as a sibling immediately after the closing `</div>` of `.LabelForm-colors`:

```jsx
<label
  className={`LabelForm-custom ${isCustom ? 'selected' : ''}`}
  onClick={(event) => event.stopPropagation()}
>
  <span
    className='LabelForm-customSwatch'
    style={{ backgroundColor: previewColor }}
    aria-hidden='true'
  ></span>
  <span className='LabelForm-customText'>Custom color…</span>
  <input
    type='color'
    className='LabelForm-customInput'
    aria-label='Custom color'
    value={isCustom ? color : previewColor}
    onChange={(event) => {
      event.stopPropagation();
      setColor(event.target.value);
    }}
  />
</label>
```

Notes:
- The `<label>` wrapping the input is what makes clicking anywhere in the button open the picker — do not swap it for a `<button>`, which cannot host the input this way.
- Keep `aria-label='Custom color'` on the input so the existing accessible name is preserved; drop the now-redundant `title='Custom color'` from the label since the text is visible.
- `onClick` still calls `stopPropagation()` — the popup is rendered inside a click-catching overlay context (`LabelFormContainer` / `LabelCollectionMenu`), and removing it would close the popup on picker open.

### 2. Restyle the custom control as a button row

**File**: `src/lib/components/LabelForm/LabelForm.css`

- Rewrite `.LabelForm-custom` (currently a 22px circle with a conic rainbow + radial white gradient) as a full-width row button: `display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; background-color: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-row); cursor: pointer;` plus a hover that matches the Cancel button's treatment (`background-color: var(--search-bg)`). Delete the `background: radial-gradient(...) , conic-gradient(...)` block and the `transform: scale(1.08)` hover — a full-width row should not scale.
- Replace `.LabelForm-custom.selected` (currently `box-shadow: 0 0 0 2px var(--brand-command)` on a circle) with a border-driven selected state: `border-color: var(--brand-command)`, matching how `.LabelForm-nameField:focus-within` signals focus on the sibling row above it.
- Add `.LabelForm-customSwatch` — a 12px circle (`flex: 0 0 auto; width/height: 12px; border-radius: 50%; box-shadow: 0 0 0 1px var(--border);`), deliberately sized to match `.LabelForm-dot` so the two rows align visually.
- Add `.LabelForm-customText` — `font-family: var(--font-sans); font-size: 13px; color: var(--text-primary);`.
- `.LabelForm-customInput` keeps its `position: absolute; inset: 0; opacity: 0` overlay rules unchanged; it now covers the whole row instead of a 22px circle, which is the intended larger hit target.
- Update the file's leading comment (lines 1-2) and the `/* Custom-color picker: rainbow swatch ... */` section comment so they describe the labeled row, not the rainbow swatch.

### 3. Shorten the edit-mode submit label

**File**: `src/lib/components/LabelForm/LabelForm.jsx`

Line 108: `{label ? 'Save Changes' : 'Create group'}` → `{label ? 'Save' : 'Create group'}`.

### 4. Update the edit-path test

**File**: `src/lib/components/LabelForm/LabelForm.test.jsx`

Line 52 queries `screen.getByText('Save Changes')`; flip it to `'Save'` — see the Reproduction Test section. The first test (create path, line 23) is untouched.

### 5. Refresh the glossary description

**File**: `.codeyam/glossary.json` (via `codeyam-editor` glossary tooling — do not hand-edit)

The `LabelForm` entry currently reads "submit button 'Save Changes'". Update to "'Save'" so the registry matches the shipped string.

### 6. Update stale scenario descriptions

**Files**: `.codeyam/scenarios/labelform-edit-empty-title.json`, `.codeyam/scenarios/home-group-menu-open.json`

Both descriptions quote "Save Changes" verbatim. Reword to "Save". `labelform-edit-empty-title`'s point — that the label is driven by mode, not by whether the title input holds text — still stands and should be preserved.

## Reused existing code

- `LabelForm` from `src/lib/components/LabelForm/LabelForm.jsx` (glossary entry: `LabelForm`, tested by `src/lib/components/LabelForm/LabelForm.test.jsx`) — the component being changed; `previewColor` (line 17) and `isCustom` (line 18) are both reused as-is by the new button.
- `.LabelForm-dot`, `.LabelForm-nameField`, `.LabelForm-cancel` from `src/lib/components/LabelForm/LabelForm.css` — the new row's padding, border, radius, hover, and 12px dot are all copied from these existing rules so the control reads as native to the form.
- Design tokens `--card-bg`, `--border`, `--r-row`, `--search-bg`, `--brand-command`, `--font-sans`, `--text-primary`, `--t-fast` — already in use throughout this stylesheet; no new tokens.
- `LabelFormContainer` (glossary entry: `LabelFormContainer`) and `LabelCollectionMenu` — the two call sites; neither passes anything that affects this change, so no call-site edits are needed.
- **Existing-implementation survey**: grepped `src/` for any other custom-color / color-picker affordance and for any existing labeled-row button pattern. There is no other `input[type=color]` in the codebase and no shared "picker row" component — nothing equivalent exists to reuse, so the row is built from the local CSS conventions above rather than a shared primitive. No component other than `LabelForm.test.jsx` references the string "Save Changes" in `src/`.

## Reproduction Test

Pins that the edit-mode submit button reads "Save" rather than the two-line-wrapping "Save Changes".

**Target**: `src/lib/components/LabelForm/LabelForm.test.jsx` — run with
`codeyam-editor editor refresh-tests --test LabelForm`.

**Change to an existing test**: `renames an existing label, deleting the old key` (line 42). Flip the button query on the edit path:

```diff
     const input = screen.getByPlaceholderText('Group Title');
     await userEvent.clear(input);
     await userEvent.type(input, 'Office');
-    await userEvent.click(screen.getByText('Save Changes'));
+    await userEvent.click(screen.getByText('Save'));
```

Status: PROPOSED — confirm red at execution. Expected failure: before the fix the button still renders "Save Changes", and `getByText('Save')` matches by full normalized text content, so it throws `TestingLibraryElementError: Unable to find an element with the text: Save` and the test fails before reaching the storage assertions.

The custom-color restructure has no unit-level repro — it is a presentation change (an unlabeled circle becoming a labeled row) with identical `setColor` behavior, so there is no assertion that is red before and green after. Demonstrate it via the scenarios below. Optionally add a non-red-first assertion alongside the fix that `screen.getByText('Custom color…')` is present, to pin that the affordance is now labeled at all.

## Scenarios to Demonstrate

- **Edit mode, preset color** — an existing group ("Work") with a `Colors` value selected: header "Edit group", checked preset swatch, the new "Custom color…" row below showing that same color in its dot, submit button reading "Save" on one line.
- **Edit mode, custom color** — an existing group whose `backgroundColor` is not in `Colors`: no preset swatch checked, the "Custom color…" row in its selected state with the custom hue in its dot.
- **Create mode, nothing typed** — the Add Group tile expanded: header "New group", empty title, no swatch selected, the "Custom color…" dot showing the length-derived fallback hue, submit button "Create group".
- **Create mode, title typed** — a title entered but no color picked: the name dot and the custom-row dot both show the same auto-derived color, confirming they stay in sync.
- **Edge: empty title in edit mode** — an existing group with the title input cleared; the button still reads "Save" because the label is driven by mode, not input content.
- **Narrow popup width** — the edit popup as rendered from a group card's ⋮ menu, confirming "Save" fits on one line and the full-width custom row does not overflow the popup.