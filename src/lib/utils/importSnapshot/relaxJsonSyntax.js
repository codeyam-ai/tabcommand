// Pass 3 of the import escalation ladder: the JSON a HUMAN hand-edited.
//
// Where the transport repairs undo what a medium did to the text, this undoes
// what a person did to it — someone who opened their backup in an editor to
// delete a group, left a trailing comma or a `// note to self`, and pasted it
// back. None of that is valid JSON and all of it is recoverable.
//
// Hand-rolled rather than pulled from a JSON5 dependency: this is a browser
// extension, the payload is a few kilobytes, and the tolerated set is small and
// fixed. Shipping a parser dependency to accept trailing commas is a bad trade.
//
// Every rule here applies only OUTSIDE a string literal. String contents are
// copied through verbatim, so a page title containing `//` or an apostrophe is
// never mistaken for syntax.

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

// Rewrite the relaxed forms into strict JSON: `//` and `/* */` comments dropped,
// single-quoted strings requoted, unquoted keys quoted, and the non-JSON
// literals NaN / Infinity / undefined turned into null.
export function rewriteRelaxedSyntax(text) {
  let out = '';
  let changed = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      changed = true;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      changed = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') { out += text[i] + (text[i + 1] || ''); i += 2; continue; }
        out += text[i];
        i += 1;
        if (text[i - 1] === '"') break;
      }
      continue;
    }

    if (ch === "'") {
      changed = true;
      out += '"';
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          // An escaped single quote no longer needs escaping once requoted.
          if (text[i + 1] === "'") { out += "'"; i += 2; continue; }
          out += text[i] + (text[i + 1] || '');
          i += 2;
          continue;
        }
        if (text[i] === "'") { out += '"'; i += 1; break; }
        // A bare double quote inside a single-quoted string becomes structural
        // the moment the string is requoted, so it has to be escaped.
        if (text[i] === '"') { out += '\\"'; i += 1; continue; }
        out += text[i];
        i += 1;
      }
      continue;
    }

    if (IDENT_START.test(ch)) {
      let end = i;
      while (end < text.length && IDENT_PART.test(text[end])) end += 1;
      const word = text.slice(i, end);

      let after = end;
      while (after < text.length && /\s/.test(text[after])) after += 1;

      if (text[after] === ':') {
        out += `"${word}"`;
        changed = true;
      } else if (word === 'NaN' || word === 'Infinity' || word === 'undefined') {
        out += 'null';
        changed = true;
      } else {
        // true / false / null pass through untouched.
        out += word;
      }
      i = end;
      continue;
    }

    if (text.startsWith('-Infinity', i)) {
      out += 'null';
      changed = true;
      i += '-Infinity'.length;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { text: out, changed };
}

// Drop a comma that sits immediately before a closing brace or bracket. Runs
// AFTER the rewrite above, so every remaining string is double-quoted and the
// string-skipping here only has to handle one quote character.
export function stripTrailingCommas(text) {
  let out = '';
  let changed = false;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }

    if (!inString && ch === ',') {
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] === '}' || text[next] === ']') { changed = true; continue; }
    }

    out += ch;
  }

  return { text: out, changed };
}

// Both relaxations in order. `changed` is false for text that was already strict
// JSON syntax, which is what lets the caller skip a redundant re-parse.
export function relaxSyntax(text) {
  const rewritten = rewriteRelaxedSyntax(text);
  const decommaed = stripTrailingCommas(rewritten.text);
  return { text: decommaed.text, changed: rewritten.changed || decommaed.changed };
}
