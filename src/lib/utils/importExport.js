// Pure transforms behind the Import / Export page. The page's `useEffect` and
// `saveImport` keep the impure Chrome.get/set orchestration; these functions are
// the testable core of the export serialization and import parsing. These mirror
// the page's `sortAndStuff` / `saveImport` orchestration (see utils/urlDetails.js
// for the analogous URL Details split).

// Sort a labels map into the canonical export order: by title (locale compare),
// then by position. The two chained sorts make the stable position sort win,
// with title as the tiebreaker among equal positions.
export function sortLabels(labels) {
  return Object.values(labels)
    .sort((a, b) => a.title.localeCompare(b.title))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

// The de-duplicated list of urlKeys across the sorted labels — the exact set the
// page hands to `Chrome.get` to resolve each per-URL object before serializing.
export function collectUrlKeys(sortedLabels) {
  const labelUrlKeys = [];
  for (const label of sortedLabels) {
    for (const urlKey of label.urlKeys) {
      if (labelUrlKeys.indexOf(urlKey) === -1) {
        labelUrlKeys.push(urlKey);
      }
    }
  }
  return labelUrlKeys;
}

// Attach each label's resolved `urls` array from the per-URL info map and drop
// `urlKeys`, returning the labels ready to JSON.stringify into the export. Each
// url carries url/title/favicon, plus notes only when present. Mutates the
// passed labels — callers pass the freshly-sorted array.
//
// A urlKey with NO per-URL record is expected, not exceptional, now that
// `labels` lives in `chrome.storage.sync` while the `url-*` records stay local:
// once an uninstall restores the groups from sync, the local records they point
// at are gone. The urlKey itself is `url-<the url>`, so the URL — the only part
// of the record that cannot be re-derived — is recovered from the key, and the
// title/favicon repopulate on the next visit to the page.
//
// Reconstructing beats both alternatives. Dereferencing the missing record threw
// and took the entire Export panel down, leaving the user no way to back up the
// groups they had just recovered. Skipping the member would be worse than the
// crash: the export would look complete while silently dropping URLs from the
// backup.
export function resolveLabelUrls(sortedLabels, urlInfoByKey) {
  for (const label of sortedLabels) {
    label.urls = [];
    for (const urlKey of label.urlKeys) {
      const urlInfo = urlInfoByKey[urlKey] || {};
      const url = {
        url: urlInfo.url || urlKey.replace(/^url-/, ''),
        title: urlInfo.title || '',
        favicon: urlInfo.favicon || '',
      };
      if (urlInfo.notes) {
        url.notes = urlInfo.notes;
      }
      label.urls.push(url);
    }
    delete label.urlKeys;
  }
  return sortedLabels;
}

// Build the storage updates map from an export: one per-URL object per
// `url-<url>` key plus the rebuilt `labels` map.
//
// Accepts either the raw pasted JSON string or an already-parsed, already-
// validated label list. The page takes the second form — `parseImportSnapshot`
// does the reading, because reading a snapshot that a transport medium damaged
// is a whole escalation ladder rather than one `JSON.parse`, and because the
// shape has to be checked BEFORE anything is written. The string form is kept
// for callers that hold intact JSON and want the parse for free.
export function buildImportUpdates(importLabels) {
  const labelsArray = typeof importLabels === 'string'
    ? JSON.parse(importLabels)
    : importLabels;

  const updates = {};
  const labels = {};
  for (const label of labelsArray) {
    const urlKeys = [];
    for (const urlInfo of label.urls) {
      const urlKey = `url-${urlInfo.url}`;
      urlKeys.push(urlKey);
      updates[urlKey] = {
        url: urlInfo.url,
        title: urlInfo.title,
        favicon: urlInfo.favicon,
      };
      if (urlInfo.notes) {
        updates[urlKey].notes = urlInfo.notes;
      }
    }
    label.urlKeys = urlKeys;
    delete label.urls;
    labels[label.title] = label;
  }

  updates.labels = labels;
  return updates;
}
