// Extracts the readable text from a page's HTML source.
//
// This is the second of the two ways the content scan gets a page's text. The
// first — running `document.body.innerText` in a live tab — sees what the user
// sees, because the page's own JavaScript has already run. This one parses HTML
// that was never executed, so it sees only what the server sent. That gap is
// real and is why the row that renders these results carries a tier badge: a
// client-rendered app fetched this way yields an almost-empty shell, and the
// honest thing is to say which path produced the miss rather than to report
// "no match" as though the page had been read.
//
// `DOMParser` is used rather than assigning to a detached element's innerHTML
// because it does not execute scripts or fetch subresources: parsing a page
// fetched from an arbitrary site must not be able to run that site's code.
const STRIPPED = 'script, style, noscript, template, svg';

// Elements that end a line on screen. `textContent` concatenates its nodes with
// no separator at all, so `<p>the quota</p><p>Exceeded</p>` reads back as
// "the quotaExceeded" — which both garbles the excerpt and can MANUFACTURE a
// match that is not on the page, because a query spanning the join would be
// found in text no reader ever saw as adjacent.
const BLOCKS = [
  'p', 'div', 'br', 'hr', 'li', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'header', 'footer', 'nav', 'aside',
  'blockquote', 'pre', 'figcaption', 'dt', 'dd',
].join(', ');

const htmlToText = (html) => {
  if (!html) return '';

  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return '';
  }
  if (!doc || !doc.body) return '';

  // Script and style bodies are text nodes too, and a page's inline JSON blob
  // will happily match a query the user never read on screen.
  doc.body.querySelectorAll(STRIPPED).forEach((node) => node.remove());

  // Re-introduce the line break each block element represents, so neighbouring
  // blocks stay separate words. Done after the strip so a removed <script> does
  // not leave a stray separator behind.
  doc.body.querySelectorAll(BLOCKS).forEach((node) => {
    if (node.parentNode) node.parentNode.insertBefore(doc.createTextNode(' '), node.nextSibling);
  });

  // Collapse to single spaces: the source's newlines and indentation would
  // otherwise land inside the snippet window and push the actual match out of
  // the visible excerpt.
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

export default htmlToText;
