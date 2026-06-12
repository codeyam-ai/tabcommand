import { describe, it, expect } from 'vitest';
import { deriveUrlLabels, buildUrlInfo, removeUrlFromLabel } from './urlDetails';

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
  // the three core form fields are always written
  it('writes title, url and favicon', () => {
    expect(buildUrlInfo({ title: 'T', url: 'u', favicon: 'f' })).toEqual({
      title: 'T',
      url: 'u',
      favicon: 'f'
    });
  });

  // a non-empty notes value is included
  it('includes notes when non-empty', () => {
    expect(buildUrlInfo({ title: 'T', url: 'u', favicon: 'f', notes: 'hi' })).toEqual({
      title: 'T',
      url: 'u',
      favicon: 'f',
      notes: 'hi'
    });
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
