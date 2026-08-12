import { describe, it, expect } from 'vitest';
import { orderedSyncPlan, staleFiles, MANIFEST } from './sync-extension-dir.mjs';

// The two rules that keep the loaded extension directory readable at every
// instant. Chrome watches this directory continuously, so a violation of either
// is not a cosmetic build wart — it is the uninstall that destroys the user's
// chrome.storage.local, which is the incident this whole feature exists to
// prevent.
describe('orderedSyncPlan', () => {
  // A directory holding a manifest IS an installed extension to Chrome, so the
  // manifest must land only once its assets are already there.
  it('writes manifest.json last', () => {
    const plan = orderedSyncPlan(['manifest.json', 'assets/index.js', 'popup/popup.html']);
    expect(plan[plan.length - 1]).toBe(MANIFEST);
  });

  // Reordering must never lose or invent a file, or the mirror silently drifts
  // from the build.
  it('preserves every source file exactly once', () => {
    const source = ['manifest.json', 'a.js', 'b/c.png', 'b/d.css'];
    const plan = orderedSyncPlan(source);
    expect([...plan].sort()).toEqual([...source].sort());
    expect(plan).toHaveLength(source.length);
  });

  // Asset order among themselves is irrelevant and must be left alone.
  it('keeps the relative order of the assets', () => {
    expect(orderedSyncPlan(['a.js', 'manifest.json', 'b.js'])).toEqual(['a.js', 'b.js', 'manifest.json']);
  });

  // A build with no manifest is a broken build, not a crash here.
  it('handles a source list with no manifest', () => {
    expect(orderedSyncPlan(['a.js', 'b.js'])).toEqual(['a.js', 'b.js']);
  });

  // An empty build produces an empty plan rather than a bare manifest write.
  it('handles an empty source list', () => {
    expect(orderedSyncPlan([])).toEqual([]);
  });
});

describe('staleFiles', () => {
  // Hashed asset names change every build, so last build's files must go or the
  // directory grows without bound.
  it('reports target files the new build no longer produces', () => {
    expect(staleFiles(['manifest.json', 'assets/new-abc.js'], ['manifest.json', 'assets/old-xyz.js']))
      .toEqual(['assets/old-xyz.js']);
  });

  // The failure that would delete a live extension's code: anything still in the
  // build must never be reported stale.
  it('never reports a file the new build still produces', () => {
    const source = ['manifest.json', 'assets/index.js', 'popup/popup.html'];
    expect(staleFiles(source, source)).toEqual([]);
  });

  // A first sync into an empty directory removes nothing.
  it('reports nothing when the target is empty', () => {
    expect(staleFiles(['manifest.json'], [])).toEqual([]);
  });

  // Every target file is stale when the build produced none — but the caller
  // only ever deletes files, never the directory itself.
  it('reports every target file when the source list is empty', () => {
    expect(staleFiles([], ['a.js', 'b.js'])).toEqual(['a.js', 'b.js']);
  });

  // Paths are compared whole, so a nested file is not confused with a
  // same-named file at the root.
  it('distinguishes nested paths from same-named root files', () => {
    expect(staleFiles(['assets/index.js'], ['index.js', 'assets/index.js'])).toEqual(['index.js']);
  });
});
