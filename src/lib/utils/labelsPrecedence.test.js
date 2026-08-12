import { describe, it, expect } from 'vitest';
import { resolveLabelsAcrossAreas, LabelsSource } from './labelsPrecedence';

const WORK = { Work: { title: 'Work', urlKeys: [] } };
const STALE = { Stale: { title: 'Stale', urlKeys: [] } };

describe('resolveLabelsAcrossAreas', () => {
  // Sync is the copy that survives an uninstall, which is the entire reason
  // labels moved there. When both areas hold groups, that is the one to run on.
  it('prefers sync when both areas hold groups', () => {
    const resolved = resolveLabelsAcrossAreas(WORK, STALE);

    expect(resolved.source).toBe(LabelsSource.SYNC);
    expect(resolved.labels).toBe(WORK);
  });

  // The local copy only exists because writeByArea redirected a REFUSED sync
  // write, so when sync has nothing it is the group mutation the user just made.
  it('falls back to local when sync holds nothing', () => {
    const resolved = resolveLabelsAcrossAreas(undefined, WORK);

    expect(resolved.source).toBe(LabelsSource.LOCAL);
    expect(resolved.labels).toBe(WORK);
  });

  // An empty map is the HYDRATED DEFAULT, not an authoritative answer. Treating
  // it as one would let an empty sync area permanently shadow a populated local
  // one — the same trap decideMigration avoids with the same predicate.
  it('does not let an empty sync map shadow a populated local one', () => {
    const resolved = resolveLabelsAcrossAreas({}, WORK);

    expect(resolved.source).toBe(LabelsSource.LOCAL);
    expect(resolved.labels).toBe(WORK);
  });

  // Neither area has anything to offer. The caller must be able to tell this
  // apart from "local won with an empty map", because it still has a read to do.
  it('reports neither when both areas are empty', () => {
    const resolved = resolveLabelsAcrossAreas({}, {});

    expect(resolved.source).toBe(LabelsSource.NEITHER);
    expect(resolved.labels).toBeUndefined();
  });

  // The fresh-install shape: nothing written to either area yet.
  it('reports neither when both areas are absent', () => {
    const resolved = resolveLabelsAcrossAreas(undefined, undefined);

    expect(resolved.source).toBe(LabelsSource.NEITHER);
  });

  // A non-object value is not a labels map however truthy it is, so it must not
  // win a precedence contest against a real one.
  it('ignores a non-object value in favour of a real labels map', () => {
    const resolved = resolveLabelsAcrossAreas('corrupted', WORK);

    expect(resolved.source).toBe(LabelsSource.LOCAL);
    expect(resolved.labels).toBe(WORK);
  });
});
