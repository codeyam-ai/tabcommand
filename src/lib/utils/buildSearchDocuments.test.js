import { describe, it, expect } from 'vitest';
import { buildSearchDocuments, buildUrlDocuments } from './buildSearchDocuments';

describe('buildSearchDocuments', () => {
  const labels = {
    Work: { title: 'Work', backgroundColor: '#1873E4', urlKeys: ['url-a', 'url-b'] },
    Reading: { title: 'Reading', backgroundColor: '#1F8E43', urlKeys: ['url-c'] },
  };

  // one document per label, carrying the prefixed id, title, and color
  it('builds one label document per label', () => {
    const { labelDocuments } = buildSearchDocuments(labels);
    expect(labelDocuments).toEqual([
      { id: 'label-Work', labelTitle: 'Work', color: '#1873E4' },
      { id: 'label-Reading', labelTitle: 'Reading', color: '#1F8E43' },
    ]);
  });

  // every labeled urlKey maps back to its label title
  it('builds a labelMap of urlKey to label title', () => {
    const { labelMap } = buildSearchDocuments(labels);
    expect(labelMap).toEqual({ 'url-a': 'Work', 'url-b': 'Work', 'url-c': 'Reading' });
  });

  // a label with no urlKeys is tolerated and contributes no map entries
  it('tolerates a label with missing urlKeys', () => {
    const { labelDocuments, labelMap } = buildSearchDocuments({
      Empty: { title: 'Empty', backgroundColor: '#000' },
    });
    expect(labelDocuments).toHaveLength(1);
    expect(labelMap).toEqual({});
  });

  // an empty or missing labels map yields empty outputs, never throws
  it('returns empty outputs for no labels', () => {
    expect(buildSearchDocuments({})).toEqual({ labelDocuments: [], labelMap: {} });
    expect(buildSearchDocuments(undefined)).toEqual({ labelDocuments: [], labelMap: {} });
  });
});

describe('buildUrlDocuments', () => {
  const labelMap = { 'url-a': 'Work', 'url-b': 'Work' };
  const records = {
    'url-a': { title: 'Alpha', url: 'https://a.com', favicon: 'fa', notes: 'note a' },
    'url-b': { url: 'https://b.com' },
  };

  // each labeled url becomes a document tagged with its label title
  it('builds one document per labeled url', () => {
    const docs = buildUrlDocuments(labelMap, records);
    expect(docs).toEqual([
      { id: 'url-a', urlLabelTitle: 'Work', urlTitle: 'Alpha', url: 'https://a.com', favicon: 'fa', notes: 'note a' },
      { id: 'url-b', urlLabelTitle: 'Work', urlTitle: 'https://b.com', url: 'https://b.com', favicon: undefined, notes: undefined },
    ]);
  });

  // a missing title falls back to the url as the searchable/display title
  it('falls back to the url when the title is missing', () => {
    const docs = buildUrlDocuments({ 'url-b': 'Work' }, records);
    expect(docs[0].urlTitle).toBe('https://b.com');
  });

  // a url with no backing record is skipped rather than throwing
  it('skips urls with no backing record', () => {
    const docs = buildUrlDocuments({ 'url-a': 'Work', 'url-missing': 'Work' }, records);
    expect(docs.map((d) => d.id)).toEqual(['url-a']);
  });

  // an empty labelMap yields no documents
  it('returns no documents for an empty labelMap', () => {
    expect(buildUrlDocuments({}, records)).toEqual([]);
    expect(buildUrlDocuments(undefined, undefined)).toEqual([]);
  });
});
