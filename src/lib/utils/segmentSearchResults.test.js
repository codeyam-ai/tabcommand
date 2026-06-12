import { describe, it, expect } from 'vitest';
import segmentSearchResults from './segmentSearchResults';

describe('segmentSearchResults', () => {
  // hits carrying labelTitle are labels; the rest are urls
  it('splits hits into labels and urls', () => {
    const result = segmentSearchResults([
      { id: 'label-Work', labelTitle: 'Work' },
      { id: 'url-https://a.com', urlTitle: 'A' },
      { id: 'url-https://b.com', urlTitle: 'B' },
    ]);
    expect(result.labels.map((r) => r.id)).toEqual(['label-Work']);
    expect(result.urls.map((r) => r.id)).toEqual(['url-https://a.com', 'url-https://b.com']);
  });

  // a duplicate id is collapsed to a single result, keeping the first hit
  it('dedupes by id, keeping the first occurrence', () => {
    const result = segmentSearchResults([
      { id: 'url-https://react.dev', urlTitle: 'React', score: 9 },
      { id: 'url-https://react.dev', urlTitle: 'React', score: 4 },
    ]);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].score).toBe(9);
  });

  // dedupe spans both segments, not just within one
  it('dedupes a label and a url independently', () => {
    const result = segmentSearchResults([
      { id: 'label-Reading', labelTitle: 'Reading' },
      { id: 'label-Reading', labelTitle: 'Reading' },
      { id: 'url-https://x.com', urlTitle: 'X' },
    ]);
    expect(result.labels).toHaveLength(1);
    expect(result.urls).toHaveLength(1);
  });

  // no hits yields empty arrays, never undefined
  it('returns empty arrays for no results', () => {
    expect(segmentSearchResults([])).toEqual({ labels: [], urls: [] });
  });

  // a null/undefined input is tolerated
  it('tolerates a missing results list', () => {
    expect(segmentSearchResults(undefined)).toEqual({ labels: [], urls: [] });
    expect(segmentSearchResults(null)).toEqual({ labels: [], urls: [] });
  });

  // an empty-string labelTitle is treated as a url, matching the truthy filter
  it('treats a falsy labelTitle as a url', () => {
    const result = segmentSearchResults([{ id: 'url-1', labelTitle: '', urlTitle: 'One' }]);
    expect(result.labels).toHaveLength(0);
    expect(result.urls).toHaveLength(1);
  });
});
