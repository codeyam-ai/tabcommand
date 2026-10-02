---
title: "Automatically Closed Newest First"
mode: ui
createdAt: "2026-09-30T20:14:08Z"
source: manual
---

## Summary

The sidebar's **Automatically Closed** section lists tabs oldest-first. `sortAutoClosed` in `src/lib/components/Tabs/Tabs.jsx` sorts the `autoClosed` map ascending by close timestamp (`autoClosed[a] - autoClosed[b]`), so the tab the Closer just closed ends up at the bottom, often below the fold. Users come to this list to get back something that was *just* closed, so it should show the most recently closed tab first.

## Key Decisions

- **Flip the comparator in one place.** `sortAutoClosed` feeds both the initial `Chrome.get` load and the `storage.onChanged` update path, and `ungroupedAutoClosed()` / `autoClosedTabUrlLabels()` keep the order of `autoClosedUrlKeys`. So changing the sort to descending reorders the Ungrouped block and the rows inside each group heading, and it orders the group headings by each group's most recent close.
- **Keep the section layout.** Ungrouped still renders above the grouped headings in this section, as it does today. Only the order within the section changes.
- **Out of scope: headings split across runs.** `generateTabUrlLabels` starts a new heading for each consecutive run of a label. If closes from label A and label B are interleaved in time, A's heading can show up twice. That already happens with ascending order and isn't made worse by this change. If it's worth fixing, it belongs in its own plan.
- **The service worker is unchanged.** `autoClosed` stays a `urlKey -> timestamp` map in storage. Ordering is purely a display concern in `Tabs.jsx`.

## Implementation

### 1. Sort auto-closed keys newest-first

**File**: `src/lib/components/Tabs/Tabs.jsx`

In `sortAutoClosed` (inside the mount `useEffect`), change the comparator from `(a, b) => autoClosed[a] - autoClosed[b]` to `(a, b) => autoClosed[b] - autoClosed[a]`. Add a short comment saying the list is most recent first so users can quickly restore what was just closed.

### 2. Pin the order with a test

**File**: `src/lib/components/Tabs/Tabs.test.jsx`

Add the reproduction test below. It seeds two ungrouped auto-closed URLs with different close times and checks that the newer one renders first in the `.Tabs-autoClosed` section.

## Reused existing code

- `Tabs` from `src/lib/components/Tabs/Tabs.jsx` (glossary entry: `Tabs`, tested by `src/lib/components/Tabs/Tabs.test.jsx`)
- `installChromeShim` from `src/lib/utils/chromeShim/chromeShim.js`: the localStorage-backed chrome shim the existing Tabs tests seed through
- `MaxAutoClosedTime` from `src/Constants.jsx`: the retention filter stays as it is

## Reproduction Test

The Automatically Closed section renders the oldest close first when it should render the most recent close first.

**Target**: `src/lib/components/Tabs/Tabs.test.jsx`. Run with `codeyam-editor editor refresh-tests --test Tabs`.

```jsx
// auto-closed tabs list the most recently closed tab first
it('orders the Automatically Closed section newest-first', async () => {
  const now = Date.now();
  seed('activeTabs', []);
  seed('allUrls', ['url-https://old.com', 'url-https://new.com']);
  seed('url-https://old.com', { title: 'Old Close', favicon: '' });
  seed('url-https://new.com', { title: 'New Close', favicon: '' });
  seed('autoClosed', {
    'url-https://old.com': now - 60 * 60 * 1000,
    'url-https://new.com': now - 60 * 1000,
  });
  installChromeShim();
  const { container } = renderTabs();

  await screen.findByText('New Close');
  const section = container.querySelector('.Tabs-autoClosed');
  const text = section.textContent;
  expect(text.indexOf('New Close')).toBeLessThan(text.indexOf('Old Close'));
});
```

Status: PROPOSED. Confirm it fails at execution. Expected failure: with the current ascending sort, 'Old Close' comes before 'New Close' in the section's text, so the `toBeLessThan` assertion fails. The fixture assumes auto-closed rows render their `title` from the seeded url record (the Url component reads it). Check at execution that both titles actually appear in `.Tabs-autoClosed` before trusting the failure.

## Scenarios to Demonstrate

- Several ungrouped auto-closed tabs closed at clearly different times: newest at the top
- A mix of ungrouped and labeled auto-closed tabs: Ungrouped block newest-first, and group headings ordered by their most recent close
- A single auto-closed tab (unchanged)
- Empty state: the explainer copy still shows (unchanged)