import { describe, it, expect } from 'vitest';
import htmlToText from './htmlToText';

describe('htmlToText', () => {
  // the ordinary case: an article's readable text, markup removed
  it('extracts the readable text from a document', () => {
    const html = '<html><body><h1>Title</h1><p>Body copy here.</p></body></html>';
    expect(htmlToText(html)).toBe('Title Body copy here.');
  });

  // a page's inline JSON blob or stylesheet would otherwise match a query the
  // user never read on screen
  it('drops script, style, noscript and template content', () => {
    const html = `<body>
      <script>var quota = "secret";</script>
      <style>.quota { color: red }</style>
      <noscript>Enable JavaScript</noscript>
      <template><p>quota</p></template>
      <p>Visible.</p>
    </body>`;
    expect(htmlToText(html)).toBe('Visible.');
  });

  // source newlines and indentation would land inside the snippet window and
  // push the actual match out of the visible excerpt
  it('collapses whitespace to single spaces and trims', () => {
    expect(htmlToText('<body>  <p>a\n\n\tb</p>   </body>')).toBe('a b');
  });

  // `textContent` joins its nodes with nothing at all, so without a separator
  // two blocks would read back as one word — which both garbles the excerpt and
  // can manufacture a match spanning text no reader saw as adjacent
  it('keeps neighbouring block elements as separate words', () => {
    expect(htmlToText('<body><p>the quota</p><p>Exceeded</p></body>'))
      .toBe('the quota Exceeded');
    expect(htmlToText('<body><li>one</li><li>two</li></body>')).toBe('one two');
    expect(htmlToText('<body>a<br>b</body>')).toBe('a b');
  });

  // a fetch that returned nothing, or a body-less document, is not a crash
  it('returns an empty string for empty or missing input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
  });

  // the case that selects the deep tier: a client-rendered app sends a shell
  it('yields near-nothing for a client-rendered bootstrap shell', () => {
    const shell = '<body><div id="root"></div><script src="/bundle.js"></script></body>';
    expect(htmlToText(shell)).toBe('');
  });

  // malformed markup is normal on the open web; the parser must not throw
  it('tolerates malformed markup', () => {
    expect(htmlToText('<body><p>unclosed <b>bold</body>')).toContain('unclosed');
  });
});
