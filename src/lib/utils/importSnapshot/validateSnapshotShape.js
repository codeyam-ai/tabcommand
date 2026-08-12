// The line a permissive parse must not cross.
//
// Everything else in this feature exists to accept more input. This module
// exists to refuse it. A permissive PARSE must never become a permissive
// IMPORT: something that reads as JSON but is not an export has to be rejected
// outright, not written as a partial `labels` map over the groups the user
// still has.
//
// The shape rules come straight from what `buildImportUpdates` actually
// requires: it keys the labels map by `label.title` and iterates `label.urls`,
// so an entry missing either is not importable — it would silently produce a
// partial or empty map rather than an error.

// A single export entry, normalized, or null when it is not a label at all.
export function normalizeLabel(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.title !== 'string' || !entry.title.trim()) return null;
  if (!Array.isArray(entry.urls)) return null;

  const urls = [];
  for (const urlInfo of entry.urls) {
    if (!urlInfo || typeof urlInfo !== 'object' || Array.isArray(urlInfo)) continue;
    if (typeof urlInfo.url !== 'string' || !urlInfo.url) continue;
    urls.push(urlInfo);
  }

  // A group with no members is legitimate — an empty group the user made and
  // has not filled yet still belongs in their backup.
  return { ...entry, urls };
}

// The parsed value as an importable label list, or null when it is not an
// export.
//
// An EMPTY array is rejected rather than imported. It is indistinguishable from
// garbage that happened to parse, and importing it would clear every group the
// user currently has — the one outcome this whole feature exists to prevent.
export function asLabelList(value) {
  if (!Array.isArray(value) || value.length === 0) return null;

  const labels = [];
  let dropped = 0;
  for (const entry of value) {
    const label = normalizeLabel(entry);
    if (label) labels.push(label);
    else dropped += 1;
  }

  if (labels.length === 0) return null;
  return { labels, dropped };
}
