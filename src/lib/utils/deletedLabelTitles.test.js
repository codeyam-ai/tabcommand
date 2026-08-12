import { describe, it, expect } from 'vitest';
import deletedLabelTitles from './deletedLabelTitles.js';

describe('deletedLabelTitles', () => {
  // The ordinary case: one group removed from a map of several.
  it('returns the title removed between the two maps', () => {
    const previous = {
      Work: { title: 'Work', urlKeys: [] },
      Reading: { title: 'Reading', urlKeys: [] },
    };
    const next = { Reading: { title: 'Reading', urlKeys: [] } };

    expect(deletedLabelTitles(previous, next)).toEqual(['Work']);
  });

  // A pass that changed a label's CONTENTS is not a deletion. This is the guard
  // that keeps a rename/recolor/add from dissolving the Chrome tab group of a
  // label that is still very much present.
  it('reports nothing when a label is only mutated', () => {
    const previous = { Work: { title: 'Work', urlKeys: ['url-a'] } };
    const next = { Work: { title: 'Work', urlKeys: ['url-a', 'url-b'] } };

    expect(deletedLabelTitles(previous, next)).toEqual([]);
  });

  // Deleting the LAST group removes the `labels` key outright rather than
  // writing an empty map, so `newValue` arrives undefined. Coercing to `{}` is
  // what makes this report the deletion instead of silently reporting nothing —
  // the one case where the user has no groups left to notice the bug on.
  it('treats an absent next map as every label having been deleted', () => {
    const previous = { Work: { title: 'Work', urlKeys: [] } };

    expect(deletedLabelTitles(previous, undefined)).toEqual(['Work']);
  });

  // An absent PREVIOUS map is a first write, not a deletion.
  it('reports nothing when there was no previous map', () => {
    expect(deletedLabelTitles(undefined, { Work: { title: 'Work' } })).toEqual([]);
  });

  // Several groups can disappear in one write — an import/restore replacing the
  // whole map. Every one of them needs its Chrome group dissolved, so none may
  // be dropped.
  it('returns every title removed by a single write', () => {
    const previous = { Work: {}, Reading: {}, Social: {} };
    const next = { Reading: {} };

    expect(deletedLabelTitles(previous, next).sort()).toEqual(['Social', 'Work']);
  });

  // Presence is keyed on the KEY, not on truthiness of the value: a label whose
  // value is falsy is still a label that exists, and dissolving its tab group
  // would be a data-losing false positive.
  it('does not report a title whose value is falsy but present', () => {
    expect(deletedLabelTitles({ Work: {} }, { Work: undefined })).toEqual([]);
  });
});
