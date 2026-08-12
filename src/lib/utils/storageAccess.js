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
import { resolveLabelsAcrossAreas, LabelsSource } from './labelsPrecedence';

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

// Whether a partitioned query asks for `labels` at all. `labels` routes to sync,
// so the sync side of the partition is the one to interrogate; `null` is the
// "read everything" form and therefore includes it.
function queryRequestsLabels(byArea) {
  const syncQuery = byArea[SYNC];
  if (syncQuery === null) return true;
  if (Array.isArray(syncQuery)) return syncQuery.indexOf('labels') > -1;
  if (syncQuery && typeof syncQuery === 'object') return 'labels' in syncQuery;
  return false;
}

// Read `keys` from whichever areas own them and hand the MERGED result to
// `callback` exactly once. Mirrors `chrome.storage.<area>.get`'s argument forms:
// a string, an array, a defaults object, or null for "everything".
//
// `labels` gets one extra step. `writeByArea` redirects it to the LOCAL area
// whenever sync refuses the write — over quota, signed out, sync disabled,
// throttled — so that a group mutation is never dropped. Resolving `labels` from
// sync alone would make that fallback write-only: the value would sit safely on
// disk in an area nothing ever reads it back from, and the user would watch
// their groups revert. So when sync has no groups to offer, local is consulted
// for a fallback copy before the callback fires.
export function readByArea(keys, callback) {
  const withSync = syncAvailable();
  const byArea = withSync
    ? partitionKeysByArea(keys)
    : { [LOCAL]: keys === undefined ? null : keys };

  const areas = Object.keys(byArea);

  if (areas.length === 0) {
    callback({});
    return;
  }

  // Only worth resolving when sync exists AND the caller asked for `labels`. A
  // local-only host has no split to reconcile, and the ~20 reads that never
  // touch `labels` must not pay for a second round trip.
  const resolvesLabels = withSync && queryRequestsLabels(byArea);
  // The read-everything form already pulls local's copy, so no follow-up read
  // is needed to see it. Every other form routes `labels` to sync alone.
  const localAlreadyHasLabels = byArea[LOCAL] === null;

  const perArea = {};
  let pending = areas.length;

  const finish = () => {
    const merged = {};
    for (const area of areas) Object.assign(merged, perArea[area] || {});

    if (!resolvesLabels) {
      callback(merged);
      return;
    }

    // The precedence rule itself lives in `labelsPrecedence` so it is one
    // decision made once, rather than an ordering accident of this function.
    const resolved = resolveLabelsAcrossAreas(
      (perArea[SYNC] || {}).labels,
      (perArea[LOCAL] || {}).labels,
    );

    if (resolved.source !== LabelsSource.NEITHER) {
      merged.labels = resolved.labels;
      callback(merged);
      return;
    }

    if (localAlreadyHasLabels) {
      callback(merged);
      return;
    }

    // Costs a second round trip, but only on the degraded path: a healthy sync
    // read resolves above and never reaches here.
    chrome.storage[LOCAL].get(['labels'], (localResult) => {
      const fallback = resolveLabelsAcrossAreas(undefined, (localResult || {}).labels);
      if (fallback.source === LabelsSource.LOCAL) merged.labels = fallback.labels;
      callback(merged);
    });
  };

  for (const area of areas) {
    chrome.storage[area].get(byArea[area], (results) => {
      perArea[area] = results || {};
      pending -= 1;
      // Fire once, after the LAST area reports. Callers — notably the mixed-key
      // read on the Import / Export page — are written against a
      // single-callback contract and would render twice otherwise.
      if (pending === 0) finish();
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

      // The other half of the fallback. An earlier refused write may have left a
      // `labels` copy in local; now that sync has accepted the value, the two
      // areas must not be allowed to hold DIFFERENT groups, or which one the
      // user sees depends on which one happened to be read.
      //
      // Mirroring rather than deleting is deliberate. `migrateLabelsToSync`
      // leaves the local copy in place on purpose, as a read-only fallback for
      // the day sync is unavailable or Chrome garbage-collects the synced data;
      // deleting it here would quietly remove that net. Writing the SAME value
      // to both areas keeps the net and makes drift impossible at once — the
      // precedence rule in `readByArea` then has nothing left to arbitrate.
      chrome.storage[LOCAL].set(sendable);
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
