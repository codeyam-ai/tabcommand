// One-time, idempotent local -> sync migration for `labels`.
//
// Before this, groups lived only in `chrome.storage.local`, which Chrome
// destroys when it uninstalls an extension — including the implicit uninstall
// that happens when an unpacked extension's directory goes missing. That wiped a
// real user's groups: the extension's LevelDB was recreated from scratch and
// both `labels` and `previousLabels` — the only backup — were gone.
//
// Runs on worker boot, before the `activeTabs` bootstrap read, and resolves
// which copy of `labels` the session should use.
//
// The migration is deliberately ONE-WAY-SAFE. `chrome.storage.sync` is durable,
// not infallible: it falls back to local-only behavior when the user is signed
// out or has extension sync disabled, and Chrome eventually garbage-collects
// synced data for long-uninstalled extensions. So the local `labels` value is
// LEFT IN PLACE as a read-only fallback rather than deleted — a sync failure
// then degrades to exactly today's behavior instead of losing data.

import { LOCAL, SYNC } from './storageAreas';
import { fitsSyncItemQuota } from './syncQuota';

export const MigrationOutcome = {
  // Sync already holds groups — it is the authority; local is not copied over it.
  SYNC_WINS: 'sync-wins',
  // Sync was empty and local had groups; local's copy is now in sync.
  MIGRATED: 'migrated',
  // Neither area holds groups. A fresh install; nothing to do.
  NOTHING_TO_MIGRATE: 'nothing-to-migrate',
  // Local's groups exceed the sync per-item quota. Left local, user warned.
  TOO_LARGE: 'too-large',
  // The sync area is unavailable entirely (no sync in this host).
  SYNC_UNAVAILABLE: 'sync-unavailable',
};

// A labels map "has groups" when it is a non-empty object. `{}` is the hydrated
// empty default and must NOT be treated as authoritative, or an empty sync area
// would permanently shadow a populated local one.
export function hasGroups(labels) {
  return !!labels && typeof labels === 'object' && Object.keys(labels).length > 0;
}

// The migration decision, as a pure function of the two areas' current values.
// Returns the outcome plus the `labels` the session should run with.
export function decideMigration(syncLabels, localLabels) {
  if (hasGroups(syncLabels)) {
    return { outcome: MigrationOutcome.SYNC_WINS, labels: syncLabels, write: false };
  }

  if (!hasGroups(localLabels)) {
    return { outcome: MigrationOutcome.NOTHING_TO_MIGRATE, labels: localLabels || {}, write: false };
  }

  if (!fitsSyncItemQuota('labels', localLabels)) {
    // Writing anyway would fail the quota and, if that error were swallowed,
    // look like it worked. Keep running off the local copy and surface it.
    return { outcome: MigrationOutcome.TOO_LARGE, labels: localLabels, write: false };
  }

  return { outcome: MigrationOutcome.MIGRATED, labels: localLabels, write: true };
}

// Read both areas, apply `decideMigration`, perform the copy when it calls for
// one, and hand the resolved labels to `callback` as `{ outcome, labels }`.
//
// `deps` is injectable so the orchestration is testable without stubbing the
// whole `chrome` global.
export function migrateLabelsToSync(callback, deps = {}) {
  const storage = deps.storage
    || (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage : null);

  const finish = (outcome, labels) => callback({ outcome, labels: labels || {} });

  if (!storage || !storage[SYNC]) {
    // No sync area in this host — read local and carry on exactly as before.
    if (!storage || !storage[LOCAL]) {
      finish(MigrationOutcome.SYNC_UNAVAILABLE, {});
      return;
    }
    storage[LOCAL].get(['labels'], (localResult) => {
      finish(MigrationOutcome.SYNC_UNAVAILABLE, (localResult || {}).labels);
    });
    return;
  }

  storage[SYNC].get(['labels'], (syncResult) => {
    storage[LOCAL].get(['labels'], (localResult) => {
      const decision = decideMigration(
        (syncResult || {}).labels,
        (localResult || {}).labels,
      );

      if (decision.write) {
        storage[SYNC].set({ labels: decision.labels }, () => {
          const failure = typeof chrome !== 'undefined'
            && chrome.runtime
            && chrome.runtime.lastError;
          // A failed copy is not a failed boot: the local value is still there
          // and still correct, so the session runs off it and retries next boot.
          finish(
            failure ? MigrationOutcome.TOO_LARGE : decision.outcome,
            decision.labels,
          );
        });
        return;
      }

      finish(decision.outcome, decision.labels);
    });
  });
}

export default migrateLabelsToSync;
