// Pure transforms behind the Import / Export page. The page's `useEffect` and
// `saveImport` keep the impure Chrome.get/set orchestration; these functions are
// the testable core of the export serialization and import parsing. Extracted
// from the faithful port of
// ../tabcommand/src/lib/pages/ImportExport/ImportExport.jsx (`sortAndStuff` /
// `saveImport`), matching the URL Details precedent (utils/urlDetails.js).

// Sort a labels map into the canonical export order: by title (locale compare),
// then by position. Two chained sorts mirror the reference exactly — the stable
// position sort wins, with title as the tiebreaker among equal positions.
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
// url carries url/title/favicon, plus notes only when present (faithful to the
// reference). Mutates the passed labels — callers pass the freshly-sorted array.
export function resolveLabelUrls(sortedLabels, urlInfoByKey) {
  for (const label of sortedLabels) {
    label.urls = [];
    for (const urlKey of label.urlKeys) {
      const urlInfo = urlInfoByKey[urlKey];
      const url = {
        url: urlInfo.url,
        title: urlInfo.title,
        favicon: urlInfo.favicon,
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

// Parse the pasted export JSON and build the storage updates map: one per-URL
// object per `url-<url>` key plus the rebuilt `labels` map. Throws on malformed
// JSON so the page swallows it with a console.log (faithful — no user-facing
// error), exactly as the reference `saveImport` try/catch does.
export function buildImportUpdates(importLabels) {
  const labelsArray = JSON.parse(importLabels);

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
