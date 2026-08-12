// Area-aware `chrome.storage` access: read, write, and remove across the local
// and sync areas as if they were one store.
//
// Every consumer of storage already goes through either the `Chrome` abstraction
// or the worker's `update` / `getStorage`. Those three delegate here, so the
// local/sync split introduced for `labels` is invisible to the ~20 modules above
// them — including the calls that span the boundary in a single operation:
//
//   Chrome.get('ImportExport2', ['labels', 'previousLabels'], cb)   sync + local read
//   Chrome.set('ImportExport1', buildImportUpdates(...))            url-* local + labels sync
//   update({ labels, activeTabs })                                  sync + local write
//
// A naive per-area switch would silently drop half of each of those. Reads fan
// out and re-merge into ONE callback; writes partition and issue one `set` per
// non-empty area.
//
// Writes to sync are additionally guarded, because sync can refuse a write in
// two ways the local area never could — the item is over quota, or the area is
// unavailable/throttled. Both fall back to a local write and record the outcome
// under `syncStatus`, so a group mutation is never dropped and the degraded
// state is visible to the user rather than silent.

import {
  LOCAL,
  SYNC,
  partitionKeysByArea,
  partitionUpdatesByArea,
} from './storageAreas';
import { fitsSyncItemQuota, serializedByteLength } from './syncQuota';

// The key the fallback outcome is recorded under (local area — a diagnostic
// about sync cannot itself depend on sync working).
export const SYNC_STATUS_KEY = 'syncStatus';

export const SyncStatus = {
  // The most recent sync write landed.
  OK: 'ok',
  // The value exceeded the per-item quota; it was written to local instead.
  TOO_LARGE: 'too-large',
  // Sync rejected the write (signed out, sync disabled, throttled, area quota);
  // it was written to local instead.
  FAILED: 'sync-failed',
};

// Whether the sync area exists at all. It is absent in unit tests that stub only
// `chrome.storage.local`, and in any host that predates the shim's sync support.
// Degrading to local-only there preserves exactly today's behavior rather than
// throwing on `chrome.storage.sync.set` of undefined.
function syncAvailable() {
  return typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage[SYNC]);
}

// Only write `syncStatus` when the status actually changes. `labels` is written
// on ordinary group edits, so recording unconditionally would turn one status
// key into a write on every mutation — the same churn the write coalescing in
// the worker exists to prevent.
let lastRecordedStatus = null;

// Exported for tests, which need each case to start from a known memo state.
export function resetSyncStatusMemo() {
  lastRecordedStatus = null;
}

function recordSyncStatus(status, details) {
  if (lastRecordedStatus === status) return;
  lastRecordedStatus = status;
  chrome.storage[LOCAL].set({
    [SYNC_STATUS_KEY]: { status, ...details, at: Date.now() },
  });
}

// Read `keys` from whichever areas own them and hand the MERGED result to
// `callback` exactly once. Mirrors `chrome.storage.<area>.get`'s argument forms:
// a string, an array, a defaults object, or null for "everything".
export function readByArea(keys, callback) {
  const byArea = syncAvailable()
    ? partitionKeysByArea(keys)
    : { [LOCAL]: keys === undefined ? null : keys };

  const areas = Object.keys(byArea);
  const merged = {};

  if (areas.length === 0) {
    callback(merged);
    return;
  }

  let pending = areas.length;
  for (const area of areas) {
    chrome.storage[area].get(byArea[area], (results) => {
      Object.assign(merged, results || {});
      pending -= 1;
      // Fire once, after the LAST area reports. Callers — notably the mixed-key
      // read on the Import / Export page — are written against a
      // single-callback contract and would render twice otherwise.
      if (pending === 0) callback(merged);
    });
  }
}

// Write `updates` to whichever areas own their keys, guarding the sync writes.
export function writeByArea(updates) {
  if (!syncAvailable()) {
    if (updates && Object.keys(updates).length) chrome.storage[LOCAL].set(updates);
    return;
  }

  const byArea = partitionUpdatesByArea(updates);
  const syncUpdates = byArea[SYNC] || {};
  const localUpdates = { ...(byArea[LOCAL] || {}) };

  // Measure BEFORE writing. A quota rejection discovered as a runtime error has
  // already lost the write; a measured one is redirected while it still holds
  // the data.
  const sendable = {};
  for (const [key, value] of Object.entries(syncUpdates)) {
    if (fitsSyncItemQuota(key, value)) {
      sendable[key] = value;
    } else {
      localUpdates[key] = value;
      recordSyncStatus(SyncStatus.TOO_LARGE, {
        key,
        bytes: serializedByteLength(key, value),
      });
    }
  }

  if (Object.keys(localUpdates).length) {
    chrome.storage[LOCAL].set(localUpdates);
  }

  if (Object.keys(sendable).length) {
    chrome.storage[SYNC].set(sendable, () => {
      const failure = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
      if (failure) {
        // Sync refused it — signed out, extension sync disabled, throttled past
        // MAX_WRITE_OPERATIONS_PER_MINUTE, or the area itself is full. Land the
        // value locally so the mutation survives, and say so.
        chrome.storage[LOCAL].set(sendable);
        recordSyncStatus(SyncStatus.FAILED, {
          key: Object.keys(sendable).join(','),
          message: failure.message,
        });
        return;
      }
      recordSyncStatus(SyncStatus.OK, {});
    });
  }
}

// Remove `keys` from whichever areas own them.
export function removeByArea(keys) {
  if (!syncAvailable()) {
    chrome.storage[LOCAL].remove(keys);
    return;
  }

  const byArea = partitionKeysByArea(keys);
  for (const area of Object.keys(byArea)) {
    const areaKeys = byArea[area];
    if (areaKeys == null || areaKeys.length === 0) continue;
    chrome.storage[area].remove(areaKeys);
  }
}
