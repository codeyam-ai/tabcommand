import { describe, it, expect } from 'vitest';
import { matchingBrace, salvageLabels } from './salvageLabels';

const TWO_GROUPS =
  '[{"title":"Work","urls":[{"url":"https://a.com"}]},'
  + '{"title":"Reading","urls":[{"url":"https://b.com"}]}]';

describe('matchingBrace', () => {
  // The ordinary balanced object.
  it('finds the brace closing a flat object', () => {
    expect(matchingBrace('{"a":1}', 0)).toBe(6);
  });

  // A label object contains nested url objects; the scan must not stop at the
  // first inner closer.
  it('skips past nested objects', () => {
    const text = '{"urls":[{"url":"a"}]}';

    expect(matchingBrace(text, 0)).toBe(text.length - 1);
  });

  // A page title is entitled to contain a brace, and counting it would throw
  // the depth off and truncate a perfectly good group.
  it('ignores braces inside a string', () => {
    const text = '{"t":"a } b"}';

    expect(matchingBrace(text, 0)).toBe(text.length - 1);
  });

  // -1 IS the truncation signal — this is how a file cut mid-copy is detected.
  it('returns -1 when the object never closes', () => {
    expect(matchingBrace('{"title":"Work","ur', 0)).toBe(-1);
  });
});

describe('salvageLabels', () => {
  // THE TRUNCATION CASE. A backup cut mid-copy should still give back the
  // groups that survived rather than failing whole.
  it('recovers the intact groups from a truncated snapshot and counts the loss', () => {
    const truncated = '[{"title":"Work","urls":[{"url":"https://a.com"}]},{"title":"Read","ur';

    const salvaged = salvageLabels(truncated);

    expect(salvaged.labels).toHaveLength(1);
    expect(salvaged.labels[0].title).toBe('Work');
    expect(salvaged.lost).toBe(1);
  });

  // Nothing damaged means nothing lost — the count must not manufacture a loss
  // that would be reported to the user.
  it('recovers every group from an intact snapshot with nothing lost', () => {
    const salvaged = salvageLabels(TWO_GROUPS);

    expect(salvaged.labels).toHaveLength(2);
    expect(salvaged.lost).toBe(0);
  });

  // An export nested inside a wrapper object still holds the user's groups, so
  // the scan steps INSIDE rather than discarding the whole document.
  it('finds labels nested inside a wrapper object', () => {
    const salvaged = salvageLabels(`{"export":${TWO_GROUPS}}`);

    expect(salvaged.labels).toHaveLength(2);
  });

  // Salvage only recovers LABELS. A document of objects that are not groups
  // yields nothing, so the caller reports a failure rather than importing junk.
  it('recovers nothing from objects that are not labels', () => {
    expect(salvageLabels('[{"a":1},{"b":2}]').labels).toEqual([]);
  });

  // Text with no objects at all has nothing to scan.
  it('recovers nothing from text with no objects', () => {
    expect(salvageLabels('[1, 2, 3]').labels).toEqual([]);
  });

  // The salvage rung sits below the relaxed rung, so an individual object that
  // needs relaxing is still recoverable on its own.
  it('recovers a group whose object needs relaxed syntax', () => {
    const salvaged = salvageLabels("[{title:'Work',urls:[]},{broken");

    expect(salvaged.labels).toHaveLength(1);
    expect(salvaged.labels[0].title).toBe('Work');
  });
});
