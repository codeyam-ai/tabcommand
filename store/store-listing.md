# TabCommand — Chrome Web Store listing copy

Paste-ready text for the Web Store listing form. Character limits noted per field.
Prepared for a **Public** listing of version **0.19**.

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

Productivity

## Language

English (United States)

## URLs — three separate fields, don't mix them up

| Field | Where in the dashboard | Value |
|---|---|---|
| **Homepage URL** | Store listing → Additional fields | `https://github.com/codeyam-ai/tabcommand` |
| **Support URL** | Store listing → Additional fields | `https://github.com/codeyam-ai/tabcommand/issues` |
| **Privacy policy URL** | **Privacy tab** (different tab) | `https://codeyam.com/tabcommand/privacy` |

The Support URL is **not** the privacy policy. It's where a user goes when
something is broken — it must give them a way to actually reach you. GitHub
Issues is enabled on the repo and works for this. Sending "Support" to a legal
page leaves users with nowhere to report a bug.

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
previously closed tab in a keystroke. Results come back organized the same way
your tabs are — matching groups first, then grouped tabs, then anything
archived — so you always know where a result lives before you click it.

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

## Screenshots  (1280×800, upload in this order)

**The Web Store allows a maximum of 5 screenshots.** These are exactly 5 — don't add more.

| # | File | Shows |
|---|---|---|
| 1 | `01-tab-groups.png` | Color-coded groups, open + saved tabs side by side |
| 2 | `02-search-everything.png` | Universal search with results grouped by group |
| 3 | `03-browser-load-gauge.png` | Browser Load gauge at 93%, "Running hot", Heaviest Tabs |
| 4 | `04-auto-close-settings.png` | Settings popover: theme, thresholds, auto-close, columns |
| 5 | `05-history.png` | History — reopen any closed tab |

(A dark-mode shot was cut to fit the 5-screenshot cap — it was the least
differentiating of the six.)

## Promotional tiles

| Asset | File | Size | Required? |
|---|---|---|---|
| Small promo tile | `promo/small-tile-440x280.png` | 440×280 | **Yes — required to publish** |
| Marquee promo tile | `promo/marquee-1400x560.png` | 1400×560 | No, but required to be eligible for marquee featuring |

---

## Single-purpose description  (required by Google)

```
TabCommand helps users organize, search, monitor, and automatically clean up
their open browser tabs from a single dashboard.
```

## Permission justifications

