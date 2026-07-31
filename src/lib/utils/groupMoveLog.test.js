import { describe, it, expect } from 'vitest';
import appendGroupingLog from './groupingLog.js';
import {
  buildGroupMoveEntry,
  GROUP_MOVE_LOG_KEY,
  GROUP_MOVE_LOG_CAP,
  MoveSource,
} from './groupMoveLog.js';

describe('buildGroupMoveEntry', () => {
  // A typical auto-group move carries every field needed to explain WHY a tab
  // moved and where it went — the whole point of the trail.
  it('builds an entry carrying source, action, tab, both group ids, label and urlKey', () => {
    const entry = buildGroupMoveEntry(MoveSource.WORKER_AUTO_GROUP, {
      action: 'group',
      tabId: 42,
      fromGroupId: -1,
      toGroupId: 5,
      labelTitle: 'Work',
      urlKey: 'url-https://a.com',
      t: 1000,
    });
    expect(entry).toEqual({
      t: 1000,
      source: 'worker:auto-group',
      action: 'group',
      tabId: 42,
      fromGroupId: -1,
      toGroupId: 5,
      label: 'Work',
      urlKey: 'url-https://a.com',
    });
  });

  // An ungroup records the destination as -1 (no group), which is what makes an
  // eject distinguishable from a group-to-group move when reading the trail.
  it('records an ungroup as a move to no group', () => {
    const entry = buildGroupMoveEntry(MoveSource.WORKER_NAVIGATION_EJECT, {
      action: 'ungroup',
      tabId: 7,
      fromGroupId: 3,
      toGroupId: -1,
      urlKey: 'url-https://b.com',
      t: 5,
    });
    expect(entry.action).toBe('ungroup');
    expect(entry.fromGroupId).toBe(3);
    expect(entry.toGroupId).toBe(-1);
  });

  // Ungroup paths often have no label in hand. Those fields normalize to null,
  // not undefined, so serialized entries keep a stable shape.
  it('normalizes a missing label and urlKey to null', () => {
    const entry = buildGroupMoveEntry(MoveSource.WORKER_NO_MATCHING_LABEL, {
      action: 'ungroup',
      tabId: 9,
      fromGroupId: 2,
      t: 3,
    });
    expect(entry.label).toBeNull();
    expect(entry.urlKey).toBeNull();
  });

  // A missing group id means "no group" (-1), so a reader never has to
  // distinguish undefined from ungrouped.
  it('defaults missing group ids to no group', () => {
    const entry = buildGroupMoveEntry(MoveSource.UI_DRAG, {
      action: 'group',
      tabId: 1,
      t: 2,
    });
    expect(entry.fromGroupId).toBe(-1);
    expect(entry.toGroupId).toBe(-1);
  });

  // Group id 0 and tab id 0 are both real Chrome ids and must survive rather than
  // being coerced away by a falsy check.
  it('keeps ids of 0 rather than treating them as missing', () => {
    const entry = buildGroupMoveEntry(MoveSource.WORKER_AUTO_GROUP, {
      action: 'group',
      tabId: 0,
      fromGroupId: 0,
      toGroupId: 0,
      t: 4,
    });
    expect(entry.tabId).toBe(0);
    expect(entry.fromGroupId).toBe(0);
    expect(entry.toGroupId).toBe(0);
  });

  // The builder is clock-free: it echoes the caller-supplied timestamp verbatim
  // and never reads Date.now(), so it is deterministic in tests.
  it('echoes the caller-supplied timestamp verbatim', () => {
    const entry = buildGroupMoveEntry(MoveSource.WORKER_AUTO_CLOSE_REVISIT, {
      action: 'ungroup',
      tabId: 3,
      fromGroupId: 1,
      toGroupId: -1,
      t: 1234567890,
    });
    expect(entry.t).toBe(1234567890);
  });
});

describe('groupMoveLog constants', () => {
  // The trail writes to its OWN key so it is never buried by, or trimmed with,
  // the noisy auto-group breadcrumbs in groupingLog.
  it('exposes a stable store key distinct from the other trails', () => {
    expect(GROUP_MOVE_LOG_KEY).toBe('groupMoveLog');
    expect(GROUP_MOVE_LOG_CAP).toBeGreaterThan(0);
  });

  // The source vocabulary names every code path that can move a tab; each has a
  // distinct, namespaced tag so two paths can never be confused in the trail.
  it('defines a distinct tag for every move source', () => {
    const tags = Object.values(MoveSource);
    expect(tags).toContain('worker:auto-group');
    expect(tags).toContain('worker:navigation-eject');
    expect(tags).toContain('worker:auto-group-eject');
    expect(tags).toContain('worker:no-matching-label');
    expect(tags).toContain('worker:auto-close-revisit');
    expect(tags).toContain('ui:drag');
    expect(new Set(tags).size).toBe(tags.length);
  });

  // The trail reuses the shared ring buffer, so it is bounded: a long session
  // cannot grow chrome.storage.local without limit.
  it('stays bounded at the cap when appended through the shared ring buffer', () => {
    let log;
    for (let i = 0; i < GROUP_MOVE_LOG_CAP + 25; ++i) {
      log = appendGroupingLog(
        log,
        buildGroupMoveEntry(MoveSource.WORKER_AUTO_GROUP, {
          action: 'group',
          tabId: i,
          fromGroupId: -1,
          toGroupId: 5,
          t: i,
        }),
        GROUP_MOVE_LOG_CAP
      );
    }
    expect(log).toHaveLength(GROUP_MOVE_LOG_CAP);
  });
});
