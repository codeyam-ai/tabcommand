// The host shown beside a search result's title — "github.com" under
// "codeyam/tabcommand — GitHub". It orients a row whose title alone is ambiguous
// (three different "Roadmap" pages) without spending the width a full URL costs.
//
// `www.` is stripped because at this size it is pure noise carried by a large
// share of rows. Only a LEADING `www.` goes, so a host that merely contains the
// string keeps its real shape.
//
// Returns '' rather than throwing on anything unparseable. A search index built
// from seeded or hand-edited storage can hold a malformed key, and one bad
// record must cost that row its host line, not take the whole page down.
const hostLabel = (href) => {
  if (!href) return '';
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export default hostLabel;
