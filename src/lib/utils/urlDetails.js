// Pure logic factored out of the UrlDetails page so it can be unit-tested in
// isolation (the page component itself is covered by scenario captures). Each
// function is a faithful extraction of the inline logic that lived in
// UrlDetails.jsx — same behavior, no Chrome/storage or React coupling.

// The "Groups" chips are DERIVED, not stored: the titles of every label whose
// `urlKeys` contains this urlKey. Extracted from setPartialState.
export const deriveUrlLabels = (labels, urlKey) => {
  return Object.keys(labels || {}).filter((key) => {
    return labels[key].urlKeys.indexOf(urlKey) > -1;
  });
};

// The object persisted back for one URL on Save. `notes` is included only when
// non-empty. Stack/ref assumption: this writes ONLY the four form fields, which
// DROPS the per-URL `processes` object — reproduced verbatim from the reference
// save; it's irrelevant to the seeded captures.
export const buildUrlInfo = ({ title, url, favicon, notes }) => {
  const updatedUrlInfo = {
    title: title,
    url: url,
    favicon: favicon
  };

  if (notes && notes.length > 0) {
    updatedUrlInfo.notes = notes;
  }

  return updatedUrlInfo;
};

// Removing a Groups chip splices this urlKey out of that label's `urlKeys`.
// Returns a new labels map (and a fresh urlKeys array for the touched label) so
// the input is not mutated; the resulting state matches the reference's
// in-place splice.
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
