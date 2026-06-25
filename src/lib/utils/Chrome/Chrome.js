// Storage abstraction over `chrome.storage.local`. Every consumer uses this
// callback signature — `get(from, keys, callback)` / `set(from, updates)` /
// `remove(from, keys)` — including the leading `from` debug-label arg and the
// default-hydration rules. The underlying `chrome.storage.local` is the real
// extension API in a packaged build and the in-app chromeShim everywhere else.
const Chrome = {
  remove: (from, keys) => {
    chrome.storage.local.remove(keys);
  },

  set: (from, updates) => {
    chrome.storage.local.set(updates);
  },

  get: (from, keys, callback) => {
    chrome.storage.local.get(keys, (results) => {
      const safeResults = results || {};

      for (const hashKey of ['labels', 'uxSettings', 'autoClosed']) {
        if ((keys === hashKey || keys.indexOf(hashKey) > -1) && !safeResults[hashKey]) {
          safeResults[hashKey] = {};
        }
      }

      for (const arrayKey of ['activeTabs', 'allUrls', 'previousLabels']) {
        if ((keys === arrayKey || keys.indexOf(arrayKey) > -1) && !safeResults[arrayKey]) {
          safeResults[arrayKey] = [];
        }
      }

      if (safeResults.previousLabels) {
        safeResults.previousLabels = safeResults.previousLabels.filter(l => l);
        for (let i = 0; i < safeResults.previousLabels.length; ++i) {
          delete safeResults.previousLabels[i].timestamp;
        }
      }

      callback(safeResults);
    });
  }
};

export default Chrome;
