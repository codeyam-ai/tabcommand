import { describe, it, expect } from 'vitest';
import {
  buildGroupRemovalEntry,
  GROUP_REMOVAL_LOG_KEY,
  GROUP_REMOVAL_LOG_CAP,
  RemovalSource,
} from './groupRemovalLog.js';

describe('buildGroupRemovalEntry', () => {
  // A typical worker removal carries every root-causing field through unchanged.
  it('builds an entry carrying source, label, urlKeys, tabId and remaining', () => {
    const entry = buildGroupRemovalEntry(RemovalSource.WORKER_TAB_UNGROUPED, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 42,
      remaining: 2,
      t: 1000,
    });
    expect(entry).toEqual({
      t: 1000,
      source: 'worker:tab-ungrouped',
      label: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 42,
      remaining: 2,
    });
  });

  // Single-key removals may pass a bare key; it is coerced to a one-element array
  // so every entry has a uniform `urlKeys` array shape.
  it('coerces a bare urlKey string into a single-element array', () => {
    const entry = buildGroupRemovalEntry(RemovalSource.UI_REMOVE_URL, {
      labelTitle: 'Reading',
      urlKeys: 'url-https://b.com',
      tabId: 7,
      remaining: 0,
      t: 5,
    });
    expect(entry.urlKeys).toEqual(['url-https://b.com']);
  });

  // A multi-key removal (delete-group lists every member) keeps its array as-is.
  it('preserves a multi-key urlKeys array', () => {
    const keys = ['url-https://a.com', 'url-https://b.com', 'url-https://c.com'];
    const entry = buildGroupRemovalEntry(RemovalSource.UI_DELETE_LABEL, {
      labelTitle: 'Shopping',
      urlKeys: keys,
      remaining: 0,
      t: 9,
    });
    expect(entry.urlKeys).toEqual(keys);
    expect(entry.remaining).toBe(0);
  });

  // Some removal paths have no tab in hand — tabId normalizes to null, not undefined,
  // so serialized entries have a stable shape.
  it('normalizes a missing tabId to null', () => {
    const entry = buildGroupRemovalEntry(RemovalSource.UI_DRAG, {
      labelTitle: 'Social',
      urlKeys: ['url-https://x.com'],
      remaining: 1,
      t: 3,
    });
    expect(entry.tabId).toBeNull();
  });

  // tabId 0 is a real Chrome tab id and must survive (not be coerced to null).
  it('keeps a tabId of 0 rather than treating it as missing', () => {
    const entry = buildGroupRemovalEntry(RemovalSource.WORKER_GROUP_CHANGED, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 0,
      remaining: 3,
      t: 11,
    });
    expect(entry.tabId).toBe(0);
  });

  // The builder is clock-free: it echoes the caller-supplied timestamp verbatim
  // and never reads Date.now(), so it is deterministic in tests.
  it('echoes the caller-supplied timestamp verbatim', () => {
    const entry = buildGroupRemovalEntry(RemovalSource.WORKER_DRIFT_HEAL_DEDUP, {
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      tabId: 1,
      remaining: 0,
      t: 1234567890,
    });
    expect(entry.t).toBe(1234567890);
  });
});

describe('groupRemovalLog constants', () => {
  // The store key and cap are fixed so both runtimes write to the same bounded
  // ring buffer.
  it('exposes a stable store key and a positive cap', () => {
    expect(GROUP_REMOVAL_LOG_KEY).toBe('groupRemovalLog');
    expect(GROUP_REMOVAL_LOG_CAP).toBeGreaterThan(0);
  });

  // The source vocabulary is the shared contract between the worker and web app;
  // each path has a distinct, namespaced tag.
  it('defines a distinct tag for every removal source', () => {
    const tags = Object.values(RemovalSource);
    expect(tags).toContain('worker:tab-ungrouped');
    expect(tags).toContain('worker:group-changed');
    expect(tags).toContain('worker:drift-heal-dedup');
    expect(tags).toContain('ui:removeUrl');
    expect(tags).toContain('ui:deleteLabel');
    expect(tags).toContain('ui:drag');
    expect(new Set(tags).size).toBe(tags.length);
  });
});
