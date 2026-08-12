// Pass 4 of the import escalation ladder: the last resort.
//
// For a snapshot truncated mid-copy — a real and common way a backup breaks.
// Rather than failing whole, pull out every well-formed label object that can
// still be read and restore those. A user whose file was cut in half should get
// back the groups that survived, not a refusal.

import { relaxSyntax } from './relaxJsonSyntax';
import { normalizeLabel } from './validateSnapshotShape';

// The index of the `}` closing the `{` at `start`, or -1 when the text runs out
// first — which IS the truncation signal. String-aware, so a brace inside a page
// title cannot throw off the depth count.
export function matchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

// Scan for readable label objects, returning what was recovered and how many
// were lost. The `lost` count is what makes a partial restore honest: a silent
// partial recovery looks exactly like a complete one, which is worse than a
// clean failure.
export function salvageLabels(text) {
  const labels = [];
  let lost = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '{') { i += 1; continue; }

    const end = matchingBrace(text, i);
    if (end === -1) {
      // The text ends mid-object: exactly one group was cut in half.
      lost += 1;
      break;
    }

    const chunk = text.slice(i, end + 1);
    let value = null;
    try {
      value = JSON.parse(chunk);
    } catch {
      const relaxed = relaxSyntax(chunk);
      try { value = JSON.parse(relaxed.text); } catch { value = null; }
    }

    const label = value ? normalizeLabel(value) : null;
    if (label) {
      labels.push(label);
      i = end + 1;
      continue;
    }

    if (value) {
      // It read fine but is not a label — an export nested inside a wrapper
      // object, say. Step INSIDE it rather than discarding the groups it holds.
      i += 1;
      continue;
    }

    lost += 1;
    i = end + 1;
  }

  return { labels, lost };
}
