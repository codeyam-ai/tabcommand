import { describe, it, expect } from 'vitest';
import { needsGroupCall, needsUngroupCall, bucketTabsByWindow } from './tabPlacement.js';

describe('needsGroupCall', () => {
  // The core idempotence rule. A tab already sitting in the target group must not
  // be handed to chrome.tabs.group — that call is a REPOSITION, not an assertion,
  // and re-issuing it every pass is the "my tabs keep jumping around" loop.
  it('is false when the tab is already in the target group', () => {
    expect(needsGroupCall({ groupId: 5, pinned: false }, 5)).toBe(false);
  });

  // The guard must not over-suppress: a tab genuinely somewhere else still needs
  // the call, or auto-grouping would silently stop working.
  it('is true when the tab is in a different group', () => {
    expect(needsGroupCall({ groupId: 3, pinned: false }, 5)).toBe(true);
  });

  // An ungrouped tab (-1) is the ordinary auto-group case.
  it('is true for an ungrouped tab', () => {
    expect(needsGroupCall({ groupId: -1, pinned: false }, 5)).toBe(true);
  });

  // Pinned tabs are never grouped, whatever their current group id says.
  it('is false for a pinned tab', () => {
    expect(needsGroupCall({ groupId: -1, pinned: true }, 5)).toBe(false);
    expect(needsGroupCall({ groupId: 3, pinned: true }, 5)).toBe(false);
  });

  // group id 0 is FALSY but a perfectly valid Chrome group id. The worker's older
  // `if (activeTab.groupId && activeTab.groupId > -1)` test mishandles exactly
  // this; the helper must compare against -1 explicitly instead of truthiness,
  // or a tab in group 0 would be re-grouped on every pass.
  it('treats group id 0 as a real group rather than as no group', () => {
    expect(needsGroupCall({ groupId: 0, pinned: false }, 0)).toBe(false);
    expect(needsGroupCall({ groupId: 0, pinned: false }, 5)).toBe(true);
  });

  // A missing group id means the tab is in no group, so it needs the call.
  it('treats a missing group id as no group', () => {
    expect(needsGroupCall({ pinned: false }, 5)).toBe(true);
    expect(needsGroupCall({ groupId: null, pinned: false }, 5)).toBe(true);
  });

  // No target group exists yet (one is about to be created), so every unpinned
  // tab belongs in the create call — including one that currently sits in some
  // other group.
  it('is true for any unpinned tab when no target group exists yet', () => {
    expect(needsGroupCall({ groupId: -1, pinned: false }, undefined)).toBe(true);
    expect(needsGroupCall({ groupId: 3, pinned: false }, undefined)).toBe(true);
    expect(needsGroupCall({ groupId: -1, pinned: false }, -1)).toBe(true);
  });

  // Callers filter arrays through this predicate, so a missing tab must return a
  // decision rather than throwing.
  it('is false for a missing tab', () => {
    expect(needsGroupCall(undefined, 5)).toBe(false);
    expect(needsGroupCall(null, 5)).toBe(false);
  });
});

describe('needsUngroupCall', () => {
  // Ungrouping an already-ungrouped tab still moves it in the strip, so the
  // no-op case must be suppressed.
  it('is false when the tab is already in no group', () => {
    expect(needsUngroupCall({ groupId: -1 })).toBe(false);
  });

  // The guard must not over-suppress: a genuinely grouped tab still gets ejected.
  it('is true when the tab is in a group', () => {
    expect(needsUngroupCall({ groupId: 5 })).toBe(true);
  });

  // Same falsy-zero trap as needsGroupCall: group 0 is a real group and must
  // still be ungroupable.
  it('treats group id 0 as a real group', () => {
    expect(needsUngroupCall({ groupId: 0 })).toBe(true);
  });

  // A missing group id is "no group", not "unknown" — never issue a move on it.
  it('is false for a missing or null group id', () => {
    expect(needsUngroupCall({})).toBe(false);
    expect(needsUngroupCall({ groupId: null })).toBe(false);
  });

  // Guards are applied at call sites that may hold nothing; return a decision
  // rather than throwing.
  it('is false for a missing tab', () => {
    expect(needsUngroupCall(undefined)).toBe(false);
    expect(needsUngroupCall(null)).toBe(false);
  });
});

describe('bucketTabsByWindow', () => {
  // The cross-window fix. Tabs in two windows must resolve to two separate
  // buckets so each window gets its own Chrome group — grouping them together
  // would physically drag tabs across windows.
  it('splits tabs into one bucket per window', () => {
    const a = { tabKey: 'tab-1', windowId: 1, pinned: false };
    const b = { tabKey: 'tab-2', windowId: 2, pinned: false };
    const c = { tabKey: 'tab-3', windowId: 1, pinned: false };

    const byWindow = bucketTabsByWindow([a, b, c]);

    expect(byWindow.size).toBe(2);
    expect(byWindow.get(1)).toEqual([a, c]);
    expect(byWindow.get(2)).toEqual([b]);
  });

  // Pinned tabs are never grouped. Dropping them here matters beyond tidiness: a
  // bucket holding ONLY pinned tabs would otherwise cause an empty Chrome group
  // to be created for that window.
  it('drops pinned tabs so they never create a bucket', () => {
    const byWindow = bucketTabsByWindow([
      { tabKey: 'tab-1', windowId: 1, pinned: true },
      { tabKey: 'tab-2', windowId: 2, pinned: false },
    ]);

    expect(byWindow.has(1)).toBe(false);
    expect(byWindow.get(2)).toHaveLength(1);
  });

  // activeTabs entries persisted by a build predating the windowId field carry no
  // window. They must still be grouped (bucketed under undefined, where the
  // caller falls back to an unscoped query) rather than silently dropped.
  it('buckets entries with no windowId under undefined', () => {
    const legacy = { tabKey: 'tab-1', pinned: false };

    const byWindow = bucketTabsByWindow([legacy]);

    expect(byWindow.get(undefined)).toEqual([legacy]);
  });

  // An all-pinned or empty input must yield no buckets at all, so the caller
  // issues no Chrome calls.
  it('returns an empty map for empty or missing input', () => {
    expect(bucketTabsByWindow([]).size).toBe(0);
    expect(bucketTabsByWindow(undefined).size).toBe(0);
    expect(bucketTabsByWindow([{ windowId: 1, pinned: true }]).size).toBe(0);
  });
});
