// How much context to keep either side of the hit. Asymmetric on purpose: what
// FOLLOWS a phrase usually identifies it ("the quota is 5MB per origin"), while
// what precedes it is more often sentence scaffolding.
const BEFORE = 80;
const AFTER = 120;

// Trim a leading fragment back to a word boundary and mark the cut. Slicing a
// fixed number of characters lands mid-word roughly four times in five, and
// "t to a per-origin quota" reads as a rendering bug rather than as an excerpt.
const trimStart = (text, cut) => {
  if (!cut) return text;
  const space = text.indexOf(' ');
  return `…${space === -1 ? text : text.slice(space + 1)}`;
};

const trimEnd = (text, cut) => {
  if (!cut) return text;
  const space = text.lastIndexOf(' ');
  return `${space === -1 ? text : text.slice(0, space)}…`;
};

// Finds a query inside a page's extracted text and returns the highlighted
// excerpt the Page contents row renders, as `{ before, match, after }`.
//
// This is the whole matching rule for website content search, kept as a pure
// function of (text, query) so it can be reasoned about without a browser, a
// permission, or a network fetch anywhere near it.
//
// Matching is case-insensitive and substring-based rather than tokenised, which
// is deliberate and is the opposite of how the rest of the page searches. The
// index behind every other section matches WORDS in titles and notes the user
// wrote; this one searches prose the user only read. Someone reaching for it is
// reaching for a phrase they half-remember ("quota exceeded"), and a tokenised
// match would lose the adjacency that makes the phrase worth searching for.
//
// The windowing is done here rather than through `searchNotesSnippet`, which is
// the app's other excerpt helper. That one windows to ~18 characters before the
// term and ~24 after, which is right for the single-line fragment of a note the
// user wrote themselves and has already seen. Page prose is neither: the excerpt
// is the only evidence the user gets that this page is the one they remember, so
// it needs a sentence rather than a fragment — and it has to stop on a word.
//
// Returns null when there is no text, no query, or no hit — so a caller can use
// the return value alone to decide whether the page is a result at all.
const matchPageText = (text, query) => {
  if (!text || !query) return null;

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return null;

  const end = index + query.length;
  const from = Math.max(0, index - BEFORE);
  const to = Math.min(text.length, end + AFTER);

  return {
    // Sliced from the ORIGINAL text, so the excerpt keeps the page's own casing
    // even though the search that found it ignored case.
    before: trimStart(text.slice(from, index), from > 0),
    match: text.slice(index, end),
    after: trimEnd(text.slice(end, to), to < text.length),
    index,
  };
};

export default matchPageText;
