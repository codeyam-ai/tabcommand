import { Chrome } from './Chrome';

// Open a tracked URL, or focus it when it is already open — the behavior a
// search result has always had on click. It lived inside
// `SearchResults.handleClick`; the Full Search page needs exactly the same rule,
// so it lives here once rather than being reimplemented (and drifting) there.
//
// The rule, unchanged: if the URL is one of the `activeTabs`, focus that tab
// instead of opening a duplicate. `newTab` (the overlay passes `e.metaKey`)
// forces a new tab and opens it in the background, matching the platform
// convention for a meta-click. When the URL is already open and `newTab` is set,
// nothing happens — a deliberate no-op carried over from the original, so a
// meta-click never duplicates a tab the user already has.
const openUrlKey = (urlKey, url, { newTab = false } = {}) => {
  Chrome.get('openUrlKey1', 'activeTabs', (result) => {
    const activeTab = (result.activeTabs || []).filter(
      (tab) => tab.urlKey === urlKey
    )[0];

    if (activeTab && !newTab) {
      const tabId = parseInt(activeTab.tabKey.split('-')[1]);
      chrome.tabs.update(tabId, { active: true }, () => { });
    } else if (!activeTab) {
      chrome.tabs.create({ url, active: !newTab }, () => { });
    }
  });
};

export default openUrlKey;
