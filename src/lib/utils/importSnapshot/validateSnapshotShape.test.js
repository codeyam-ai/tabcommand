import { describe, it, expect } from 'vitest';
import { normalizeLabel, asLabelList } from './validateSnapshotShape';

const WORK = { title: 'Work', urls: [{ url: 'https://a.com', title: 'A' }] };

describe('normalizeLabel', () => {
  // The ordinary export entry.
  it('accepts a label with a title and a urls array', () => {
    expect(normalizeLabel(WORK)).toEqual(WORK);
  });

  // buildImportUpdates keys the labels map by label.title, so an entry without
  // one cannot be imported — it would land under `undefined` or vanish.
  it('rejects an entry with no title', () => {
    expect(normalizeLabel({ urls: [] })).toBeNull();
  });

  // A whitespace-only title is a missing title wearing a disguise.
  it('rejects an entry whose title is only whitespace', () => {
    expect(normalizeLabel({ title: '   ', urls: [] })).toBeNull();
  });

  // buildImportUpdates iterates label.urls, so a missing array throws mid-write.
  it('rejects an entry with no urls array', () => {
    expect(normalizeLabel({ title: 'Work' })).toBeNull();
  });

  // A group the user created but has not filled yet is still theirs to restore.
  it('accepts a group with no members', () => {
    expect(normalizeLabel({ title: 'Empty', urls: [] })).toEqual({ title: 'Empty', urls: [] });
  });

  // Be permissive WITHIN a recoverable label: drop the unusable member rather
  // than discarding the whole group over one bad row.
  it('drops a member with no url but keeps the group', () => {
    const label = normalizeLabel({ title: 'Work', urls: [{ title: 'no url' }, { url: 'https://a.com' }] });

    expect(label.urls).toEqual([{ url: 'https://a.com' }]);
  });

  // Not an object at all.
  it('rejects a primitive', () => {
    expect(normalizeLabel(42)).toBeNull();
  });
});

describe('asLabelList', () => {
  // The healthy export.
  it('accepts a list of well-formed labels', () => {
    const shaped = asLabelList([WORK]);

    expect(shaped.labels).toHaveLength(1);
    expect(shaped.dropped).toBe(0);
  });

  // THE LINE A PERMISSIVE PARSE MUST NOT CROSS. This parses perfectly well and
  // is not an export; importing it would write a partial or empty labels map
  // over the groups the user still has.
  it('rejects an array that holds no labels at all', () => {
    expect(asLabelList([1, 2, 3])).toBeNull();
  });

  // An export is a LIST of groups. An object is a different document entirely.
  it('rejects a non-array', () => {
    expect(asLabelList({ labels: [WORK] })).toBeNull();
  });

  // An empty array is indistinguishable from garbage that happened to parse,
  // and importing it would clear every group the user currently has.
  it('rejects an empty array rather than importing nothing over everything', () => {
    expect(asLabelList([])).toBeNull();
  });

  // A mixed document still restores what it can, and REPORTS what it dropped so
  // the count can be shown to the user.
  it('keeps the valid labels and counts the dropped ones', () => {
    const shaped = asLabelList([WORK, { title: 'no urls' }, 7]);

    expect(shaped.labels).toHaveLength(1);
    expect(shaped.dropped).toBe(2);
  });
});
