import { describe, it, expect } from 'vitest';
import { deriveUrlLabels, buildUrlInfo, removeUrlFromLabel, getUrlKey, reassignUrlKeyInLabels } from './urlDetails';

describe('deriveUrlLabels', () => {
  const labels = {
    Work: { title: 'Work', urlKeys: ['url-a', 'url-b'] },
    Reading: { title: 'Reading', urlKeys: ['url-c'] },
    Starred: { title: 'Starred', urlKeys: ['url-a'] }
  };

  // returns the titles of every label whose urlKeys contains this urlKey
  it('returns each label containing the urlKey', () => {
    expect(deriveUrlLabels(labels, 'url-a')).toEqual(['Work', 'Starred']);
  });

  // a urlKey present in exactly one label yields a single title
  it('returns a single title when only one label matches', () => {
    expect(deriveUrlLabels(labels, 'url-c')).toEqual(['Reading']);
  });

  // a urlKey in no label yields an empty list (no chips render)
  it('returns an empty array when no label matches', () => {
    expect(deriveUrlLabels(labels, 'url-missing')).toEqual([]);
  });

  // an empty or undefined labels map is tolerated
  it('returns an empty array for empty or undefined labels', () => {
    expect(deriveUrlLabels({}, 'url-a')).toEqual([]);
    expect(deriveUrlLabels(undefined, 'url-a')).toEqual([]);
  });
});

describe('buildUrlInfo', () => {
  // the three core form fields are always written, plus the edited flag
  it('writes title, url and favicon', () => {
    expect(buildUrlInfo({ title: 'T', url: 'u', favicon: 'f' })).toEqual({
      title: 'T',
      url: 'u',
      favicon: 'f',
      edited: true
    });
  });

  // a non-empty notes value is included
  it('includes notes when non-empty', () => {
    expect(buildUrlInfo({ title: 'T', url: 'u', favicon: 'f', notes: 'hi' })).toEqual({
      title: 'T',
      url: 'u',
      favicon: 'f',
      notes: 'hi',
      edited: true
    });
  });

  // every save marks the record as user-curated so the tracker stops overwriting it
  it('stamps edited: true on the persisted object', () => {
    expect(buildUrlInfo({ title: 'T', url: 'u', favicon: 'f' }).edited).toBe(true);
  });

  // empty-string and undefined notes are omitted entirely
  it('omits the notes key when notes is empty or undefined', () => {
    expect('notes' in buildUrlInfo({ title: 'T', url: 'u', favicon: 'f', notes: '' })).toBe(false);
    expect('notes' in buildUrlInfo({ title: 'T', url: 'u', favicon: 'f' })).toBe(false);
  });

  // ref behavior: processes on the input is NOT carried into the saved object
  it('drops processes from the persisted object', () => {
    const result = buildUrlInfo({ title: 'T', url: 'u', favicon: 'f', processes: { samples: 5 } });
    expect('processes' in result).toBe(false);
  });
});

describe('removeUrlFromLabel', () => {
  const labels = {
    Work: { title: 'Work', urlKeys: ['url-a', 'url-b'] },
    Starred: { title: 'Starred', urlKeys: ['url-a'] }
  };

  // splices the urlKey out of the named label's urlKeys
  it('removes the urlKey from the targeted label', () => {
    const result = removeUrlFromLabel(labels, 'Work', 'url-a');
    expect(result.Work.urlKeys).toEqual(['url-b']);
  });

  // other labels are left untouched
  it('leaves other labels unchanged', () => {
    const result = removeUrlFromLabel(labels, 'Work', 'url-a');
    expect(result.Starred.urlKeys).toEqual(['url-a']);
  });

  // does not mutate the input labels map or its arrays
  it('does not mutate the input', () => {
    removeUrlFromLabel(labels, 'Work', 'url-a');
    expect(labels.Work.urlKeys).toEqual(['url-a', 'url-b']);
  });

  // an unknown label title returns the labels unchanged
  it('returns labels unchanged for an unknown label title', () => {
    expect(removeUrlFromLabel(labels, 'Nope', 'url-a')).toBe(labels);
  });
});

describe('getUrlKey', () => {
  // a plain url is keyed as `url-<url>`
  it('prefixes the url with url-', () => {
    expect(getUrlKey('https://github.com/codeyam/tabcommand')).toBe('url-https://github.com/codeyam/tabcommand');
  });

  // the #hash fragment is stripped so two urls differing only by fragment share a key
  it('strips the hash fragment', () => {
    expect(getUrlKey('https://a.com/page#section')).toBe('url-https://a.com/page');
    expect(getUrlKey('https://a.com/page#section')).toBe(getUrlKey('https://a.com/page'));
  });

  // a url with no fragment is unchanged apart from the prefix
  it('leaves a fragmentless url intact', () => {
    expect(getUrlKey('https://a.com/page?q=1')).toBe('url-https://a.com/page?q=1');
  });

  // a non-string input is coerced rather than throwing
  it('coerces a non-string input', () => {
    expect(getUrlKey(123)).toBe('url-123');
  });
});

describe('reassignUrlKeyInLabels', () => {
  const labels = {
    Work: { title: 'Work', urlKeys: ['url-a', 'url-b'] },
    Starred: { title: 'Starred', urlKeys: ['url-a'] },
    Other: { title: 'Other', urlKeys: ['url-c'] }
  };

  // every label containing the old key has it replaced by the new key, position preserved
  it('replaces the old key with the new key in each containing label', () => {
    const result = reassignUrlKeyInLabels(labels, 'url-a', 'url-a2');
    expect(result.Work.urlKeys).toEqual(['url-a2', 'url-b']);
    expect(result.Starred.urlKeys).toEqual(['url-a2']);
  });

  // labels that do not contain the old key are returned untouched
  it('leaves labels without the old key unchanged', () => {
    const result = reassignUrlKeyInLabels(labels, 'url-a', 'url-a2');
    expect(result.Other).toBe(labels.Other);
  });

  // when the new key already exists in a label, the old slot is dropped rather than duplicated
  it('de-duplicates when the new key is already present', () => {
    const dup = { Work: { title: 'Work', urlKeys: ['url-a', 'url-b'] } };
    const result = reassignUrlKeyInLabels(dup, 'url-a', 'url-b');
    expect(result.Work.urlKeys).toEqual(['url-b']);
  });

  // the input labels map and its arrays are not mutated
  it('does not mutate the input', () => {
    reassignUrlKeyInLabels(labels, 'url-a', 'url-a2');
    expect(labels.Work.urlKeys).toEqual(['url-a', 'url-b']);
    expect(labels.Starred.urlKeys).toEqual(['url-a']);
  });

  // an empty or undefined labels map yields an empty map
  it('tolerates an empty or undefined labels map', () => {
    expect(reassignUrlKeyInLabels({}, 'url-a', 'url-a2')).toEqual({});
    expect(reassignUrlKeyInLabels(undefined, 'url-a', 'url-a2')).toEqual({});
  });
});
