// Pure document-shaping for the Search minisearch index, factored out of the
// Search component so it's testable independent of minisearch and Chrome storage.
//
// `buildSearchDocuments` turns the stored `labels` map into the synchronous half
// of the index: one document per label (`id: "label-<title>"`, carrying the
// label color) plus a `labelMap` of every labeled `urlKey` → its label title.
// The component feeds `labelMap`'s keys to `Chrome.get` and passes the resulting
// per-URL records to `buildUrlDocuments`, which builds one document per labeled
// URL. URL records that are missing or malformed are skipped (mirrors the
// reference's try/catch) so a partially-seeded store never throws.

export const buildSearchDocuments = (labels) => {
  const labelDocuments = [];
  const labelMap = {};

  for (const label of Object.values(labels || {})) {
    labelDocuments.push({
      id: `label-${label.title}`,
      labelTitle: label.title,
      color: label.backgroundColor,
    });
    for (const urlKey of label.urlKeys || []) {
      labelMap[urlKey] = label.title;
    }
  }

  return { labelDocuments, labelMap };
};

export const buildUrlDocuments = (labelMap, urlRecords) => {
  const documents = [];
  const records = urlRecords || {};

  for (const urlKey of Object.keys(labelMap || {})) {
    const record = records[urlKey];
    if (!record) continue;

    documents.push({
      id: urlKey,
      urlLabelTitle: labelMap[urlKey],
      urlTitle: record.title || record.url,
      url: record.url,
      favicon: record.favicon,
      notes: record.notes,
    });
  }

  return documents;
};
