import { describe, it, expect } from 'vitest';
import {
  sortLabels,
  collectUrlKeys,
  resolveLabelUrls,
  buildImportUpdates,
} from './importExport';

describe('sortLabels', () => {
  // orders labels by ascending position
  it('orders labels by ascending position', () => {
    const labels = {
      B: { title: 'B', position: 2, urlKeys: [] },
      A: { title: 'A', position: 0, urlKeys: [] },
      C: { title: 'C', position: 1, urlKeys: [] },
    };
    expect(sortLabels(labels).map((l) => l.title)).toEqual(['A', 'C', 'B']);
  });

  // breaks position ties alphabetically by title
  it('breaks position ties alphabetically by title', () => {
    const labels = {
      Zebra: { title: 'Zebra', position: 0, urlKeys: [] },
      Apple: { title: 'Apple', position: 0, urlKeys: [] },
    };
    expect(sortLabels(labels).map((l) => l.title)).toEqual(['Apple', 'Zebra']);
  });

  // treats a missing position as 0
  it('treats a missing position as 0', () => {
    const labels = {
      Later: { title: 'Later', position: 5, urlKeys: [] },
      NoPos: { title: 'NoPos', urlKeys: [] },
    };
    expect(sortLabels(labels).map((l) => l.title)).toEqual(['NoPos', 'Later']);
  });

  // returns an empty array for an empty labels map
  it('returns an empty array for an empty labels map', () => {
    expect(sortLabels({})).toEqual([]);
  });
});

describe('collectUrlKeys', () => {
  // gathers every urlKey across the labels
  it('gathers every urlKey across the labels', () => {
    const sorted = [
      { title: 'A', urlKeys: ['url-1', 'url-2'] },
      { title: 'B', urlKeys: ['url-3'] },
    ];
    expect(collectUrlKeys(sorted)).toEqual(['url-1', 'url-2', 'url-3']);
  });

  // de-duplicates a urlKey shared across labels
  it('de-duplicates a urlKey shared across labels', () => {
    const sorted = [
      { title: 'A', urlKeys: ['url-1', 'url-2'] },
      { title: 'B', urlKeys: ['url-2', 'url-1'] },
    ];
    expect(collectUrlKeys(sorted)).toEqual(['url-1', 'url-2']);
  });

  // returns an empty array when no labels have urlKeys
  it('returns an empty array when no labels have urlKeys', () => {
    expect(collectUrlKeys([{ title: 'A', urlKeys: [] }])).toEqual([]);
  });
});

describe('resolveLabelUrls', () => {
  // attaches resolved url/title/favicon and removes urlKeys
  it('attaches resolved url and title and favicon and removes urlKeys', () => {
    const sorted = [{ title: 'Work', position: 0, urlKeys: ['url-a'] }];
    const urlInfo = {
      'url-a': { url: 'https://a.com', title: 'A site', favicon: 'fav-a' },
    };
    const resolved = resolveLabelUrls(sorted, urlInfo);
    expect(resolved[0].urls).toEqual([
      { url: 'https://a.com', title: 'A site', favicon: 'fav-a' },
    ]);
    expect(resolved[0].urlKeys).toBeUndefined();
  });

  // includes notes only when the resolved url info carries them
  it('includes notes only when the resolved url info carries them', () => {
    const sorted = [{ title: 'Work', urlKeys: ['url-a', 'url-b'] }];
    const urlInfo = {
      'url-a': { url: 'https://a.com', title: 'A', favicon: '', notes: 'keep me' },
      'url-b': { url: 'https://b.com', title: 'B', favicon: '' },
    };
    const resolved = resolveLabelUrls(sorted, urlInfo);
    expect(resolved[0].urls[0]).toEqual({
      url: 'https://a.com',
      title: 'A',
      favicon: '',
      notes: 'keep me',
    });
    expect(resolved[0].urls[1]).not.toHaveProperty('notes');
  });

  // resolves urls across multiple labels in order
  it('resolves urls across multiple labels in order', () => {
    const sorted = [
      { title: 'One', urlKeys: ['url-a'] },
      { title: 'Two', urlKeys: ['url-b'] },
    ];
    const urlInfo = {
      'url-a': { url: 'https://a.com', title: 'A', favicon: '' },
      'url-b': { url: 'https://b.com', title: 'B', favicon: '' },
    };
    const resolved = resolveLabelUrls(sorted, urlInfo);
    expect(resolved.map((l) => l.urls[0].url)).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});

describe('buildImportUpdates', () => {
  // builds a per-url object plus the rebuilt labels map
  it('builds a per-url object plus the rebuilt labels map', () => {
    const json = JSON.stringify([
      {
        title: 'Work',
        backgroundColor: '#1873E4',
        position: 0,
        urls: [{ url: 'https://a.com', title: 'A', favicon: 'fav-a' }],
      },
    ]);
    const updates = buildImportUpdates(json);
    expect(updates['url-https://a.com']).toEqual({
      url: 'https://a.com',
      title: 'A',
      favicon: 'fav-a',
    });
    expect(updates.labels.Work.urlKeys).toEqual(['url-https://a.com']);
    expect(updates.labels.Work.urls).toBeUndefined();
  });

  // preserves notes on a per-url object when present
  it('preserves notes on a per-url object when present', () => {
    const json = JSON.stringify([
      {
        title: 'Work',
        urls: [{ url: 'https://a.com', title: 'A', favicon: '', notes: 'hi' }],
      },
    ]);
    const updates = buildImportUpdates(json);
    expect(updates['url-https://a.com'].notes).toBe('hi');
  });

  // keys multiple labels by their title
  it('keys multiple labels by their title', () => {
    const json = JSON.stringify([
      { title: 'Work', urls: [{ url: 'https://a.com', title: 'A', favicon: '' }] },
      { title: 'Play', urls: [{ url: 'https://b.com', title: 'B', favicon: '' }] },
    ]);
    const updates = buildImportUpdates(json);
    expect(Object.keys(updates.labels).sort()).toEqual(['Play', 'Work']);
  });

  // throws on malformed JSON so the page can swallow it
  it('throws on malformed JSON so the page can swallow it', () => {
    expect(() => buildImportUpdates('{not valid json')).toThrow();
  });
});
