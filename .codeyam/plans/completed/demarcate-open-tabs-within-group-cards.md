---
title: "Demarcate Open Tabs Within Group Cards"
mode: ui
createdAt: "2026-06-28T00:00:00Z"
source: manual
---

## Summary

Inside a group card (`LabelCollection`), URLs whose tab is currently open are
already sorted above the saved-only URLs, but the two sections look identical —
same `--card-bg` background, no labels — so a user can't tell at a glance which
of the group's tabs are actually open right now. Add a clear demarcation: a
small "OPEN" subheader (with a count) above the open tabs, and a distinct tinted
background + accent styling for that open section. Saved-only tabs stay plain
below, with no extra header (per the chosen "Header + tinted section" design).

## Key Decisions

- **Reuse the existing active/inactive split.** `LabelCollection` already
  computes `activeUrls` (urlKeys with a matching `activeTabs` entry) and
  `inactiveUrls`, and renders them into `.LabelCollection-urls-active` /
  `.LabelCollection-urls-inactive`. No data/logic change is needed — this is
  purely a presentational addition (a header element + CSS).
- **Header only on the open section.** Chosen over labeling both sections. The
  "OPEN" header renders only when `activeUrls.length > 0`; the saved section
  stays unlabeled so quiet/empty groups don't gain visual noise.
- **Tint via existing theme tokens.** Use `--c-raised` (the established
  "slightly raised surface" token already used for `.Url-hover`,
  `Favorites`, `HistoryRow`) for the open section's background, and the lime
  identity accent (`--c-lime-fg`) for the header dot/label, so it reads as
  "active" and stays correct in both light and dark themes. No new color
  variables.
- **Count comes from `activeUrls.length`**, mirroring the existing card-title
  count badge pattern (`.LabelCollection-count`).

## Implementation

### 1. Add an "OPEN" subheader above the active section

**File**: `src/lib/components/LabelCollection/LabelCollection.jsx`

In the `content()` render (around the `activeUrls.length > 0` block, ~lines
199–222), prepend a header element inside `.LabelCollection-urls-active` (or
immediately above it within the same conditional) showing a small accent dot,
the word "OPEN", and the open-tab count:

```jsx
{activeUrls.length > 0 &&
  <div className='LabelCollection-urls-active'>
    <div className='LabelCollection-section-header LabelCollection-section-open'>
      <span className='LabelCollection-section-dot' />
      <span className='LabelCollection-section-label'>Open</span>
      <span className='LabelCollection-section-count'>{activeUrls.length}</span>
    </div>
    {activeUrls.map((urlKey) => ( /* unchanged Draggable/Url */ ))}
  </div>
}
```

Keep the `inactiveUrls` block unchanged (no header).

### 2. Style the open section: tint + header

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

- Change `.LabelCollection-urls-active` from `background-color: var(--card-bg)`
  to a tinted surface using `var(--c-raised)`, and add a subtle rounded
  container feel (e.g. `border-radius`, and/or a left accent border in
  `--c-lime-fg`) so the open tabs read as a distinct grouped block. Keep the
  existing `padding: 8px`.
- Add `.LabelCollection-section-header` — a small fl/ex row: tiny uppercase
  label, muted/letter-spaced type (`font-size: 10–11px`, `text-transform:
  uppercase`, `letter-spacing`, `color: var(--text-muted)` or `--c-lime-fg`
  for the open variant), `display: flex; align-items: center; gap: 6px`, a
  small bottom margin.
- Add `.LabelCollection-section-dot` — a small (6–7px) `--c-lime-fg` filled
  circle (`border-radius: 50%`) used as the "live/open" indicator.
- Add `.LabelCollection-section-count` — a compact count, styled like a smaller
  echo of `.LabelCollection-count` (translucent/accent pill or plain muted
  number), pushed via `margin-left: auto` or a gap.
- Ensure the tinted `.LabelCollection-urls-active` still sits correctly inside
  the scrollable `.LabelCollection-urls` container and doesn't break the
  `.UrlOver` drag-over background or the selected/expanded layout
  (`.LabelCollections-selected ...`).

### 3. (Optional, within scope) Per-row open affordance

**File**: `src/lib/components/LabelCollection/LabelCollection.css`

If the section tint alone feels weak, give the open `Url` rows a marginally
stronger resting surface (they currently only tint on `.Url-hover`). Prefer a
container-scoped rule (`.LabelCollection-urls-active .Url { ... }`) over editing
`Url.css`, so the change stays local to group cards and doesn't affect `Url`
usage elsewhere (Favorites, Triage, search results). Keep hover behavior intact.

## Reused existing code

- `LabelCollection` from `src/lib/components/LabelCollection/LabelCollection.jsx`
  (glossary entry: `LabelCollection`) — already derives `activeUrls` /
  `inactiveUrls` from `activeTabs`; the plan only adds presentation.
- `Url` from `src/lib/components/Url/Url.jsx` (glossary entry: `Url`) — rendered
  unchanged inside each section.
- Theme tokens `--c-raised`, `--c-lime-fg`, `--text-muted`, `--card-bg` from
  `src/index.css` / `src/lib/styles/theme.css` — reused for the tint, accent
  dot/label, and counts; no new variables introduced.
- Existing count-badge pattern `.LabelCollection-count` in
  `LabelCollection.css` — mirrored for the section count.

## Scenarios to Demonstrate

- **Mixed group** — a group with both open and saved tabs: "OPEN" header + count
  over a tinted block of open rows, plain saved rows below (the happy path).
- **All tabs open** — every member has a live tab: full card is the tinted open
  section with header; no plain section.
- **No tabs open** — all members saved-only: no "OPEN" header, no tint; card
  looks as it does today.
- **Single open tab** — header shows count "1"; verify singular reads cleanly.
- **Empty group** — unchanged "Drag tabs…" empty state, no header.
- **Light and dark themes** — confirm the tint and lime accent have adequate
  contrast and the open section is clearly distinct from the card body in both.
- **Selected/expanded group** — the demarcation still looks right in the
  expanded (`.LabelCollections-selected`) full-width layout.
