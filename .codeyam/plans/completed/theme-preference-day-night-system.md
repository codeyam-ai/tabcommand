---
title: "Theme Preference: Day, Night, or Follow System"
mode: ui
createdAt: "2026-06-27T16:00:00Z"
source: manual
---

## Summary

Today the light/dark theme is a single binary value: `useTheme` stores `'light'`
or `'dark'` in the `theme` storage key, the sun/moon `ThemeToggle` flips it, and
dark is the hard-coded default. Add a user-configurable **theme preference** with
three values — **Day** (light), **Night** (dark), or **System** (follow the OS
`prefers-color-scheme`, updating live when the OS transitions between day and
night). The preference lives in the Settings gear panel. The sun/moon toggle stays
as a quick **temporary override**: clicking it flips the displayed theme without
changing the saved preference. The override is in-memory only, so it naturally
resets when the popup reopens; additionally, in **System** mode an actual OS
day/night transition clears the override so the display snaps back to following the
system. The default preference for users who haven't chosen one becomes **System**.

## Key Decisions

- **New `themePreference` storage key, owned by `useTheme`** — a string
  `'system' | 'light' | 'dark'`, default `'system'`. Kept as its own top-level
  storage key (not folded into the `settings` object) so the existing
  `useTheme` ownership stays intact and the Settings panel can read/write it
  directly, with `chrome.storage.onChanged` keeping both surfaces in sync (the
  same cross-surface pattern `useTheme` already uses for `theme`).
- **Resolved theme = override ?? (preference === 'system' ? systemTheme : preference)** —
  `useTheme` derives the actual `data-theme` value from three inputs: the saved
  preference, the live system theme, and an in-memory temporary override. Only
  the resolved value is mirrored to `document.documentElement.dataset.theme`, so
  the whole token layer keeps re-theming from one place.
- **Toggle becomes a temporary, non-persisted override** — clicking `ThemeToggle`
  sets an in-memory override instead of writing storage. "At least temporarily
  override" is satisfied because the override always survives within the open
  popup and is dropped when the popup is recreated on reopen.
- **System transition clears the override** — the `matchMedia` `change` handler
  updates the system theme *and* clears any active override, so in System mode a
  real OS day→night flip returns control to the system (per the requested
  behavior). In Day/Night mode there is nothing to follow, so the override simply
  lasts the session.
- **`matchMedia` guarded with a `'dark'` fallback** — mirror `Labels.jsx`'s
  `if (!window.matchMedia) return;` guard. When `matchMedia` is unavailable
  (chrome shim / jsdom test env), the system theme falls back to `'dark'` (the
  CodeYam home), which keeps the "System default resolves to dark" behavior
  identical to today's default in those environments.
- **Default flips to System** — new users match their OS out of the box. A light
  migration seeds `themePreference` from a legacy `theme` value (`'light'`/
  `'dark'`) when present, so a user who previously toggled to light keeps an
  explicit Day preference instead of silently jumping to System.
- **Selector lives in the Settings gear panel** — a compact 3-way segmented
  control (Day / Night / System), always visible (it is independent of the
  `loadDataSource === 'processes'` per-tab-data gate that hides the Warn/Heavy
  sliders).

## Implementation

### 1. Rework `useTheme` to resolve preference + system + override

**File**: `src/lib/hooks/useTheme.js`

- Track three pieces of state: `preference` (`'system' | 'light' | 'dark'`,
  default `'system'`), `systemTheme` (`'light' | 'dark'`), and `override`
  (`null | 'light' | 'dark'`, in-memory only).
- On mount, hydrate `preference` from the `themePreference` storage key. If that
  key is absent but a legacy `theme` value of `'light'`/`'dark'` exists, seed the
  preference from it (and optionally persist the migrated `themePreference`).
- Add a `matchMedia('(prefers-color-scheme: dark)')` effect (guarded like
  `Labels.jsx`): set `systemTheme` from `mq.matches`, listen for `change`, and in
  the handler update `systemTheme` **and** clear `override`. Fall back to
  `systemTheme = 'dark'` when `matchMedia` is unavailable.
- Keep the `chrome.storage.onChanged` listener; extend it to react to
  `themePreference` changes (update `preference`, clear `override`) in addition to
  the existing `theme` handling.
