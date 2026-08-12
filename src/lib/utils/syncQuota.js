// Sync-area quota accounting for `labels`.
//
// `chrome.storage.sync` caps a SINGLE item at `QUOTA_BYTES_PER_ITEM` = 8,192
// bytes (the key plus its JSON-serialized value) and the whole area at
// `QUOTA_BYTES` = 102,400. A write past the per-item cap fails; if that failure
// is swallowed, the user's groups silently stop being backed up while the UI
// keeps showing them — the one outcome worse than the local-only behavior this
// replaces, because it LOOKS like it worked.
//
// So every sync write of `labels` is measured first. An oversized value is
// written to local instead and the fallback is surfaced to the user on the
// Import / Export page, where the export that recovers it already lives.
//
// Pure and `chrome`-free so the sizing rule is unit-testable without stubbing
// the extension APIs.

// Chrome's documented per-item cap.
export const SYNC_ITEM_QUOTA_BYTES = 8192;

// The cap we actually enforce. The margin absorbs the key name, Chrome's own
// serialization overhead, and a group or two of growth between the check and
// the next write — so we fall back deliberately rather than discovering the
// limit as a runtime error.
export const SYNC_ITEM_SAFE_BYTES = 7168;

// Byte length of `key` plus its JSON encoding, measured the way the quota is:
// in UTF-8 bytes, not UTF-16 code units. Group titles are user-supplied and
// routinely non-ASCII (emoji in a group name is common), where `String.length`
// undercounts by up to 3x.
export function serializedByteLength(key, value) {
  const serialized = `${key}${JSON.stringify(value === undefined ? null : value)}`;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(serialized).length;
  }
  // Fallback for environments without TextEncoder: count UTF-8 bytes directly.
  return unescape(encodeURIComponent(serialized)).length;
}

// Whether this item is small enough to write to sync under the enforced margin.
export function fitsSyncItemQuota(key, value) {
  return serializedByteLength(key, value) <= SYNC_ITEM_SAFE_BYTES;
}

export default fitsSyncItemQuota;
