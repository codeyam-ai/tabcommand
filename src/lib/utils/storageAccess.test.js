import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readByArea,
  writeByArea,
  removeByArea,
  resetSyncStatusMemo,
  SyncStatus,
  SYNC_STATUS_KEY,
} from './storageAccess';
import { SYNC_ITEM_SAFE_BYTES } from './syncQuota';

// A hand-rolled two-area `chrome.storage` double. Recording the calls per area
// is the point: the fan-out contract is about WHICH area each key reaches, and a
// shared-spy double could not tell a correct split from a wrong one.
function makeChrome({ localData = {}, syncData = {}, syncFails = false, withSync = true } = {}) {
  const calls = { localGet: [], syncGet: [], localSet: [], syncSet: [], localRemove: [], syncRemove: [] };
  const runtime = { lastError: undefined };

  const area = (data, name) => ({
    get: (keys, cb) => {
      calls[`${name}Get`].push(keys);
      if (keys == null) return cb({ ...data });
      const requested = typeof keys === 'string'
        ? [keys]
        : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of requested) {
        if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
      }
      cb(out);
    },
    set: (updates, cb) => {
      calls[`${name}Set`].push(updates);
      const failing = name === 'sync' && syncFails;
      if (!failing) Object.assign(data, updates);
      runtime.lastError = failing ? { message: 'sync is unavailable' } : undefined;
      if (cb) cb();
      runtime.lastError = undefined;
    },
    remove: (keys) => {
      calls[`${name}Remove`].push(keys);
      for (const k of (typeof keys === 'string' ? [keys] : keys)) delete data[k];
    },
  });

  const storage = { local: area(localData, 'local') };
  if (withSync) storage.sync = area(syncData, 'sync');

  return { chrome: { storage, runtime }, calls, localData, syncData };
}

