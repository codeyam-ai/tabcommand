// Deterministic favicon fallback: when a site has no (or a broken) favicon we
// show a colored monogram tile. `faviconMonogram` derives that tile's letter and
// color from the site so the same site always gets the same monogram.
//   - text:  the first visible character (scheme/`www.` stripped), uppercased,
//            preferring the title over the bare url; '?' when nothing is usable.
//   - color: chosen from a fixed palette by hashing the url, so the color is
//            stable per-url and spread across the palette.
// `url` is the site url WITHOUT the `url-` storage prefix; `title` is optional.
const PALETTE = ['#5B8DEF', '#1F8E43', '#E47415', '#D01882', '#9334E2', '#007B82', '#DA2F25', '#5F6367'];

export const faviconMonogram = (url = '', title = '') => {
  const text =
    (title || url || '')
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .trim()
      .charAt(0)
      .toUpperCase() || '?';

  let hash = 0;
  for (const ch of url || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[hash % PALETTE.length];

  return { text, color };
};

export default faviconMonogram;
