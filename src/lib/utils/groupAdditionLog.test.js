import { describe, it, expect } from 'vitest';
import {
  buildGroupAdditionEntry,
  GROUP_ADDITION_LOG_KEY,
  GROUP_ADDITION_LOG_CAP,
  AdditionSource,
} from './groupAdditionLog.js';

describe('buildGroupAdditionEntry', () => {
  // A typical worker addition carries every root-causing field through unchanged.
  it('builds an entry carrying source, label, urlKeys, tabId and total', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.WORKER_IN_GROUP_SYNC, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 42,
      total: 3,
      t: 1000,
    });
    expect(entry).toEqual({
      t: 1000,
      source: 'worker:in-group-sync',
      label: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 42,
      total: 3,
      previousKey: null,
    });
  });

  // Single-key additions may pass a bare key; it is coerced to a one-element array
  // so every entry has a uniform `urlKeys` array shape.
  it('coerces a bare urlKey string into a single-element array', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.WORKER_GROUP_CHANGED, {
      labelTitle: 'Reading',
      urlKeys: 'url-https://b.com',
      tabId: 7,
      total: 1,
      t: 5,
    });
    expect(entry.urlKeys).toEqual(['url-https://b.com']);
  });

  // A multi-key addition (a label seeded with several members at once) keeps its
  // array as-is.
  it('preserves a multi-key urlKeys array', () => {
    const keys = ['url-https://a.com', 'url-https://b.com', 'url-https://c.com'];
    const entry = buildGroupAdditionEntry(AdditionSource.UI_DRAG, {
      labelTitle: 'Shopping',
      urlKeys: keys,
      total: 3,
      t: 9,
    });
    expect(entry.urlKeys).toEqual(keys);
    expect(entry.total).toBe(3);
  });

  // Some addition paths have no tab in hand — tabId normalizes to null, not
  // undefined, so serialized entries have a stable shape.
  it('normalizes a missing tabId to null', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.UI_DRAG, {
      labelTitle: 'Social',
      urlKeys: ['url-https://x.com'],
      total: 1,
      t: 3,
    });
    expect(entry.tabId).toBeNull();
  });

  // tabId 0 is a real Chrome tab id and must survive (not be coerced to null).
  it('keeps a tabId of 0 rather than treating it as missing', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.WORKER_GROUP_CHANGED, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 0,
      total: 4,
      t: 11,
    });
    expect(entry.tabId).toBe(0);
  });

  // A drift-heal add is a rewrite in place, so it carries BOTH keys — the slot's
  // previous value and the live one — making a rewrite chain readable in the trail.
  it('records the previous key for a drift-heal rewrite', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.WORKER_DRIFT_HEAL, {
      labelTitle: 'Docs',
      urlKeys: ['url-https://docs.google.com/document/d/A/edit?tab=t.9'],
      previousKey: 'url-https://docs.google.com/document/d/A/edit?tab=t.0',
      tabId: 3,
      total: 2,
      t: 77,
    });
    expect(entry.previousKey).toBe('url-https://docs.google.com/document/d/A/edit?tab=t.0');
    expect(entry.source).toBe('worker:drift-heal');
  });

  // The builder is clock-free: it echoes the caller-supplied timestamp verbatim
  // and never reads Date.now(), so it is deterministic in tests.
  it('echoes the caller-supplied timestamp verbatim', () => {
    const entry = buildGroupAdditionEntry(AdditionSource.WORKER_IN_GROUP_SYNC, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 1,
      total: 1,
      t: 1234567890,
    });
    expect(entry.t).toBe(1234567890);
  });
});

describe('groupAdditionLog constants', () => {
  // The store key and cap are fixed so both runtimes write to the same bounded
  // ring buffer — and to its OWN key, never mixed into the removal trail.
  it('exposes a stable store key and a positive cap', () => {
    expect(GROUP_ADDITION_LOG_KEY).toBe('groupAdditionLog');
    expect(GROUP_ADDITION_LOG_CAP).toBeGreaterThan(0);
  });

  // The source vocabulary is the shared contract between the worker and web app;
  // each path has a distinct, namespaced tag.
  it('defines a distinct tag for every addition source', () => {
    const tags = Object.values(AdditionSource);
    expect(tags).toContain('worker:group-changed');
    expect(tags).toContain('worker:in-group-sync');
    expect(tags).toContain('worker:drift-heal');
    expect(tags).toContain('ui:drag');
    expect(new Set(tags).size).toBe(tags.length);
  });
});
