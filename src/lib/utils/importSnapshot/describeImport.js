// Telling the user what actually happened to their snapshot.
//
// Separate from the parsing because it is a different obligation. The parser's
// job is to recover as much as it can; this one's job is to make sure the
// recovery is never silent. Silent repair would leave a user believing a damaged
// backup is healthy, and silent PARTIAL recovery is worse still — it looks
// exactly like a complete restore, so the groups that were lost are never
// missed until they are needed.

import { Repair } from './repairTransportDamage';

function joinPhrases(phrases) {
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

// The one-line account of an import that succeeded but was not intact.
//
// Returns null for a CLEAN import — there is nothing to say, and saying
// something anyway would make healthy input look suspect every single time.
export function describeImport({ repairs = [], recovered = 0, lost = 0 } = {}) {
  const groups = (n) => `${n} ${n === 1 ? 'group' : 'groups'}`;

  // When groups were lost, the count sentence already accounts for the damage.
  // Naming it a second time as a "repair" reads like two separate problems.
  const named = lost > 0 ? repairs.filter((r) => r !== Repair.SALVAGE) : repairs;

  const parts = [];

  if (lost > 0) {
    parts.push(
      `Recovered ${groups(recovered)}. ${groups(lost)} ${lost === 1 ? 'was' : 'were'} `
      + 'too damaged to read and could not be restored.',
    );
  }

  if (named.length) {
    parts.push(
      `${lost > 0 ? 'The snapshot' : `Restored ${groups(recovered)}. The snapshot`}`
      + ` was repaired before importing — it had ${joinPhrases(named)}.`,
    );
  }

  return parts.length ? parts.join(' ') : null;
}

export default describeImport;
