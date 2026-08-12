import { describe, it, expect, afterEach } from 'vitest';
import {
  hasGroups,
  decideMigration,
  migrateLabelsToSync,
  MigrationOutcome,
} from './migrateLabelsToSync';
import { SYNC_ITEM_SAFE_BYTES } from './syncQuota';

// A two-area storage double. `set` records what was written so the "did the copy
// actually happen" question is answerable, which is the whole point of the
// migration.
function makeStorage({ localLabels, syncLabels, withSync = true } = {}) {
  const written = { sync: [], local: [] };
  const area = (labels, name) => ({
    get: (keys, cb) => cb(labels === undefined ? {} : { labels }),
    set: (updates, cb) => {
      written[name].push(updates);
      if (cb) cb();
    },
  });

  const storage = { local: area(localLabels, 'local') };
  if (withSync) storage.sync = area(syncLabels, 'sync');
  return { storage, written };
}

const WORK = { Work: { title: 'Work', urlKeys: ['url-https://github.com'] } };
const OTHER = { Research: { title: 'Research', urlKeys: ['url-https://mdn.io'] } };

describe('hasGroups', () => {
  // a populated map is the only thing that counts as "this area has the user's groups"
  it('is true for a populated labels map', () => {
    expect(hasGroups(WORK)).toBe(true);
  });

  // {} is the hydrated empty default; treating it as authoritative would let an
  // empty sync area permanently shadow a populated local one
  it('is false for an empty map', () => {
    expect(hasGroups({})).toBe(false);
  });

  // absent storage values must not throw or read as populated
  it('is false for null and undefined', () => {
    expect(hasGroups(null)).toBe(false);
    expect(hasGroups(undefined)).toBe(false);
  });
});

describe('decideMigration', () => {
  // the second-machine case: sync carries the current set, local carries
  // whatever this machine last saw. Sync is authoritative and local is NOT
  // copied over it.
  it('lets sync win when both areas hold groups', () => {
    const decision = decideMigration(OTHER, WORK);
    expect(decision.outcome).toBe(MigrationOutcome.SYNC_WINS);
    expect(decision.labels).toEqual(OTHER);
    expect(decision.write).toBe(false);
  });

  // the upgrade path every existing user hits: groups only in the old local area
  it('migrates local into sync when sync is empty', () => {
    const decision = decideMigration({}, WORK);
    expect(decision.outcome).toBe(MigrationOutcome.MIGRATED);
    expect(decision.labels).toEqual(WORK);
    expect(decision.write).toBe(true);
  });

  // a fresh install has nothing anywhere and must write nothing
  it('does nothing when neither area holds groups', () => {
    const decision = decideMigration({}, {});
    expect(decision.outcome).toBe(MigrationOutcome.NOTHING_TO_MIGRATE);
    expect(decision.write).toBe(false);
  });

  // an over-quota copy would fail; keep running off local and let the caller warn
  it('refuses to migrate a labels map past the sync quota', () => {
    const huge = { Huge: { title: 'x'.repeat(SYNC_ITEM_SAFE_BYTES + 100) } };
    const decision = decideMigration({}, huge);
    expect(decision.outcome).toBe(MigrationOutcome.TOO_LARGE);
    expect(decision.labels).toEqual(huge);
    expect(decision.write).toBe(false);
  });

  // the uninstall-survival case: local was destroyed, sync still has the groups
  it('runs off sync when local is gone entirely', () => {
    const decision = decideMigration(WORK, undefined);
    expect(decision.outcome).toBe(MigrationOutcome.SYNC_WINS);
    expect(decision.labels).toEqual(WORK);
  });
});

describe('migrateLabelsToSync', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  // the copy must actually reach sync, not merely be decided on
  it('writes local labels into sync on first run', () => {
    const { storage, written } = makeStorage({ localLabels: WORK, syncLabels: {} });
    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage });

    expect(result.outcome).toBe(MigrationOutcome.MIGRATED);
    expect(result.labels).toEqual(WORK);
    expect(written.sync).toEqual([{ labels: WORK }]);
  });

  // re-running must not copy again — the migration runs on every worker boot AND
  // every app boot, so a non-idempotent one would overwrite good sync data
  it('is idempotent once sync holds groups', () => {
    const { storage, written } = makeStorage({ localLabels: WORK, syncLabels: OTHER });
    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage });

    expect(result.outcome).toBe(MigrationOutcome.SYNC_WINS);
    expect(result.labels).toEqual(OTHER);
    expect(written.sync).toEqual([]);
  });

  // the local value is a deliberate read-only fallback and must NOT be deleted:
  // a later sync failure then degrades to the old behavior instead of data loss
  it('never writes to or clears the local area', () => {
    const { storage, written } = makeStorage({ localLabels: WORK, syncLabels: {} });
    migrateLabelsToSync(() => {}, { storage });

    expect(written.local).toEqual([]);
  });

  // a fresh install resolves to an empty map rather than undefined, so the
  // worker's bare labels[title] dereferences stay safe
  it('resolves to an empty map when neither area has groups', () => {
    const { storage } = makeStorage({ localLabels: undefined, syncLabels: undefined });
    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage });

    expect(result.outcome).toBe(MigrationOutcome.NOTHING_TO_MIGRATE);
    expect(result.labels).toEqual({});
  });

  // a host with no sync area must still boot with the user's local groups rather
  // than reporting an empty set
  it('falls back to local labels when there is no sync area', () => {
    const { storage } = makeStorage({ localLabels: WORK, withSync: false });
    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage });

    expect(result.outcome).toBe(MigrationOutcome.SYNC_UNAVAILABLE);
    expect(result.labels).toEqual(WORK);
  });

  // no storage at all must not throw during boot
  it('resolves to an empty map when storage is absent', () => {
    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage: null });

    expect(result.outcome).toBe(MigrationOutcome.SYNC_UNAVAILABLE);
    expect(result.labels).toEqual({});
  });

  // a failed copy is not a failed boot — the session runs off the local value
  // that is still there and retries on the next boot
  it('still resolves labels when the sync write fails', () => {
    const { storage } = makeStorage({ localLabels: WORK, syncLabels: {} });
    globalThis.chrome = { runtime: { lastError: { message: 'quota exceeded' } } };

    let result;
    migrateLabelsToSync((r) => { result = r; }, { storage });

    expect(result.outcome).toBe(MigrationOutcome.TOO_LARGE);
    expect(result.labels).toEqual(WORK);
  });
});
