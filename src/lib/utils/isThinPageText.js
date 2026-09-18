// Below this many characters, a fetched page is treated as an empty shell
// rather than as a page that genuinely has little text.
export const THIN_TEXT = 200;

// Whether a fetched page's text is too thin to have been worth searching — the
// signal that selects the deep tier.
//
// A page fetched without running its scripts can come back in two very different
// shapes that both look like "no match". Either the server really did send the
// article, and the query genuinely is not in it; or the site is client-rendered
// and what came back is a bootstrap shell whose entire readable content is
// "You need to enable JavaScript to run this app." Reporting the second as "no
// match" would be a lie about a page nobody read.
//
// A length threshold cannot tell those apart perfectly, and it does not have to:
// being wrong costs one background tab load on a page that turns out to be
// genuinely short, which is exactly the trade the deep-scan checkbox is opting
// into. Kept as its own predicate so the threshold is testable at its boundary
// rather than buried in the scan's control flow.
const isThinPageText = (text) => (text || '').length < THIN_TEXT;

export default isThinPageText;
