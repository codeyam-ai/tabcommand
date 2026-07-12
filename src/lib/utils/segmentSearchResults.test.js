import { describe, it, expect } from 'vitest';
import segmentSearchResults from './segmentSearchResults';

describe('segmentSearchResults', () => {
  // labelTitle => label; urlLabelTitle => grouped url; neither => archived
  it('splits hits into labels, grouped urls, and archived urls', () => {
    const result = segmentSearchResults([
      { id: 'label-Work', labelTitle: 'Work' },
      { id: 'url-https://a.com', urlTitle: 'A', urlLabelTitle: 'Work' },
      { id: 'url-https://b.com', urlTitle: 'B' },
    ]);
    expect(result.labels.map((r) => r.id)).toEqual(['label-Work']);
    expect(result.urls.map((r) => r.id)).toEqual(['url-https://a.com']);
    expect(result.archived.map((r) => r.id)).toEqual(['url-https://b.com']);
  });

  // an unlabeled hit routes to archived, not grouped urls, even when it matched on notes
  it('routes an unlabeled hit to archived', () => {
    const result = segmentSearchResults([
      { id: 'url-https://news.ycombinator.com', urlTitle: 'Hacker News', notes: 'archived tabs' },
    ]);
    expect(result.urls).toHaveLength(0);
    expect(result.archived.map((r) => r.id)).toEqual(['url-https://news.ycombinator.com']);
  });

  // a duplicate id is collapsed to a single result, keeping the first (highest-score) hit
  it('dedupes by id, keeping the first occurrence', () => {
    const result = segmentSearchResults([
      { id: 'url-https://react.dev', urlTitle: 'React', urlLabelTitle: 'Reading', score: 9 },
      { id: 'url-https://react.dev', urlTitle: 'React', urlLabelTitle: 'Reading', score: 4 },
    ]);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].score).toBe(9);
  });

  // dedupe spans every segment, not just within one
  it('dedupes a label and a url independently', () => {
    const result = segmentSearchResults([
      { id: 'label-Reading', labelTitle: 'Reading' },
      { id: 'label-Reading', labelTitle: 'Reading' },
      { id: 'url-https://x.com', urlTitle: 'X', urlLabelTitle: 'Reading' },
    ]);
    expect(result.labels).toHaveLength(1);
    expect(result.urls).toHaveLength(1);
  });

  // no hits yields three empty arrays, never undefined
  it('returns empty arrays for no results', () => {
    expect(segmentSearchResults([])).toEqual({ labels: [], urls: [], archived: [] });
  });

  // a null/undefined input is tolerated
  it('tolerates a missing results list', () => {
    expect(segmentSearchResults(undefined)).toEqual({ labels: [], urls: [], archived: [] });
    expect(segmentSearchResults(null)).toEqual({ labels: [], urls: [], archived: [] });
  });

  // an empty-string labelTitle is not a label; with no urlLabelTitle it's archived
  it('treats a falsy labelTitle as a non-label, archived url', () => {
    const result = segmentSearchResults([{ id: 'url-1', labelTitle: '', urlTitle: 'One' }]);
    expect(result.labels).toHaveLength(0);
    expect(result.urls).toHaveLength(0);
    expect(result.archived).toHaveLength(1);
  });
});
