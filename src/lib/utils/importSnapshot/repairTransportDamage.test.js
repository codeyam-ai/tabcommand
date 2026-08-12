import { describe, it, expect } from 'vitest';
import {
  Repair,
  stripCodeFence,
  stripWrapper,
  normalizeInvisibleCharacters,
  spaceOutControlCharacters,
  straightenSmartQuotes,
  buildRepairCandidates,
} from './repairTransportDamage';

describe('spaceOutControlCharacters', () => {
  // THE CONFIRMED REAL-WORLD FAILURE. A user's snapshot was line-wrapped by the
  // medium they pasted it through, replacing spaces inside page titles with raw
  // newlines. JSON.parse rejected it with "Bad control character in string
  // literal" and the user was told nothing at all.
  it('replaces a raw newline inside a string with the space it displaced', () => {
    const wrapped = '{"title":"Screen\nPorch Scope Doc"}';

    expect(spaceOutControlCharacters(wrapped)).toBe('{"title":"Screen Porch Scope Doc"}');
  });

  // A CRLF pair replaced ONE space, so it must collapse to one — not two.
  it('collapses a CRLF pair inside a string to a single space', () => {
    expect(spaceOutControlCharacters('{"t":"a\r\nb"}')).toBe('{"t":"a b"}');
  });

  // Outside a string, newlines are ordinary legal JSON whitespace. Rewriting
  // them would be pointless churn on a pretty-printed but perfectly valid file.
  it('leaves newlines outside a string alone', () => {
    expect(spaceOutControlCharacters('{\n  "t": "a"\n}')).toBeNull();
  });

  // An escaped \n is the CORRECT encoding — what JSON.stringify emits. Touching
  // it would corrupt a title that genuinely contains a line break.
  it('leaves an escaped newline escape sequence intact', () => {
    expect(spaceOutControlCharacters('{"t":"a\\nb"}')).toBeNull();
  });

  // Tabs arrive the same way newlines do, from the same wrapping media.
  it('replaces a raw tab inside a string', () => {
    expect(spaceOutControlCharacters('{"t":"a\tb"}')).toBe('{"t":"a b"}');
  });
});

describe('stripCodeFence', () => {
  // Pasting a snapshot into a chat client or markdown doc wraps it in a fence.
  it('unwraps a fenced snapshot', () => {
    expect(stripCodeFence('```json\n[{"title":"Work"}]\n```')).toBe('[{"title":"Work"}]');
  });

  // A bare snapshot has no fence, and reporting a repair that did not happen
  // would tell the user their healthy file was damaged.
  it('returns null when there is no fence', () => {
    expect(stripCodeFence('[{"title":"Work"}]')).toBeNull();
  });
});

describe('stripWrapper', () => {
  // "here's my backup:" pasted along with the snapshot.
  it('slices prose away from around the snapshot', () => {
    expect(stripWrapper('here is my backup: [{"title":"Work"}] thanks'))
      .toBe('[{"title":"Work"}]');
  });

  // An already-clean snapshot must report no repair, so the notice stays silent
  // on healthy input.
  it('returns null when the text is already just the snapshot', () => {
    expect(stripWrapper('[{"title":"Work"}]')).toBeNull();
  });

  // Nothing structural to anchor on means nothing to slice.
  it('returns null when there is no structural character at all', () => {
    expect(stripWrapper('just some words')).toBeNull();
  });
});

describe('normalizeInvisibleCharacters', () => {
  // These are the cruel ones: the user can see NOTHING wrong with the text they
  // pasted, so a bare rejection leaves them with no way to guess the problem.
  it('turns a non-breaking space into an ordinary space', () => {
    expect(normalizeInvisibleCharacters('[{"a":\u00A01}]')).toBe('[{"a": 1}]');
  });

  // A BOM or zero-width space carries no width at all, so it is dropped rather
  // than replaced.
  it('drops a zero-width character', () => {
    expect(normalizeInvisibleCharacters('\uFEFF[{"a":1}]')).toBe('[{"a":1}]');
  });

  // Clean text must report no repair.
  it('returns null for text with no invisible characters', () => {
    expect(normalizeInvisibleCharacters('[{"a":1}]')).toBeNull();
  });
});

describe('straightenSmartQuotes', () => {
  // A word processor autocorrects the structural quotes along with the prose.
  it('straightens curly double quotes', () => {
    expect(straightenSmartQuotes('{\u201Ctitle\u201D:\u201CWork\u201D}')).toBe('{"title":"Work"}');
  });

  // Already-straight quotes are the overwhelmingly common case and must not be
  // reported as a repair.
  it('returns null when the quotes are already straight', () => {
    expect(straightenSmartQuotes('{"title":"Work"}')).toBeNull();
  });
});

describe('buildRepairCandidates', () => {
  // Index 0 is ALWAYS the untouched paste. That is what lets the caller try a
  // strict parse first and report the original error position on total failure.
  it('always offers the untouched paste as the first candidate', () => {
    const candidates = buildRepairCandidates('[{"title":"Work"}]');

    expect(candidates[0].text).toBe('[{"title":"Work"}]');
    expect(candidates[0].repairs).toEqual([]);
  });

  // Healthy input produces exactly one candidate, so no repair can be reported.
  it('offers only the original when nothing needs repairing', () => {
    expect(buildRepairCandidates('[{"title":"Work"}]')).toHaveLength(1);
  });

  // Repairs stack cumulatively, each candidate carrying the labels for every
  // repair applied so far — so the caller can report the minimal working set.
  it('accumulates repair labels across successive candidates', () => {
    const candidates = buildRepairCandidates('```json\n[{"t":"a\nb"}]\n```');
    const last = candidates[candidates.length - 1];

    expect(last.repairs).toContain(Repair.FENCE);
    expect(last.repairs).toContain(Repair.LINE_BREAKS);
    expect(last.text).toBe('[{"t":"a b"}]');
  });
});
