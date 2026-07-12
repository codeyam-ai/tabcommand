// Pure document-shaping for the Search minisearch index, factored out of the
// Search component so it's testable independent of minisearch and Chrome storage.
//
// `buildSearchDocuments` turns the stored `labels` map into the synchronous half
// of the index: one document per label (`id: "label-<title>"`, carrying the
// label color) plus a `labelMap` of every labeled `urlKey` → its label title and
// a `labelColorMap` of every label title → its color. The component feeds the
// deduped union of `allUrls` and `labelMap`'s keys to `Chrome.get` and passes the
// resulting per-URL records (with the color map) to `buildUrlDocuments`,
// which builds one document per URL across the WHOLE archive — not just labeled
// URLs. `urlLabelTitle` (and its companion `urlLabelColor`) is present only for
// keys that belong to a label; its absence marks an archived (unlabeled) URL,
// and that's the signal used downstream to segment archived hits into their own
// results bucket and to head each grouped sub-section with its color. URL records
// that are missing or malformed are skipped (mirrors the reference's try/catch)
// so a partially-seeded store never throws.

export const buildSearchDocuments = (labels) => {
  const labelDocuments = [];
  const labelMap = {};
  const labelColorMap = {};

  for (const label of Object.values(labels || {})) {
    labelDocuments.push({
      id: `label-${label.title}`,
      labelTitle: label.title,
      color: label.backgroundColor,
    });
    // Same color source the label documents carry, keyed by title so
    // `buildUrlDocuments` can stamp each grouped URL with its group's color
    // even when the group itself didn't match the query.
    labelColorMap[label.title] = label.backgroundColor;
    for (const urlKey of label.urlKeys || []) {
      labelMap[urlKey] = label.title;
    }
  }

  return { labelDocuments, labelMap, labelColorMap };
};

export const buildUrlDocuments = (urlKeys, labelMap, labelColorMap, urlRecords) => {
  const documents = [];
  const records = urlRecords || {};
  const labels = labelMap || {};
  const colors = labelColorMap || {};
  const seen = new Set();

  for (const urlKey of urlKeys || []) {
    // `urlKeys` is expected to be the deduped union, but guard here too — a
    // duplicate id would make minisearch's addAll throw and corrupt its id map.
    if (seen.has(urlKey)) continue;
    const record = records[urlKey];
    if (!record) continue;
    seen.add(urlKey);

    const urlLabelTitle = labels[urlKey];
    documents.push({
      id: urlKey,
      // Present only for labeled URLs; left undefined for archived ones so
      // segmentSearchResults can route the hit to the Archived bucket.
      urlLabelTitle,
      // The group's color, carried alongside the title so SearchResults can
      // head each grouped sub-section without the whole labels map. Undefined
      // for archived URLs (they have no group), mirroring `urlLabelTitle`.
      urlLabelColor: urlLabelTitle ? colors[urlLabelTitle] : undefined,
      urlTitle: record.title || record.url,
      url: record.url,
      favicon: record.favicon,
      notes: record.notes,
    });
  }

  return documents;
};
