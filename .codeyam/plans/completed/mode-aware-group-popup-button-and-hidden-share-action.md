---
title: "Mode-Aware Group Popup Button and Hidden Share Action"
mode: ui
createdAt: "2026-07-28T14:55:02Z"
source: manual
---

## Summary

The group popup (`LabelForm`) is used for two different jobs — creating a new group from the "Add Group" tile, and editing an existing group from a group card's ⋮ menu — but its submit button always reads "Create group". Editing an existing group should read "Save Changes". Separately, the ⋮ menu's "Share Group" button is a disabled placeholder for an unshipped feature; hide it entirely for now so the menu only offers actions that actually do something.

## Key Decisions

- **Reuse the existing `label` prop as the mode discriminator.** `LabelForm` already branches on `label` for its header (`label ? 'Edit group' : 'New group'`, `LabelForm.jsx:47`), and the two call sites divide cleanly: `LabelFormContainer` renders `<LabelForm onCancel={...} />` with no `label` (create), `LabelCollectionMenu` renders it with `label={{ title, backgroundColor }}` (edit). No new prop is needed.
- **Match the header's phrasing convention but use the user's wording for the button.** Header stays "Edit group" / "New group"; button becomes "Save Changes" / "Create group". Only the edit-side button label changes; the create-side label is untouched so the existing create test and any muscle memory stay valid.
- **Delete the Share button rather than gating it behind a flag.** There is no feature flag infrastructure in this component and no `LabelCollection-share` CSS rule to clean up (the class is unstyled). Removing the button and its `globe` icon is the smallest reversible change; git history is the record for when sharing ships.

## Implementation

### 1. Make the submit button label mode-aware

**File**: `src/lib/components/LabelForm/LabelForm.jsx`

Line 108 hardcodes the label:

```jsx
<button type='submit' className='LabelForm-create'>Create group</button>
```

Make it depend on `label`, the same discriminator the header on line 47 already uses:

```jsx
<button type='submit' className='LabelForm-create'>{label ? 'Save Changes' : 'Create group'}</button>
```

Leave the `LabelForm-create` class name alone — it is a styling hook, and renaming it would require touching `LabelForm.css` for no user-visible benefit.

### 2. Update the existing edit-path test to the new label

**File**: `src/lib/components/LabelForm/LabelForm.test.jsx`

The "renames an existing label, deleting the old key" test (line 42) renders `<LabelForm label={...} />` and then clicks `screen.getByText('Create group')` at line 52. That query must become `screen.getByText('Save Changes')` — see the Reproduction Test section, which is exactly this flip. The first test (`writes a new label...`, line 23) renders with no `label` prop and keeps clicking `'Create group'` unchanged; together the two tests pin both branches.

### 3. Hide the "Share Group" action

**File**: `src/lib/components/LabelCollectionMenu/LabelCollectionMenuActions.jsx`

Remove the disabled Share button (lines 10-12) so the action list renders only Delete. Drop the now-unused `Icon` import only if Delete no longer needs it — it does still use `Icon name="close"`, so the import stays. Rewrite the file's leading comment (lines 5-7), which currently explains the deliberate disabled-affordance choice ("the affordance is the announcement") — that rationale is now reversed, so the comment must say the opposite: sharing is unshipped and the entry is hidden until it works.

### 4. Update the stale menu comment

**File**: `src/lib/components/LabelCollectionMenu/LabelCollectionMenu.jsx`

Line 8 describes the menu as "rename/recolor the group, then the Share/Delete actions." Drop the Share mention so the comment matches what renders.

## Reused existing code

- `LabelForm` from `src/lib/components/LabelForm/LabelForm.jsx` (glossary entry: `LabelForm`, tested by `src/lib/components/LabelForm/LabelForm.test.jsx`) — the `label ? … : …` ternary pattern on line 47 is the exact precedent for the button change.
- `LabelFormContainer` from `src/lib/components/LabelFormContainer/LabelFormContainer.jsx` (glossary entry: `LabelFormContainer`) — the create-mode call site; confirms it passes no `label`, so `label` is a safe discriminator.
- `Icon` from `src/lib/components/Icon` — retained for the Delete action's `close` icon.
- **Existing-implementation survey**: grepped for any existing mode/variant prop, submit-label prop, or feature-flag mechanism on `LabelForm` and `LabelCollectionMenuActions`. Nothing equivalent exists — `LabelForm` takes only `label` and `onCancel`, `LabelCollectionMenuActions` takes only `onDelete`, and there is no feature-flag utility in `src/lib/utils/`. No CSS rule targets `.LabelCollection-share` anywhere in `src/`, so removing the button leaves no dead styles.

## Reproduction Test

Pins that the popup's submit button reads "Save Changes" when editing an existing group, rather than the create-mode "Create group".

**Target**: `src/lib/components/LabelForm/LabelForm.test.jsx` — run with
`codeyam-editor editor refresh-tests --test LabelForm`.

**Change to an existing test**: `renames an existing label, deleting the old key` (line 42). Flip the button query in the edit-mode path:

```diff
     const input = screen.getByPlaceholderText('Group Title');
     await userEvent.clear(input);
     await userEvent.type(input, 'Office');
-    await userEvent.click(screen.getByText('Create group'));
+    await userEvent.click(screen.getByText('Save Changes'));
```

Status: PROPOSED — confirm red at execution. Expected failure: before the fix, the edit-mode form still renders "Create group", so `screen.getByText('Save Changes')` throws `TestingLibraryElementError: Unable to find an element with the text: Save Changes`, and the test fails before it ever reaches the storage assertions.

## Scenarios to Demonstrate

- **Create mode** — the "Add Group" tile expanded: header "New group", empty title input, submit button reads "Create group".
- **Edit mode** — a group card's ⋮ menu opened on an existing group with a title and color: header "Edit group", title prefilled, selected color swatch checked, submit button reads "Save Changes".
- **Edit mode, menu actions** — the same ⋮ menu showing only "Delete Group" in the action list, with no "Share Group" row above it.
- **Edit mode with a custom color** — an existing group whose `backgroundColor` is not in `Colors`, so the custom swatch is selected; button still reads "Save Changes".
- **Edge: empty title in edit mode** — an existing group whose title has been cleared in the input; the button label is driven by mode, not by input content, so it still reads "Save Changes".