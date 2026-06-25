// TabCommand toolbar launcher: opens the full-page app in a pinned tab,
// reusing an existing one if it's already open, then closes the popup.
function init() {
  chrome.tabs.query({ windowType: chrome.tabs.WindowType.NORMAL }, async (tabs) => {
    const tabCommandUrl = chrome.runtime.getURL("index.html");
    const existingTab = tabs.filter((tab) => tab.url === tabCommandUrl)[0];

    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true }, () => {});
    } else {
      chrome.tabs.create({ url: tabCommandUrl, index: 0, pinned: true });
    }
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
