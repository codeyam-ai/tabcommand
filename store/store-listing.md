# TabCommand — Chrome Web Store listing copy

Paste-ready text for the Web Store listing form. Character limits noted per field.

---

## Item name  (max 75 chars)

```
TabCommand — Tab Manager & Browser Load Monitor
```

## Summary / short description  (max 132 chars — shown in search & cards)

```
Organize, search, and auto-close your tabs — with a live browser-load gauge that flags the heavy tabs slowing Chrome down.
```

## Category

Productivity  (suggested)

## Language

English (United States)

---

## Detailed description  (max 16,000 chars)

```
TabCommand is command central for your browsing. It turns a wall of tabs into
an organized, searchable board — and tells you exactly which tabs are dragging
your browser down.

ORGANIZE INTO GROUPS
Sort tabs into color-coded groups like Work, Reading, Shopping, and Social.
See open and saved tabs side by side, and choose a 2-, 3-, or 4-column layout
that fits your screen.

FIND ANYTHING INSTANTLY
Just start typing. The universal search jumps to any open, saved, or
previously closed tab in a keystroke — no more hunting through a crowded tab
strip.

SEE WHAT'S SLOWING YOU DOWN
A live Browser Load gauge shows real-time CPU and memory use, and a "Heaviest
Tabs" panel ranks the tabs eating the most resources. When things get hot,
TabCommand flags it and offers to review the worst offenders in one click.

AUTO-CLOSE THE CLUTTER
Set tabs to close automatically after they've sat inactive — 15 minutes to a
few hours, or off entirely. Anything auto-closed is parked in a list you can
restore from at any time. Nothing is lost.

NEVER LOSE A TAB
Favorites keep your go-to sites one click away, and History remembers every
tab you've closed or visited so you can reopen it whenever you need it.

YOURS, AND PRIVATE
Day, Night, and System themes. One-click Import / Export to back up and
restore your groups and settings. TabCommand stores everything locally in your
browser — it does not collect, transmit, or sell your data.

Built with codeyam. Open source: https://github.com/codeyam-ai/tabcommand
```

---

## Single-purpose description  (required by Google)

```
TabCommand helps users organize, search, monitor, and automatically clean up
their open browser tabs from a single dashboard.
```

## Permission justifications  (required — one per requested permission)

| Permission | Justification to paste |
|---|---|
| `tabs` | Read tab titles and URLs to display, search, group, restore, and close the user's tabs. |
| `tabGroups` | Create and manage Chrome tab groups that mirror the user's TabCommand groups. |
| `storage` | Persist the user's groups, favorites, history, and settings locally. |
| `alarms` | Schedule the periodic check that auto-closes tabs left inactive. |
| `system.cpu` | Display the overall browser CPU load in the Browser Load gauge. |
| `system.memory` | Display the overall browser memory load in the Browser Load gauge. |

## Data usage disclosures  (Privacy tab)

- Does this item collect or use user data? **No data is collected or transmitted.**
  All data (groups, favorites, history, settings) is stored locally via
  `chrome.storage.local` and never leaves the user's machine.
- Check **none** of the data-collection categories.
- Certify compliance with the Developer Program Policies.
- Privacy policy URL: only required if you later collect data; not needed while
  the answer above is "no data collected." (A short hosted privacy page never hurts.)
