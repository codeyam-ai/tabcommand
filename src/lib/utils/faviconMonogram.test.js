import { describe, it, expect } from 'vitest';
import { faviconMonogram } from './faviconMonogram';

describe('faviconMonogram', () => {
  // prefers the title and returns its first letter uppercased
  it('uses the first letter of the title, uppercased', () => {
    expect(faviconMonogram('https://react.dev/learn', 'quick start').text).toBe('Q');
  });

  // falls back to the url when there is no title
  it('derives the letter from the url when the title is empty', () => {
    expect(faviconMonogram('https://github.com', '').text).toBe('G');
  });

  // strips the scheme and a leading www. before taking the first letter
  it('strips the scheme and www. prefix from the url', () => {
    expect(faviconMonogram('https://www.example.com', '').text).toBe('E');
  });

  // empty url and title yield the question-mark placeholder
  it('returns a question mark when there is nothing to use', () => {
    expect(faviconMonogram('', '').text).toBe('?');
  });

  // called with no arguments at all, still returns the placeholder safely
  it('handles missing arguments without throwing', () => {
    expect(faviconMonogram().text).toBe('?');
  });

  // the color is deterministic: the same url always maps to the same palette color
  it('returns a stable color for the same url', () => {
    const a = faviconMonogram('https://news.ycombinator.com', 'Hacker News');
    const b = faviconMonogram('https://news.ycombinator.com', 'Different Title');
    expect(a.color).toBe(b.color);
  });

  // the color comes from the fixed palette
  it('returns a color from the palette', () => {
    const palette = ['#5B8DEF', '#1F8E43', '#E47415', '#D01882', '#9334E2', '#007B82', '#DA2F25', '#5F6367'];
    expect(palette).toContain(faviconMonogram('https://figma.com', 'Figma').color);
  });

  // different urls can produce different colors
  it('spreads different urls across the palette', () => {
    const colors = new Set(
      ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com', 'https://e.com']
        .map((u) => faviconMonogram(u, '').color)
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