- Compute `resolvedTheme = override ?? (preference === 'system' ? systemTheme : preference)`
  and mirror that to `document.documentElement.dataset.theme`.
- Change `toggleTheme` to set an in-memory override
  (`resolvedTheme === 'light' ? 'dark' : 'light'`) instead of writing storage.
- Preserve the public return shape `[theme, toggleTheme]` (where `theme` is the
  resolved value) so `App` and `ThemeToggle` need no changes.

### 2. Add the theme-preference selector to the Settings panel

**File**: `src/lib/components/Settings/Settings.jsx`

- Add `themePreference` to the panel's local state, hydrated from the
  `themePreference` storage key in the existing `Settings1` `Chrome.get`, and
  followed via the existing `onChanged` handler.
- Render a compact 3-way segmented control (Day / Night / System) in the panel,
  **outside** the `source === 'processes'` gate so it always shows. A new
  string-valued update handler (separate from the numeric `update`, which coerces
  with `Number(...)`) writes the choice via `Chrome.set({ themePreference })`.
- Keep the existing Auto-close and (gated) Warn/Heavy slider rows unchanged.

**File**: `src/lib/components/Settings/Settings.css`

- Add styles for the segmented control (active/inactive segment states), matching
  the existing `Settings-row` / token-driven look.

### 3. Add the default constant

**File**: `src/Constants.jsx`

- Add `export const ThemePreferenceDefault = 'system';` (alongside
  `WarnAtDefault` / `HeavyThresholdDefault`) and reference it from `useTheme` and
  `Settings` so the default has one source of truth.

### 4. Update tests

**File**: `src/lib/hooks/useTheme.test.jsx`

- Update the existing cases for the new model: default preference `'system'`
  with no `matchMedia` resolves to `'dark'` (data-theme assertion still holds);
  hydrate from `themePreference` rather than `theme`; the toggle now flips the
  resolved theme in-memory **without** writing storage (replace the storage
  persistence assertion); two flips still return to the base resolved theme.
- Add cases with a mocked `matchMedia`: preference `'light'`/`'dark'` resolves
  directly; preference `'system'` follows `matchMedia` and a `change` event both
  updates the resolved theme and clears an active override; changing
  `themePreference` in storage updates the resolved theme and clears an override.

**File**: `src/lib/components/Settings/Settings.test.jsx`

- Add cases: the panel renders the Day/Night/System control; selecting an option
  persists `themePreference` to storage; the control reflects the current stored
  preference; the control is visible regardless of `loadDataSource`.

## Reused existing code

- `useTheme` from `src/lib/hooks/useTheme.js` (glossary entry: `useTheme`) — the
  hook being extended to own the preference + override resolution.
- `ThemeToggle` from `src/lib/components/ThemeToggle/ThemeToggle.jsx` (glossary
  entry: `ThemeToggle`) — unchanged; reused as the temporary-override button.
- `Settings` from `src/lib/components/Settings/Settings.jsx` (glossary entry:
  `Settings`) — the gear panel that gains the 3-way selector.
- `Chrome` from `src/lib/utils/Chrome/Chrome.js` (glossary entry: `Chrome`) — the
  storage get/set wrapper used for `themePreference`.
- The `window.matchMedia` add/remove-listener pattern in
  `src/lib/components/Labels/Labels.jsx` (including the `if (!window.matchMedia)`
  guard) — the template for the `prefers-color-scheme` effect.

## Scenarios to Demonstrate

- **System mode, OS in day** — preference System, system reports light → display
  is light (Day).
- **System mode, OS in night** — preference System, system reports dark → display
  is dark (Night).
- **System transition while open** — preference System; OS flips day→night and the
  display follows live.
- **Day preference** — preference Day pins the display light regardless of OS.
- **Night preference** — preference Night pins the display dark regardless of OS.
- **Temporary override** — with preference Night, clicking the sun/moon toggle
  flips to light for the session; preference in Settings still reads Night.
- **Override cleared by system transition** — System mode with an active toggle
  override; an OS day/night transition drops the override and follows the system.
- **Default for a fresh user** — no stored preference → System selected by default.
- **Migration** — a legacy `theme: 'light'` value seeds a Day preference on first
  load.
