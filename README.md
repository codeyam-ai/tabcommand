# TabCommand

[![CI](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml/badge.svg)](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Complete Tab, Bookmark, and History Control**

TabCommand is a chrome extension designed to provide complete control over your tabs, bookmarks, and history. It features favorites, grouping, and auto-close settings.

<p align="center">
  <img src=".codeyam/scenarios/screenshots/labels-populated--desktop.png" alt="TabCommand showing colorful labeled tab groups" width="100%">
  
</p>


## Install TabCommand

TabCommand is available for free in the Chrome Extension store.

[TabCommand Chrome Extensions](https://chromewebstore.google.com/detail/tabcommand/admgekbonebggnabmhcihnmddeeipnlg)


<!-- codeyam:run-and-edit:start -->
## Develop this project with codeyam-editor

This project is built with [codeyam-editor](https://codeyam.com) — code and runnable data scenarios are authored side by side against a live preview.

```bash
# Clone the repo
git clone https://github.com/codeyam-ai/tabcommand && cd tabcommand

# Install codeyam-editor
npm install -g @codeyam-editor/codeyam-editor@latest

# Launch the editor (split-screen terminal + live preview)
codeyam-editor editor
```
<!-- codeyam:run-and-edit:end -->

**Install and Run TabCommand Locally**

```bash
# If the tabcommand repo is not already installed
git clone https://github.com/codeyam-ai/tabcommand && cd tabcommand

# Install dependencies
npm install

# Build tabcommand for installation as a chrome extension
npm run build
```

Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select the `build/` folder. 


After making changes to the code you must re-run `npm run build` and reload the extension from the chrome extensions manager to pick up changes.


<!-- codeyam:scenario-gallery:start -->
## Scenario gallery

States captured as runnable scenarios with codeyam-editor:

### Favorites - Google Doc Survives Search Exclusion

<img src=".codeyam/scenarios/screenshots/favorites-google-doc-survives-search-exclusion--desktop.png" alt="Favorites - Google Doc Survives Search Exclusion" width="280">

### Favorites - Heavy Content Site Rolled Up

<img src=".codeyam/scenarios/screenshots/favorites-heavy-content-site-rolled-up--desktop.png" alt="Favorites - Heavy Content Site Rolled Up" width="280">

### Favorites - SERP Excluded Portal Kept

<img src=".codeyam/scenarios/screenshots/favorites-serp-excluded-portal-kept--desktop.png" alt="Favorites - SERP Excluded Portal Kept" width="280">

### Favorites - Search Engines Excluded

<img src=".codeyam/scenarios/screenshots/favorites-search-engines-excluded--desktop.png" alt="Favorites - Search Engines Excluded" width="280">

### Favorites - Sidebar With View All Link

<img src=".codeyam/scenarios/screenshots/favorites-sidebar-with-view-all-link--desktop.png" alt="Favorites - Sidebar With View All Link" width="280">

### Favorites - Stats Survive URL Eviction

<img src=".codeyam/scenarios/screenshots/favorites-stats-survive-url-eviction--desktop.png" alt="Favorites - Stats Survive URL Eviction" width="280">

### History - Empty

<img src=".codeyam/scenarios/screenshots/history-empty--desktop.png" alt="History - Empty" width="280">

### History - Populated

<img src=".codeyam/scenarios/screenshots/history-populated--desktop.png" alt="History - Populated" width="280">
<!-- codeyam:scenario-gallery:end -->

## License

[MIT](./LICENSE) © 2026 NodLabs Inc.