The dashboard gives you **one textarea per permission** requested in the manifest.
Paste these verbatim. Each names the concrete feature, says why the permission is
required, and states the limits on its use — that combination is what gets a
justification accepted on the first pass. Vague one-liners ("needed for the
extension to work") are the most common cause of a rejection round-trip.

**TabCommand requests no host permissions, has no content scripts, and uses no
`scripting` permission.** That's a strong review story — say so if given the chance.

### `tabs`

```
TabCommand is a dashboard for managing the user's own tabs, so tab access is its
core requirement. It uses chrome.tabs to read tab titles, URLs, and favicons in
order to list the user's open tabs, search across them, sort them into
color-coded groups, and show open vs. saved tabs side by side. It also acts on
tabs at the user's direction: creating a tab when they reopen something from
Favorites or History (chrome.tabs.create), switching to a tab they select
(chrome.tabs.update), closing tabs they dismiss and auto-closing tabs left
inactive (chrome.tabs.remove), and adding or removing tabs from groups
(chrome.tabs.group / ungroup). It subscribes to tab events (onCreated,
onUpdated, onRemoved, onMoved, onActivated, onReplaced) so the dashboard stays
in sync when the user changes tabs outside the extension.

Tab titles and URLs are used only to display and organize tabs locally on the
user's device. TabCommand does not read page content, does not inject scripts,
and does not transmit browsing activity anywhere. Without this permission the
extension cannot function at all.
```

### `tabGroups`

```
TabCommand mirrors the user's groups into native Chrome tab groups, so a group
created in TabCommand appears in the real Chrome tab strip. This permission is
required to read existing groups (chrome.tabGroups.query / get), to set a
group's title and color when the user names or recolors it
(chrome.tabGroups.update), and to listen for group changes made outside the
extension (onCreated, onUpdated) so the dashboard does not drift out of sync
with Chrome. It is used together with chrome.tabs.group / ungroup and for no
other purpose.
```

### `storage`

```
TabCommand saves what the user creates so it survives a browser restart: their
groups and the labels on them, their favorites, the history of tabs they have
closed or visited, and their settings (theme, column layout, auto-close
interval, and browser-load thresholds).

All of this is written to chrome.storage.local on the user's own device. Nothing
is written to a remote server, and no sync storage is used. Without this
permission the extension would forget every group, favorite, and setting the
moment the browser closed.
```

### `alarms`

```
TabCommand can automatically close tabs that have been left inactive for a
user-chosen period (from 15 minutes up to a few hours, or off entirely). The
alarms permission schedules the recurring check that finds those inactive tabs
and closes them.

chrome.alarms is specifically required here because this is a Manifest V3
extension: the service worker is terminated when idle, so setTimeout and
setInterval cannot reliably schedule work into the future. chrome.alarms is the
only mechanism that survives worker termination. It is used solely for this
auto-close check and for no other timing purpose.
```

### `system.cpu`

```
TabCommand displays a live "Browser Load" gauge that tells the user how hard
their browser is working, and warns them when it is running hot so they can
close heavy tabs. chrome.system.cpu supplies the CPU utilization figure shown
in that gauge and the threshold that triggers the "running hot" warning.

The value is read only to render a number in the extension's own UI on the
user's device. It is never transmitted, stored remotely, or associated with any
identity.
```

### `system.memory`

```
This is the memory half of the same Browser Load gauge. chrome.system.memory
supplies total and available memory, which TabCommand uses to compute the memory
utilization shown in the gauge and to rank entries in the "Heaviest Tabs" panel
so the user can see what is consuming their resources.

As with CPU, the value is read only to render the extension's own UI locally. It
is never transmitted, stored remotely, or associated with any identity.
```

## Remote code use  (separate question on the Privacy tab)

Answer: **No, I am not using remote code.**

```
All JavaScript is bundled inside the extension package. TabCommand loads no
remotely-hosted scripts and uses no eval() or new Function().
```

*(Verified: no `eval` / `new Function` anywhere in the shipped bundle, and no
remote script tags.)*

## TabCommand makes zero network requests  (v0.16 and later)

As of **0.16**, the extension makes **no network requests at all** — verified by
loading the app with a request interceptor attached and observing zero
non-local requests.

Earlier builds fetched Roboto and IBM Plex from `fonts.googleapis.com` and an
(unused) Font Awesome stylesheet from `cdnjs.cloudflare.com`. Those were
stylesheets rather than remote *code*, so they never affected the "remote code"
answer — but they did reveal each user's IP address to Google and Cloudflare on
every open, which contradicted the privacy policy's promise that TabCommand
sends nothing to any third party. All fonts are now bundled in the package.

This is worth stating plainly in the listing and to any reviewer: it is a
stronger privacy claim than most tab managers can make, and it is now literally
true rather than nearly true.

## Data usage disclosures  (Privacy tab)

- **Privacy policy URL** (required — see note below):
  `https://codeyam.com/tabcommand/privacy`
- Does this item collect or use user data? **No data is collected or transmitted.**
  All data (groups, favorites, history, settings) is stored locally via
  `chrome.storage.local` and never leaves the user's machine.
- Check **none** of the data-collection categories.
- Certify compliance with the Developer Program Policies.

> **Why a privacy policy is required even though nothing is collected.** The
> `tabs` permission gives TabCommand access to tab URLs, which Chrome Web Store
> policy classifies as *personal and sensitive user data* (web browsing
> activity). Google requires a posted privacy policy for any item that **handles**
> such data — handling it locally still counts.
>
> The policy is a page on the CodeYam site, served from
> `dashboard/app/routes/tabcommand.privacy.tsx` in the `codeyam-local` repo. Do
> **not** use `https://codeyam.com/privacy` — that is the company/website policy
> and it describes analytics and device identifiers that TabCommand does not
> collect, which would contradict the "no data collected" declaration above.

## Three certification checkboxes (Privacy tab)

All three are true for TabCommand — check each:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes
