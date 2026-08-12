import { describe, it, expect } from 'vitest';
import {
  LOCAL,
  SYNC,
  STORAGE_AREAS,
  KNOWN_KEYS,
  areaForKey,
  changedInArea,
  partitionKeysByArea,
  partitionUpdatesByArea,
} from './storageAreas';

// The routing table is the single source of truth for which chrome.storage area
// owns each key. Its whole value is that `labels` — and ONLY `labels` — goes to
// sync, so these cases pin both halves of that claim.
describe('storageAreas', () => {
  // labels is the irreplaceable record and the only key that must survive an
  // uninstall, so it is the sole sync entry
  it('routes labels to sync', () => {
    expect(areaForKey('labels')).toBe(SYNC);
    expect(STORAGE_AREAS.labels).toBe(SYNC);
  });

  // previousLabels is up to ten full snapshots of labels and would breach the
  // 8KB per-item sync quota on its own, so it deliberately stays local
  it('keeps previousLabels local', () => {
    expect(areaForKey('previousLabels')).toBe(LOCAL);
  });

  // labels must be the ONLY sync key — a second one would quietly eat the
  // 102,400-byte area quota that labels depends on
  it('routes every key other than labels to local', () => {
    const syncKeys = KNOWN_KEYS.filter((k) => areaForKey(k) === SYNC);
    expect(syncKeys).toEqual(['labels']);
  });

  // the dynamic url-<url> records are unbounded in number and far exceed the
  // sync area quota, so unknown keys must default to local
  it('defaults unknown and dynamic url- keys to local', () => {
    expect(areaForKey('url-https://example.com')).toBe(LOCAL);
    expect(areaForKey('somethingNobodyDeclared')).toBe(LOCAL);
    expect(areaForKey('')).toBe(LOCAL);
  });

  // KNOWN_KEYS is derived from the table so a key can never be routed without
  // being known, or known without being routed
  it('derives KNOWN_KEYS from the routing table', () => {
    expect(KNOWN_KEYS).toEqual(Object.keys(STORAGE_AREAS));
    for (const key of KNOWN_KEYS) {
      expect([LOCAL, SYNC]).toContain(STORAGE_AREAS[key]);
    }
  });

  // a labels change now arrives on the SYNC event; the old blanket
  // `areaName !== 'local'` guard would have dropped it and every live-updating
  // consumer would go stale on a group rename
  it('changedInArea returns a labels change on a sync event', () => {
    const change = { newValue: { Work: {} }, oldValue: {} };
    expect(changedInArea({ labels: change }, SYNC, 'labels')).toBe(change);
  });

  // the same labels change arriving tagged local is not real — the areas fire
  // separately, so accepting it would mean acting on another area's payload
  it('changedInArea ignores a labels change tagged with the wrong area', () => {
    const change = { newValue: { Work: {} } };
    expect(changedInArea({ labels: change }, LOCAL, 'labels')).toBeNull();
  });

  // local keys keep working exactly as before
  it('changedInArea returns a local key change on a local event', () => {
    const change = { newValue: [1] };
    expect(changedInArea({ activeTabs: change }, LOCAL, 'activeTabs')).toBe(change);
    expect(changedInArea({ activeTabs: change }, SYNC, 'activeTabs')).toBeNull();
  });

  // an event that simply does not carry the key is not an error
  it('changedInArea returns null when the key is absent or changes are missing', () => {
    expect(changedInArea({ activeTabs: {} }, SYNC, 'labels')).toBeNull();
    expect(changedInArea({}, SYNC, 'labels')).toBeNull();
    expect(changedInArea(null, SYNC, 'labels')).toBeNull();
  });

  // a single string key routes to just its own area, so a local-only read still
  // issues exactly one round trip
  it('partitions a single string key into one area', () => {
    expect(partitionKeysByArea('labels')).toEqual({ [SYNC]: ['labels'] });
    expect(partitionKeysByArea('activeTabs')).toEqual({ [LOCAL]: ['activeTabs'] });
  });

  // the mixed read on the Import / Export page is the case a naive per-area
  // switch would silently halve
  it('splits a mixed key array across both areas', () => {
    expect(partitionKeysByArea(['labels', 'previousLabels', 'syncStatus'])).toEqual({
      [SYNC]: ['labels'],
      [LOCAL]: ['previousLabels', 'syncStatus'],
    });
  });

  // a read touching only local keys must not manufacture a pointless sync read
  it('omits an area with no keys', () => {
    expect(partitionKeysByArea(['activeTabs', 'allUrls'])).toEqual({
      [LOCAL]: ['activeTabs', 'allUrls'],
    });
  });

  // null means "everything" to chrome.storage, which with two areas means
  // everything from both
  it('maps a null query to a full read of both areas', () => {
    expect(partitionKeysByArea(null)).toEqual({ [LOCAL]: null, [SYNC]: null });
    expect(partitionKeysByArea(undefined)).toEqual({ [LOCAL]: null, [SYNC]: null });
  });

  // chrome.storage.get also accepts a defaults map; the partition must preserve
  // that shape per area rather than flattening it to an array
  it('preserves the defaults-object query form per area', () => {
    expect(partitionKeysByArea({ labels: {}, activeTabs: [] })).toEqual({
      [SYNC]: { labels: {} },
      [LOCAL]: { activeTabs: [] },
    });
  });

  // an empty array requests nothing and must produce no reads at all
  it('partitions an empty key array to no areas', () => {
    expect(partitionKeysByArea([])).toEqual({});
  });

  // buildImportUpdates returns url-* records and labels in ONE map; splitting it
  // wrongly would drop half of every import
  it('splits a mixed updates map across both areas', () => {
    const updates = {
      'url-https://example.com': { url: 'https://example.com' },
      labels: { Work: { title: 'Work' } },
      activeTabs: [{ tabKey: 'tab-1' }],
    };
    expect(partitionUpdatesByArea(updates)).toEqual({
      [LOCAL]: {
        'url-https://example.com': { url: 'https://example.com' },
        activeTabs: [{ tabKey: 'tab-1' }],
      },
      [SYNC]: { labels: { Work: { title: 'Work' } } },
    });
  });

  // an empty or absent updates map must not produce a write to either area
  it('partitions empty updates to no areas', () => {
    expect(partitionUpdatesByArea({})).toEqual({});
    expect(partitionUpdatesByArea(null)).toEqual({});
    expect(partitionUpdatesByArea(undefined)).toEqual({});
  });

  // a falsy or undefined VALUE is still a write and must not be dropped during
  // partitioning
  it('keeps falsy values when partitioning updates', () => {
    expect(partitionUpdatesByArea({ labels: {}, theme: '' })).toEqual({
      [SYNC]: { labels: {} },
      [LOCAL]: { theme: '' },
    });
  });
});
