# TabCommand

[![CI](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml/badge.svg)](https://github.com/codeyam-ai/tabcommand/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Complete Tab, Bookmark, and History Control**

TabCommand is a chrome extension designed to provide complete control over your tabs, bookmarks, and history. It features favorites, grouping, and auto-close settings.

<p align="center">
  <img src=".codeyam/scenarios/screenshots/labels-populated--desktop.png" alt="TabCommand showing colorful labeled tab groups" width="100%">
  
</p>

<!-- codeyam:run-and-edit:start -->
## Developing & Contributing to TabCommand

TabCommand was developed with the [CodeYam Editor](https://codeyam.com). The CodeYam Editor ensures that TabCommand is easy to maintain. If you would like to edit or contribute to TabCommand please use the CodeYam Editor.

The CodeYam Editor ensures there is a robust and up-to-date test suite and generates and captures simulations for TabCommand. These simulations allow you to easily feed mock data into TabCommand to see how it works. 

Prerequisites: **Node 22+** and npm.

```bash
# Install the CodeYam Editor
npm install -g @codeyam-editor/codeyam-editor@latest

# Clone the tabcommand repo
git clone https://github.com/codeyam-ai/tabcommand && cd tabcommand

# Launch the editor (split-screen terminal + live preview)
codeyam-editor start
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
select the `build/` folder. Unpacked extensions don't auto-update — re-run `npm run build`
and reload the extension to pick up changes.


<!-- codeyam:scenario-gallery:start -->
## Scenario gallery

States captured as runnable scenarios with codeyam-editor:

### History - Populated

<img src=".codeyam/scenarios/screenshots/history-populated--desktop.png" alt="History - Populated" width="280">

### Home - Automatically Closed

<img src=".codeyam/scenarios/screenshots/home-automatically-closed--desktop.png" alt="Home - Automatically Closed" width="280">

### Home - Dark Mode

<img src=".codeyam/scenarios/screenshots/home-dark-mode--desktop.png" alt="Home - Dark Mode" width="280">

### Home - Dragging Tab onto Group

<img src=".codeyam/scenarios/screenshots/home-dragging-tab-onto-group--desktop.png" alt="Home - Dragging Tab onto Group" width="280">

### Home - Empty

<img src=".codeyam/scenarios/screenshots/home-empty--desktop.png" alt="Home - Empty" width="280">

### Home - Four Columns

<img src=".codeyam/scenarios/screenshots/home-four-columns--desktop.png" alt="Home - Four Columns" width="280">

### Home - Grouped

<img src=".codeyam/scenarios/screenshots/home-grouped--desktop.png" alt="Home - Grouped" width="280">

### Home - Light Theme

<img src=".codeyam/scenarios/screenshots/home-light-theme--desktop.png" alt="Home - Light Theme" width="280">
<!-- codeyam:scenario-gallery:end -->

## License

[MIT](./LICENSE) © 2026 NodLabs Inc.
