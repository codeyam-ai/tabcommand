// Reading a pasted export snapshot as forgivingly as it can be read.
//
// This text is the user's OWN backup of their OWN groups. Nothing in it is
// executed and nothing in it is trusted from a third party, so the only question
// worth asking is "can the groups be recovered from this?" — and if the answer
// is yes, they are recovered. Refusing a snapshot on a technicality helps no one
// and is exactly how a user loses data they had correctly backed up.
//
// The parse ESCALATES rather than failing, one module per rung:
//
//   1. strict `JSON.parse`                    — the fast path for an intact file
//   2. ./repairTransportDamage                — what a medium did to it in transit
//   3. ./relaxJsonSyntax                      — what a person did to it by hand
//   4. ./salvageLabels                        — whatever survives in a truncated file
//
// and then ./validateSnapshotShape refuses anything that read cleanly but is not
// an export, because a permissive parse must not become a permissive import.

import { buildRepairCandidates, Repair } from './repairTransportDamage';
import { relaxSyntax } from './relaxJsonSyntax';
import { salvageLabels } from './salvageLabels';
import { asLabelList } from './validateSnapshotShape';

export { Repair } from './repairTransportDamage';
export { normalizeLabel, asLabelList } from './validateSnapshotShape';
export { describeImport } from './describeImport';

export const ImportFailure = {
  // Nothing was pasted. Not an error — there is simply nothing to do.
  EMPTY: 'empty',
  // No pass could read it as JSON at all.
  UNPARSEABLE: 'unparseable',
  // It parsed, but it is not an export.
  WRONG_SHAPE: 'wrong-shape',
};

const WRONG_SHAPE_MESSAGE =
  'That text is readable, but it is not a TabCommand export. An export is a list '
  + 'of groups, each with a title and a list of urls. Copy a snapshot from the '
  + 'Export section below and paste that instead.';

function succeed(shaped, repairs, extraLost) {
  return {
    ok: true,
    labels: shaped.labels,
    repairs,
    recovered: shaped.labels.length,
    lost: (shaped.dropped || 0) + (extraLost || 0),
  };
}

// Read a pasted snapshot. Returns either
//   { ok: true,  labels, repairs, recovered, lost }
//   { ok: false, failure, message }
export function parseImportSnapshot(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, failure: ImportFailure.EMPTY, message: '' };
  }

  const candidates = buildRepairCandidates(text);
  let originalError = null;
  let sawWrongShape = false;

  // Passes 1 and 2 in one ladder: candidate 0 IS the strict parse of the
  // untouched paste, and each later candidate carries one more repair. First
  // success wins, so the repair set reported to the user is the minimal one.
  for (const candidate of candidates) {
    let value;
    try {
      value = JSON.parse(candidate.text);
    } catch (e) {
      if (originalError === null) originalError = e;
      continue;
    }

    const shaped = asLabelList(value);
    if (shaped) return succeed(shaped, candidate.repairs, 0);

    // It parsed cleanly and is simply not an export. Repairing it further cannot
    // change that, and when the UNTOUCHED paste parsed, this is the final word.
    if (candidate.repairs.length === 0) {
      return { ok: false, failure: ImportFailure.WRONG_SHAPE, message: WRONG_SHAPE_MESSAGE };
    }
    sawWrongShape = true;
  }

  // Pass 3: relaxed syntax, over the same ladder for the same reason.
  for (const candidate of candidates) {
    const relaxed = relaxSyntax(candidate.text);
    if (!relaxed.changed) continue;

    let value;
    try {
      value = JSON.parse(relaxed.text);
    } catch {
      continue;
    }

    const shaped = asLabelList(value);
    if (shaped) return succeed(shaped, [...candidate.repairs, Repair.RELAXED], 0);
    sawWrongShape = true;
  }

  // Pass 4: salvage. Take whichever candidate yields the most groups — a repair
  // that did not produce valid JSON overall may still have unblocked more of the
  // individual objects inside it.
  let best = null;
  for (const candidate of candidates) {
    const salvaged = salvageLabels(candidate.text);
    if (!salvaged.labels.length) continue;
    if (!best || salvaged.labels.length > best.salvaged.labels.length) {
      best = { salvaged, repairs: candidate.repairs };
    }
  }

  if (best) {
    return succeed(
      { labels: best.salvaged.labels, dropped: 0 },
      [...best.repairs, Repair.SALVAGE],
      best.salvaged.lost,
    );
  }

  if (sawWrongShape) {
    return { ok: false, failure: ImportFailure.WRONG_SHAPE, message: WRONG_SHAPE_MESSAGE };
  }

  // Report the ORIGINAL error, from the untouched paste. An error raised against
  // a repaired copy points at a position that does not exist in what the user is
  // looking at, which is worse than no position at all.
  return {
    ok: false,
    failure: ImportFailure.UNPARSEABLE,
    message: `That snapshot could not be read: ${originalError ? originalError.message : 'it is not valid JSON'}.`,
  };
}