describe('storageAccess', () => {
  beforeEach(() => {
    resetSyncStatusMemo();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  // The mixed read on the Import / Export page: labels lives in sync while
  // previousLabels and syncStatus live in local. Both areas must be read and the
  // results merged, or the page renders half its data.
  it('readByArea merges results from both areas', () => {
    const { chrome, calls } = makeChrome({
      localData: { previousLabels: [{ Old: {} }] },
      syncData: { labels: { Work: {} } },
    });
    globalThis.chrome = chrome;

    let out;
    readByArea(['labels', 'previousLabels'], (r) => { out = r; });

    expect(out).toEqual({ labels: { Work: {} }, previousLabels: [{ Old: {} }] });
    expect(calls.syncGet).toEqual([['labels']]);
    expect(calls.localGet).toEqual([['previousLabels']]);
  });

  // Callers are written against a single-callback contract; firing once per area
  // would render the Import / Export page twice with partial data.
  it('readByArea invokes the callback exactly once for a cross-area read', () => {
    const { chrome } = makeChrome({ localData: { previousLabels: [] }, syncData: { labels: {} } });
    globalThis.chrome = chrome;

    let calls = 0;
    readByArea(['labels', 'previousLabels'], () => { calls += 1; });

    expect(calls).toBe(1);
  });

  // A read touching only local keys must not manufacture a sync round trip.
  it('readByArea reads only the areas the keys belong to', () => {
    const { chrome, calls } = makeChrome({ localData: { activeTabs: [1] } });
    globalThis.chrome = chrome;

    let out;
    readByArea(['activeTabs'], (r) => { out = r; });

    expect(out).toEqual({ activeTabs: [1] });
    expect(calls.syncGet).toEqual([]);
  });

  // An empty key list requests nothing, so the callback must still fire rather
  // than the caller hanging forever waiting on zero areas.
  it('readByArea fires the callback for an empty key list', () => {
    const { chrome } = makeChrome();
    globalThis.chrome = chrome;

    let out = 'untouched';
    readByArea([], (r) => { out = r; });

    expect(out).toEqual({});
  });

  // An import writes url-* records and labels from one updates map. Each key
  // must land in its own area with nothing dropped.
  it('writeByArea splits a mixed updates map across both areas', () => {
    const { chrome, localData, syncData } = makeChrome();
    globalThis.chrome = chrome;

    writeByArea({ 'url-https://a.com': { url: 'https://a.com' }, labels: { Work: {} } });

    expect(syncData.labels).toEqual({ Work: {} });
    expect(localData['url-https://a.com']).toEqual({ url: 'https://a.com' });
  });

  // Over-quota labels must be REDIRECTED to local, not written to sync and left
  // to fail — a swallowed quota error looks exactly like a working backup.
  it('writeByArea redirects an over-quota value to local and records it', () => {
    const { chrome, calls, localData } = makeChrome();
    globalThis.chrome = chrome;

    const huge = { big: 'x'.repeat(SYNC_ITEM_SAFE_BYTES + 100) };
    writeByArea({ labels: huge });

    expect(calls.syncSet).toEqual([]);
    expect(localData.labels).toEqual(huge);
    expect(localData[SYNC_STATUS_KEY].status).toBe(SyncStatus.TOO_LARGE);
    expect(localData[SYNC_STATUS_KEY].bytes).toBeGreaterThan(SYNC_ITEM_SAFE_BYTES);
  });

  // Sync signed out / disabled / throttled: the group edit must still persist
  // locally so nothing is lost, and the degraded state must be visible.
  it('writeByArea falls back to local when the sync write fails', () => {
    const { chrome, localData } = makeChrome({ syncFails: true });
    globalThis.chrome = chrome;

    writeByArea({ labels: { Work: {} } });

    expect(localData.labels).toEqual({ Work: {} });
    expect(localData[SYNC_STATUS_KEY].status).toBe(SyncStatus.FAILED);
    expect(localData[SYNC_STATUS_KEY].message).toBe('sync is unavailable');
  });

  // A healthy write records `ok` so a previously-shown warning clears.
  it('writeByArea records an ok status after a successful sync write', () => {
    const { chrome, localData } = makeChrome();
    globalThis.chrome = chrome;

    writeByArea({ labels: { Work: {} } });

    expect(localData[SYNC_STATUS_KEY].status).toBe(SyncStatus.OK);
  });

  // labels is written on every ordinary group edit, so recording the status
  // unconditionally would turn one diagnostic key into per-edit write churn.
  it('writeByArea records the status only when it changes', () => {
    const { chrome, calls } = makeChrome();
    globalThis.chrome = chrome;

    writeByArea({ labels: { a: 1 } });
    writeByArea({ labels: { a: 2 } });
    writeByArea({ labels: { a: 3 } });

    const statusWrites = calls.localSet.filter((u) => SYNC_STATUS_KEY in u);
    expect(statusWrites).toHaveLength(1);
  });

  // Unit tests and older hosts stub only chrome.storage.local. Degrading to a
  // single local write preserves exactly the pre-sync behavior instead of
  // throwing on chrome.storage.sync.set of undefined.
  it('writeByArea degrades to local-only when there is no sync area', () => {
    const { chrome, localData } = makeChrome({ withSync: false });
    globalThis.chrome = chrome;

    writeByArea({ labels: { Work: {} }, activeTabs: [] });

    expect(localData.labels).toEqual({ Work: {} });
    expect(localData.activeTabs).toEqual([]);
  });

  // Same degradation on the read path.
  it('readByArea degrades to local-only when there is no sync area', () => {
    const { chrome } = makeChrome({ withSync: false, localData: { labels: { Work: {} } } });
    globalThis.chrome = chrome;

    let out;
    readByArea(['labels'], (r) => { out = r; });

    expect(out).toEqual({ labels: { Work: {} } });
  });

  // Nothing to write must produce no call at all, so a coalesced no-op write
  // does not still burn a sync operation.
  it('writeByArea issues no call for an empty updates map', () => {
    const { chrome, calls } = makeChrome();
    globalThis.chrome = chrome;

    writeByArea({});

    expect(calls.localSet).toEqual([]);
    expect(calls.syncSet).toEqual([]);
  });

  // Removals route by area the same way reads and writes do.
  it('removeByArea removes each key from its own area', () => {
    const { chrome, calls } = makeChrome({
      localData: { activeTabs: [] },
      syncData: { labels: {} },
    });
    globalThis.chrome = chrome;

    removeByArea(['labels', 'activeTabs']);

    expect(calls.syncRemove).toEqual([['labels']]);
    expect(calls.localRemove).toEqual([['activeTabs']]);
  });

  // A single string key is the common remove form and must reach the right area.
  it('removeByArea supports a single string key', () => {
    const { chrome, calls, syncData } = makeChrome({ syncData: { labels: {} } });
    globalThis.chrome = chrome;

    removeByArea('labels');

    expect(calls.syncRemove).toEqual([['labels']]);
    expect(syncData.labels).toBeUndefined();
  });
});
