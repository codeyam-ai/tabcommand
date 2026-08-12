import { describe, it, expect } from 'vitest';
import { describeImport } from './describeImport';
import { Repair } from './repairTransportDamage';

describe('describeImport', () => {
  // Healthy input must produce NOTHING. A reassuring message on every import
  // would make the real repair notices invisible by making them routine.
  it('says nothing about a clean, complete import', () => {
    expect(describeImport({ repairs: [], recovered: 3, lost: 0 })).toBeNull();
  });

  // Silent repair would leave the user believing a damaged backup is healthy,
  // so the repair is named, not just performed.
  it('names the repair on a snapshot that needed fixing', () => {
    const notice = describeImport({ repairs: [Repair.LINE_BREAKS], recovered: 2, lost: 0 });

    expect(notice).toContain('Restored 2 groups');
    expect(notice).toContain(Repair.LINE_BREAKS);
  });

  // Silent PARTIAL recovery is the worst outcome of all — it looks exactly like
  // a complete restore, so the missing groups are never missed until needed.
  it('states plainly how many groups were lost', () => {
    const notice = describeImport({ repairs: [Repair.SALVAGE], recovered: 3, lost: 2 });

    expect(notice).toContain('Recovered 3 groups');
    expect(notice).toContain('2 groups were');
    expect(notice).toContain('could not be restored');
  });

  // The loss sentence already accounts for the damage, so repeating it as a
  // named repair would read like two separate problems.
  it('does not also list salvage as a repair when groups were lost', () => {
    const notice = describeImport({ repairs: [Repair.SALVAGE], recovered: 1, lost: 1 });

    expect(notice).not.toContain('was repaired before importing');
  });

  // A snapshot can be both repaired AND partly lost; the user needs both facts.
  it('reports the other repairs alongside a loss', () => {
    const notice = describeImport({
      repairs: [Repair.FENCE, Repair.SALVAGE],
      recovered: 1,
      lost: 1,
    });

    expect(notice).toContain('could not be restored');
    expect(notice).toContain(Repair.FENCE);
  });

  // Singular and plural both read correctly — "1 groups were" is the kind of
  // sloppiness that makes a data-loss message feel untrustworthy.
  it('uses singular wording for a single lost group', () => {
    const notice = describeImport({ repairs: [], recovered: 1, lost: 1 });

    expect(notice).toContain('1 group was');
    expect(notice).toContain('Recovered 1 group.');
  });

  // Several repairs read as a sentence, not a comma-separated dump.
  it('joins multiple repairs into a readable phrase', () => {
    const notice = describeImport({
      repairs: [Repair.FENCE, Repair.SMART_QUOTES, Repair.LINE_BREAKS],
      recovered: 1,
      lost: 0,
    });

    expect(notice).toContain(`${Repair.SMART_QUOTES} and ${Repair.LINE_BREAKS}`);
  });
});
