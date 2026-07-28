// Drop `deletedUrls` tombstones older than `ttlMs`, returning a new map.
//
// A tombstone exists for one reason: to outlive an in-flight
// `chrome.tabs.onRemoved` -> `closeUrl` that already read a pre-delete `allUrls`
// snapshot and would otherwise write a just-deleted key back at index 0. That
// window is milliseconds, so nothing needs to be remembered for long — and
// without pruning the map would accumulate one entry per page ever deleted and
// grow without bound.
//
// Pure and total: an absent/empty map yields `{}`, and an entry with a missing
// or non-numeric timestamp is treated as expired rather than kept forever, so a
// corrupt write can't pin a key out of history permanently.
const pruneDeletedUrls = (deletedUrls, now, ttlMs) => {
  const cutoff = now - ttlMs;
  const pruned = {};
  for (const urlKey in deletedUrls || {}) {
    const deletedAt = deletedUrls[urlKey];
    if (typeof deletedAt === 'number' && deletedAt >= cutoff) pruned[urlKey] = deletedAt;
  }
  return pruned;
};

export default pruneDeletedUrls;
