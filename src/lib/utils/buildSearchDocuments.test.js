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
    'url-c': { title: 'Gamma', url: 'https://c.com', favicon: 'fc', notes: 'note c' },
  };

  // a labeled key becomes a document tagged with its label title
  it('tags a labeled url with its label title', () => {
    const docs = buildUrlDocuments(['url-a'], labelMap, records);
    expect(docs).toEqual([
      { id: 'url-a', urlLabelTitle: 'Work', urlTitle: 'Alpha', url: 'https://a.com', favicon: 'fa', notes: 'note a' },
    ]);
  });

  // an archived key (present in urlKeys but not the labelMap) gets no urlLabelTitle,
  // which is the signal used downstream to bucket it as archived
  it('leaves urlLabelTitle undefined for an archived url', () => {
    const docs = buildUrlDocuments(['url-c'], labelMap, records);
    expect(docs).toEqual([
      { id: 'url-c', urlLabelTitle: undefined, urlTitle: 'Gamma', url: 'https://c.com', favicon: 'fc', notes: 'note c' },
    ]);
  });

  // spans the whole archive: labeled and archived keys build in one pass
  it('builds documents across both labeled and archived urls', () => {
    const docs = buildUrlDocuments(['url-a', 'url-b', 'url-c'], labelMap, records);
    expect(docs.map((d) => [d.id, d.urlLabelTitle])).toEqual([
      ['url-a', 'Work'],
      ['url-b', 'Work'],
      ['url-c', undefined],
    ]);
  });

  // a missing title falls back to the url as the searchable/display title
  it('falls back to the url when the title is missing', () => {
    const docs = buildUrlDocuments(['url-b'], labelMap, records);
    expect(docs[0].urlTitle).toBe('https://b.com');
  });

  // a key with no backing record is skipped rather than throwing
  it('skips url keys with no backing record', () => {
    const docs = buildUrlDocuments(['url-a', 'url-missing'], labelMap, records);
    expect(docs.map((d) => d.id)).toEqual(['url-a']);
  });

  // a duplicate key is emitted once, guarding minisearch's id map from a double-add
  it('dedupes duplicate url keys', () => {
    const docs = buildUrlDocuments(['url-a', 'url-a'], labelMap, records);
    expect(docs.map((d) => d.id)).toEqual(['url-a']);
  });

  // an empty or missing key list yields no documents, and never throws
  it('returns no documents for an empty key list', () => {
    expect(buildUrlDocuments([], labelMap, records)).toEqual([]);
    expect(buildUrlDocuments(undefined, undefined, undefined)).toEqual([]);
  });
});
