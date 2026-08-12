// Which copy of `labels` wins when the two storage areas disagree.
//
// This is the core decision behind the local-fallback read, and it lives in its
// own module precisely so it is settled ONCE and explicitly rather than falling
// out of whichever `Object.assign` happens to run last in `readByArea`.
//
// Both areas can legitimately hold groups at the same time. Sync is the copy
// that survives an uninstall, which is the entire reason `labels` moved there,
// so sync is authoritative whenever it actually has groups. A local value only
// exists because `writeByArea` redirected a REFUSED sync write, so it is the
// newer write by construction — but "newer" is not the property that matters
// here; "survives the thing this feature exists to survive" is.
//
// The rule is expressed through `hasGroups`, deliberately the same predicate
// `decideMigration` applies on worker boot. That shared predicate is what keeps
// the read path and the migration from inventing two different answers to the
// same question: an EMPTY map is the hydrated default, not an authoritative
// answer, so an empty sync area can never permanently shadow a populated local
// one in either place.

import { hasGroups } from './migrateLabelsToSync';

export const LabelsSource = {
  SYNC: 'sync',
  LOCAL: 'local',
  // Neither area holds groups. NOT the same as "local wins with an empty map" —
  // the caller still has a read to do before it can conclude anything.
  NEITHER: 'neither',
};

export function resolveLabelsAcrossAreas(syncLabels, localLabels) {
  if (hasGroups(syncLabels)) {
    return { source: LabelsSource.SYNC, labels: syncLabels };
  }

  if (hasGroups(localLabels)) {
    return { source: LabelsSource.LOCAL, labels: localLabels };
  }

  return { source: LabelsSource.NEITHER, labels: undefined };
}

export default resolveLabelsAcrossAreas;
