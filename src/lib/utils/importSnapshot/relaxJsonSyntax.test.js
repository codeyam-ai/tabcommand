import { describe, it, expect } from 'vitest';
import { rewriteRelaxedSyntax, stripTrailingCommas, relaxSyntax } from './relaxJsonSyntax';

describe('rewriteRelaxedSyntax', () => {
  // Someone opened their backup in an editor and left a note to themselves.
  it('drops a line comment', () => {
    expect(rewriteRelaxedSyntax('[ // mine\n{"a":1}]').text).toBe('[ \n{"a":1}]');
  });

  // The block form of the same thing.
  it('drops a block comment', () => {
    expect(rewriteRelaxedSyntax('[/* mine */{"a":1}]').text).toBe('[{"a":1}]');
  });

  // A JavaScript habit that JSON does not share.
  it('requotes a single-quoted string', () => {
    expect(rewriteRelaxedSyntax("[{'title':'Work'}]").text).toBe('[{"title":"Work"}]');
  });

  // The same habit applied to keys.
  it('quotes an unquoted key', () => {
    expect(rewriteRelaxedSyntax('[{title:"Work"}]').text).toBe('[{"title":"Work"}]');
  });

  // true / false / null are real JSON literals and must survive untouched — the
  // unquoted-key rule must not mistake them for bare identifiers.
  it('leaves the real JSON literals alone', () => {
    expect(rewriteRelaxedSyntax('[{"a":true,"b":false,"c":null}]').changed).toBe(false);
  });

  // The non-JSON literals have no representation, so they degrade to null
  // rather than failing the whole parse.
  it('turns undefined and NaN into null', () => {
    expect(rewriteRelaxedSyntax('[{"a":undefined,"b":NaN}]').text).toBe('[{"a":null,"b":null}]');
  });

  // A page title is allowed to contain anything, including things that look
  // like syntax. String contents are copied through verbatim.
  it('leaves comment-like text inside a string alone', () => {
    const text = '[{"title":"https://a.com // not a comment"}]';

    expect(rewriteRelaxedSyntax(text).changed).toBe(false);
  });

  // Requoting turns a bare inner double quote into a structural one, so it has
  // to be escaped or the rewrite produces broken JSON.
  it('escapes a double quote found inside a single-quoted string', () => {
    expect(rewriteRelaxedSyntax("[{'t':'say \"hi\"'}]").text).toBe('[{"t":"say \\"hi\\""}]');
  });
});

describe('stripTrailingCommas', () => {
  // The classic hand-edit: delete the last group, leave its comma behind.
  it('drops a comma before a closing bracket', () => {
    expect(stripTrailingCommas('[{"a":1},]').text).toBe('[{"a":1}]');
  });

  // The same inside an object.
  it('drops a comma before a closing brace', () => {
    expect(stripTrailingCommas('{"a":1,}').text).toBe('{"a":1}');
  });

  // A separating comma is load-bearing and must survive.
  it('keeps a comma that separates two members', () => {
    expect(stripTrailingCommas('[{"a":1},{"b":2}]').changed).toBe(false);
  });

  // A comma inside a title is content, not syntax.
  it('leaves a comma inside a string alone', () => {
    expect(stripTrailingCommas('[{"t":"a, b"}]').changed).toBe(false);
  });
});

describe('relaxSyntax', () => {
  // The rungs compose: a hand-edited file usually carries more than one habit.
  it('applies both relaxations and reports the change', () => {
    const relaxed = relaxSyntax("[{title:'Work'},]");

    expect(relaxed.text).toBe('[{"title":"Work"}]');
    expect(relaxed.changed).toBe(true);
  });

  // Strict JSON must report NO change, so the caller can skip a redundant
  // re-parse rather than reporting a repair that did not happen.
  it('reports no change for text that is already strict JSON', () => {
    expect(relaxSyntax('[{"title":"Work"}]').changed).toBe(false);
  });
});
