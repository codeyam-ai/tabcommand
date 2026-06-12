// Computes the truncated, highlighted notes snippet shown under a URL search
// result when the match landed in its notes. Factored out of SearchResults so
// the windowing/highlight math is testable independent of JSX.
//
// Faithful to the reference: find the (case-insensitive) term, capture the
// original-cased matched substring, then trim the notes to a window of ~18 chars
// before and ~24 after the term, and split the window on the match into the
// `before` / `match` / `after` parts the overlay renders as
// `{before}<span>{match}</span>{after}`. Returns null when there's nothing to
// highlight (no notes, no term, or the term isn't present).
const searchNotesSnippet = (notes, term) => {
  if (!notes || !term) return null;

  const lowerTerm = term.toLowerCase();
  const termIndex = notes.toLowerCase().indexOf(lowerTerm);
  if (termIndex === -1) return null;

  const match = notes.substring(termIndex, termIndex + lowerTerm.length);

  const start = notes.substring(0, Math.max(0, termIndex - 18));
  const end = notes.substring(Math.min(termIndex + 24, notes.length - 1), notes.length - 1);
  const window = notes.replace(start, '').replace(end, '');

  const [before, after] = window.split(match);
  return { before, match, after };
};

export default searchNotesSnippet;
