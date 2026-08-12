// Pass 2 of the import escalation ladder: undoing the damage a TRANSPORT MEDIUM
// inflicts on a snapshot after it was exported.
//
// The export itself is always valid — `ImportExport.jsx` builds it with
// `JSON.stringify`, which escapes control characters and emits one line. Every
// repair here therefore targets something done to the text in transit, not a
// defect in what the app produced. The confirmed real-world case: a user's
// snapshot carried LITERAL NEWLINES inside string values, each sitting exactly
// where a space belongs in a page title ("Screen⏎Porch Scope Doc - Google⏎Docs"),
// because a medium that hard-wraps long lines had replaced those spaces.
// `JSON.parse` rejected it with "Bad control character in string literal at
// position 356" and the user was told nothing at all.
//
// Each repair returns the repaired text, or null when it found nothing to fix.
// They are applied CUMULATIVELY, cheapest and least destructive first, with a
// parse attempted after each — so the repair set eventually reported to the user
// is the smallest one that actually worked rather than everything that could
// have been applied.

// Human-readable names for each repair. These are shown to the user, so they
// name what was wrong with their file rather than what the parser did about it.
export const Repair = {
  FENCE: 'a markdown code fence',
  WRAPPER: 'text around the snapshot',
  INVISIBLE: 'invisible spacing characters',
  LINE_BREAKS: 'line breaks inside titles',
  SMART_QUOTES: 'curly quotes',
  RELAXED: 'hand-edited JSON syntax (trailing commas, comments, or single quotes)',
  SALVAGE: 'damage that made part of the snapshot unreadable',
};

// A snapshot pasted through a chat client or a markdown document often arrives
// inside a fence.
export function stripCodeFence(text) {
  const fenced = text.match(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/);
  if (!fenced) return null;
  return fenced[1].trim();
}

// Leading or trailing prose ("here's my backup:") around an otherwise intact
// snapshot. Slice from the first structural character to the last.
export function stripWrapper(text) {
  const trimmed = text.trim();

  let start = -1;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '[' || trimmed[i] === '{') { start = i; break; }
  }

  let end = -1;
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    if (trimmed[i] === ']' || trimmed[i] === '}') { end = i; break; }
  }

  if (start === -1 || end === -1 || end <= start) return null;
  if (start === 0 && end === trimmed.length - 1) return null;
  return trimmed.slice(start, end + 1);
}

// Non-breaking and zero-width characters. These are the cruel ones: they are
// INVISIBLE, so a user looking at the rejected text can see nothing wrong with
// it and has no way to guess what to fix.
export function normalizeInvisibleCharacters(text) {
  const repaired = text
    // Non-breaking, figure, and narrow no-break spaces -> an ordinary space.
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    // Zero-width space / non-joiner / joiner and the BOM -> dropped outright.
    // Spelled as an alternation rather than a character class: a class holding
    // the zero-width joiner is exactly the construct that silently splits an
    // emoji sequence, and a page title is entitled to contain one.
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '');
  return repaired === text ? null : repaired;
}

// The confirmed failure: raw newlines and tabs INSIDE string literals, where a
// line-wrapping medium replaced a space. Outside a string they are ordinary
// legal whitespace and are left alone. A CRLF pair collapses to ONE space,
// because it replaced one space.
export function spaceOutControlCharacters(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  let changed = false;
  let lastWasCR = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) { out += ch; escaped = false; lastWasCR = false; continue; }
    if (ch === '\\') { out += ch; if (inString) escaped = true; lastWasCR = false; continue; }
    if (ch === '"') { inString = !inString; out += ch; lastWasCR = false; continue; }

    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      changed = true;
      if (!(ch === '\n' && lastWasCR)) out += ' ';
      lastWasCR = ch === '\r';
      continue;
    }

    out += ch;
    lastWasCR = false;
  }

  return changed ? out : null;
}

// Quotes a word processor autocorrected. Applied LAST among the transport
// repairs and only once a strict parse has already failed: curly quotes are
// perfectly legal INSIDE a JSON string, so a snapshot whose only curly quotes
// sit in a page title parses on the first pass and never reaches here.
export function straightenSmartQuotes(text) {
  const repaired = text
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");
  return repaired === text ? null : repaired;
}

const TRANSPORT_REPAIRS = [
  { label: Repair.FENCE, apply: stripCodeFence },
  { label: Repair.WRAPPER, apply: stripWrapper },
  { label: Repair.INVISIBLE, apply: normalizeInvisibleCharacters },
  { label: Repair.LINE_BREAKS, apply: spaceOutControlCharacters },
  { label: Repair.SMART_QUOTES, apply: straightenSmartQuotes },
];

// The cumulative ladder: the original text, then each successive repair applied
// on top of the last. Index 0 is ALWAYS the untouched paste, which is what lets
// the caller try a strict parse and report the original error position.
export function buildRepairCandidates(text) {
  const candidates = [{ text, repairs: [] }];
  let current = text;
  let repairs = [];

  for (const repair of TRANSPORT_REPAIRS) {
    const repaired = repair.apply(current);
    if (repaired === null || repaired === current) continue;
    current = repaired;
    repairs = [...repairs, repair.label];
    candidates.push({ text: current, repairs });
  }

  return candidates;
}
