import { describe, it, expect } from 'vitest';
import { parseImportSnapshot, ImportFailure, Repair } from './index';

const INTACT = '[{"title":"Work","urls":[{"url":"https://a.com","title":"A"}]}]';

describe('parseImportSnapshot', () => {
  // The fast path: an intact snapshot parses strictly and reports NO repair, so
  // healthy input never shows the user a message suggesting it was damaged.
  it('reads an intact snapshot with no repairs reported', () => {
    const parsed = parseImportSnapshot(INTACT);

    expect(parsed.ok).toBe(true);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.recovered).toBe(1);
    expect(parsed.lost).toBe(0);
  });

  // THE CONFIRMED REAL-WORLD FAILURE, end to end: a snapshot hard-wrapped by
  // the medium it was pasted through. It used to fail silently.
  it('repairs and reads a hard-wrapped snapshot', () => {
    const parsed = parseImportSnapshot('[{"title":"Work\nGroup","urls":[]}]');

    expect(parsed.ok).toBe(true);
    expect(parsed.repairs).toEqual([Repair.LINE_BREAKS]);
    expect(parsed.labels[0].title).toBe('Work Group');
  });

  // Pasted out of a chat client or markdown document.
  it('reads a snapshot wrapped in a markdown code fence', () => {
    const parsed = parseImportSnapshot(`\`\`\`json\n${INTACT}\n\`\`\``);

    expect(parsed.ok).toBe(true);
    expect(parsed.repairs).toEqual([Repair.FENCE]);
  });

  // Hand-edited along the way.
  it('reads a snapshot with a trailing comma and a comment', () => {
    const parsed = parseImportSnapshot('[{"title":"Work","urls":[]}, ] // mine');

    expect(parsed.ok).toBe(true);
    expect(parsed.repairs).toContain(Repair.RELAXED);
  });

  // Cut mid-copy: recover what survived and account for what did not.
  it('salvages the readable groups from a truncated snapshot', () => {
    const parsed = parseImportSnapshot('[{"title":"Work","urls":[]},{"title":"Read","ur');

    expect(parsed.ok).toBe(true);
    expect(parsed.recovered).toBe(1);
    expect(parsed.lost).toBe(1);
  });

  // A permissive parse must not become a permissive import.
  it('rejects readable JSON that is not an export', () => {
    const parsed = parseImportSnapshot('[1, 2, 3]');

    expect(parsed.ok).toBe(false);
    expect(parsed.failure).toBe(ImportFailure.WRONG_SHAPE);
  });

  // An empty paste is not an error — there is nothing to do and nothing to
  // destroy, so the page must stay silent rather than showing a scary message.
  it('treats an empty paste as nothing to do rather than a failure', () => {
    const parsed = parseImportSnapshot('   ');

    expect(parsed.ok).toBe(false);
    expect(parsed.failure).toBe(ImportFailure.EMPTY);
    expect(parsed.message).toBe('');
  });

  // The error must point at a position that exists in what the USER is looking
  // at. An offset into a repaired copy is worse than no offset at all.
  it('reports the original parse error when nothing can be recovered', () => {
    const parsed = parseImportSnapshot('{ not json at all ');

    expect(parsed.ok).toBe(false);
    expect(parsed.failure).toBe(ImportFailure.UNPARSEABLE);
    expect(parsed.message).toContain('could not be read');
  });

  // Importing an empty list would clear every group the user currently has —
  // the exact outcome this feature exists to prevent.
  it('refuses an empty list rather than clearing the user groups', () => {
    const parsed = parseImportSnapshot('[]');

    expect(parsed.ok).toBe(false);
    expect(parsed.failure).toBe(ImportFailure.WRONG_SHAPE);
  });
});
