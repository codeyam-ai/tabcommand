import { describe, it, expect } from 'vitest';
import findLabelForUrlKey from './findLabelForUrlKey.js';

describe('findLabelForUrlKey', () => {
  // The ordinary case: a urlKey filed under exactly one label resolves to it.
  it('returns the title of the label claiming the urlKey', () => {
    const labels = {
      Work: { title: 'Work', urlKeys: ['url-https://a.com', 'url-https://b.com'] },
      Reading: { title: 'Reading', urlKeys: ['url-https://c.com'] },
    };
    expect(findLabelForUrlKey(labels, 'url-https://c.com')).toBe('Reading');
  });

  // The anti-flip-flop guarantee. A urlKey filed under TWO labels must resolve to
  // exactly ONE destination — the old code queued the tab into both, so it was
  // grouped twice per pass (into A, then into B) and which one won depended on
  // async tabGroups.query ordering. Returning a single title is what makes the
  // destination single.
  it('returns exactly one label when two labels claim the same urlKey', () => {
    const labels = {
      Work: { title: 'Work', urlKeys: ['url-https://shared.com'] },
      Reading: { title: 'Reading', urlKeys: ['url-https://shared.com'] },
    };
    expect(findLabelForUrlKey(labels, 'url-https://shared.com')).toBe('Work');
  });

  // Single is not enough on its own — it must also be STABLE. A destination that
  // is single per pass but differs between passes is exactly the back-and-forth
  // this fixes, so repeated calls must agree.
  it('resolves a doubly-claimed urlKey to the same label on every call', () => {
    const labels = {
      Work: { title: 'Work', urlKeys: ['url-https://shared.com'] },
      Reading: { title: 'Reading', urlKeys: ['url-https://shared.com'] },
    };
    const first = findLabelForUrlKey(labels, 'url-https://shared.com');
    for (let i = 0; i < 5; ++i) {
      expect(findLabelForUrlKey(labels, 'url-https://shared.com')).toBe(first);
    }
  });

  // No label claims the URL — the caller uses this to decide the tab should be
  // ungrouped, so it must be a clear null rather than undefined.
  it('returns null when no label claims the urlKey', () => {
    const labels = { Work: { title: 'Work', urlKeys: ['url-https://a.com'] } };
    expect(findLabelForUrlKey(labels, 'url-https://zzz.com')).toBeNull();
  });

  // A label with no members claims nothing.
  it('returns null for a label with an empty urlKeys list', () => {
    expect(findLabelForUrlKey({ Work: { title: 'Work', urlKeys: [] } }, 'url-https://a.com')).toBeNull();
  });

  // Callers pass labels straight from chrome.storage.local, which may hold
  // nothing yet — returning null beats throwing on a cold start.
  it('returns null for missing or empty labels', () => {
    expect(findLabelForUrlKey(undefined, 'url-https://a.com')).toBeNull();
    expect(findLabelForUrlKey(null, 'url-https://a.com')).toBeNull();
    expect(findLabelForUrlKey({}, 'url-https://a.com')).toBeNull();
  });

  // A tab whose URL has not loaded yet has no usable key; it must not match a
  // label by accident.
  it('returns null for a missing urlKey', () => {
    const labels = { Work: { title: 'Work', urlKeys: ['url-https://a.com'] } };
    expect(findLabelForUrlKey(labels, undefined)).toBeNull();
    expect(findLabelForUrlKey(labels, '')).toBeNull();
  });

  // A malformed label entry (no urlKeys array) must be skipped rather than
  // throwing, so one bad record cannot break grouping for every other label.
  it('skips malformed label entries and keeps searching', () => {
    const labels = {
      Broken: { title: 'Broken' },
      AlsoBroken: null,
      Work: { title: 'Work', urlKeys: ['url-https://a.com'] },
    };
    expect(findLabelForUrlKey(labels, 'url-https://a.com')).toBe('Work');
  });
});
