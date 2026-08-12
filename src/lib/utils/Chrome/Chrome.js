// Storage abstraction over `chrome.storage`. Every consumer uses this
// callback signature — `get(from, keys, callback)` / `set(from, updates)` /
// `remove(from, keys)` — including the leading `from` debug-label arg and the
// default-hydration rules. The underlying storage is the real extension API in a
// packaged build and the in-app chromeShim everywhere else.
//
// Keys are routed per-area (see utils/storageAreas): `labels` lives in
// `chrome.storage.sync` so groups survive an uninstall, everything else stays
// local. The routing happens underneath this contract — `get`/`set`/`remove`
// take the same arguments they always did, a mixed-area batch fans out and
// re-merges, and `get` still invokes `callback` exactly once.
import { WarnAtDefault, HeavyThresholdDefault } from '../../../Constants';
import { readByArea, writeByArea, removeByArea } from '../storageAccess';

// The default-hydration rules, applied ONCE to the merged cross-area result so
// they behave identically whether a read touched one area or both.
function hydrateDefaults(results, keys) {
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

  // `theme` defaults to "dark" (the CodeYam default). `settings` hydrates the
  // load tunables so every consumer reads concrete warnAt/heavyThreshold values.
  if ((keys === 'theme' || keys.indexOf('theme') > -1) && safeResults.theme == null) {
    safeResults.theme = 'dark';
  }

  if (keys === 'settings' || keys.indexOf('settings') > -1) {
    safeResults.settings = {
      warnAt: WarnAtDefault,
      heavyThreshold: HeavyThresholdDefault,
      ...(safeResults.settings || {}),
    };
  }

  if (safeResults.previousLabels) {
    safeResults.previousLabels = safeResults.previousLabels.filter(l => l);
    for (let i = 0; i < safeResults.previousLabels.length; ++i) {
      delete safeResults.previousLabels[i].timestamp;
    }
  }

  return safeResults;
}

const Chrome = {
  remove: (from, keys) => {
    removeByArea(keys);
  },

  set: (from, updates) => {
    writeByArea(updates);
  },

  get: (from, keys, callback) => {
    readByArea(keys, (results) => {
      callback(hydrateDefaults(results, keys));
    });
  }
};

export default Chrome;
