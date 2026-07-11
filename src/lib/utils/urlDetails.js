// Pure logic factored out of the UrlDetails page so it can be unit-tested in
// isolation (the page component itself is covered by scenario captures). Each
// function factors out logic that would otherwise live inline in UrlDetails.jsx,
// with no Chrome/storage or React coupling.

// The "Groups" chips are DERIVED, not stored: the titles of every label whose
// `urlKeys` contains this urlKey. Extracted from setPartialState.
export const deriveUrlLabels = (labels, urlKey) => {
  return Object.keys(labels || {}).filter((key) => {
    return labels[key].urlKeys.indexOf(urlKey) > -1;
  });
};

// The object persisted back for one URL on Save. `notes` is included only when
// non-empty. This writes ONLY the four form fields, which intentionally DROPS
// the per-URL `processes` object — it's irrelevant to the saved URL info.
// `edited: true` marks the record as user-curated so the background tab tracker
// (`urlUpdates` in service_worker.js) stops overwriting `title`/`favicon` from
// the live tab.
export const buildUrlInfo = ({ title, url, favicon, notes }) => {
  const updatedUrlInfo = {
    title: title,
    url: url,
    favicon: favicon,
    edited: true
  };

  if (notes && notes.length > 0) {
    updatedUrlInfo.notes = notes;
  }

  return updatedUrlInfo;
};

// The UI-side twin of service_worker.js's `getUrlKey`: records are keyed as
// `url-<url-without-#hash>` (see normalizeUrl.js). Codified here so the re-key
// logic on Save mirrors the service worker's canonical keying rule.
export const getUrlKey = (url) => `url-${String(url).split('#')[0]}`;

// When an edited URL re-keys a record, its group (label) memberships must follow.
// Returns a new labels map where every label whose `urlKeys` contains `oldUrlKey`
// has it replaced by `newUrlKey` (position preserved), de-duplicating if
// `newUrlKey` is already present. Does not mutate the input — fresh `urlKeys`
// arrays for touched labels, matching removeUrlFromLabel's style. Mirrors the
// label drift-healing logic in service_worker.js.
export const reassignUrlKeyInLabels = (labels, oldUrlKey, newUrlKey) => {
  const result = {};
  for (const labelTitle of Object.keys(labels || {})) {
    const label = labels[labelTitle];
    const idx = label.urlKeys.indexOf(oldUrlKey);
    if (idx === -1) {
      result[labelTitle] = label;
      continue;
    }

    let urlKeys;
    if (label.urlKeys.indexOf(newUrlKey) > -1) {
      // New key already recorded elsewhere — drop the stale slot rather than
      // create a duplicate.
      urlKeys = label.urlKeys.filter((key) => key !== oldUrlKey);
    } else {
      urlKeys = label.urlKeys.slice();
      urlKeys[idx] = newUrlKey;
    }

    result[labelTitle] = { ...label, urlKeys: urlKeys };
  }
  return result;
};

// Removing a Groups chip splices this urlKey out of that label's `urlKeys`.
// Returns a new labels map (and a fresh urlKeys array for the touched label) so
// the input is not mutated; the resulting state matches an in-place splice.
export const removeUrlFromLabel = (labels, labelTitle, urlKey) => {
  const label = labels[labelTitle];
  if (!label) return labels;

  return {
    ...labels,
    [labelTitle]: {
      ...label,
      urlKeys: label.urlKeys.filter((key) => key !== urlKey)
    }
  };
};
