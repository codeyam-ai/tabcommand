import { describe, it, expect } from 'vitest';
import buildFullSearchSections from './buildFullSearchSections';

const url = (id) => ({ id, urlTitle: id });

const results = (over = {}) => ({
  labels: [],
  grouped: [],
  history: [],
  notes: [],
  openTabs: [],
  ...over,
});

const full = () => results({
  labels: [{ id: 'label-Work', labelTitle: 'Work' }],
  grouped: [{ title: 'Work', color: '#1873E4', urls: [url('url-a'), url('url-b')] }],
  history: [url('url-c')],
  notes: [url('url-c')],
  openTabs: [url('url-a')],
});

describe('buildFullSearchSections', () => {
  // the order is the page's information hierarchy: what it IS, then where it
  // lives, then why it matched, then what is on screen
  it('returns sections in a fixed order', () => {
    const { sections } = buildFullSearchSections(full(), [url('c1')], 'all');
    expect(sections.map((s) => s.key)).toEqual([
      'labels', 'grouped', 'history', 'notes', 'openTabs', 'chromeHistory',
    ]);
  });

  // an empty section is not a heading with nothing under it
  it('omits sections with no rows', () => {
    const { sections } = buildFullSearchSections(
      results({ history: [url('url-c')] }), [], 'all'
    );
    expect(sections.map((s) => s.key)).toEqual(['history']);
  });

  // picking a chip narrows the page to that one source
  it('keeps only the selected section when a filter is active', () => {
    const { sections } = buildFullSearchSections(full(), [], 'notes');
    expect(sections.map((s) => s.key)).toEqual(['notes']);
  });

  // All is the default and shows the complete split, which is the page's point
  it('shows every section under the all filter', () => {
    const { sections } = buildFullSearchSections(full(), [], 'all');
    expect(sections).toHaveLength(5);
  });

  // a filter naming a section that has no hits yields nothing, not a stray header
  it('returns no sections when the filtered section is empty', () => {
    const { sections, flatRows } = buildFullSearchSections(full(), [], 'chromeHistory');
    expect(sections).toEqual([]);
    expect(flatRows).toEqual([]);
  });

  // THE INVARIANT: flatRows IS the concatenation of what renders, in render
  // order. Keyboard selection indexes into it, so any drift between the two
  // means arrowing down highlights one row and Enter opens another.
  it('flattens rows in render order, grouped sub-sections included', () => {
    const { flatRows } = buildFullSearchSections(full(), [url('c1')], 'all');
    expect(flatRows.map((r) => r.id)).toEqual([
      'label-Work',            // labels
      'url-a', 'url-b',        // grouped, group by group
      'url-c',                 // history
      'url-c',                 // notes (same hit, deliberately re-listed)
      'url-a',                 // open tabs
      'c1',                    // chrome history
    ]);
  });

  // grouped hits render one sub-header per group, so the section carries both
  // the per-group structure and the flattened rows that index into flatRows
  it('carries the grouped sub-sections on the section that has them', () => {
    const { sections } = buildFullSearchSections(full(), [], 'grouped');
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].title).toBe('Work');
    expect(sections[0].rows.map((r) => r.id)).toEqual(['url-a', 'url-b']);
  });

  // absence of the key — not an empty array — is what the renderer branches on
  it('leaves groups undefined on flat sections', () => {
    const { sections } = buildFullSearchSections(full(), [], 'history');
    expect(sections[0].groups).toBeUndefined();
  });

  // the section heading and its filter chip must read as the same thing
  it('gives every section a human title', () => {
    const { sections } = buildFullSearchSections(full(), [url('c1')], 'all');
    expect(sections.map((s) => s.title)).toEqual([
      'Groups', 'In my groups', 'History', 'Notes', 'Open tabs', 'Chrome history',
    ]);
  });

  // the page renders once before the index has produced any results
  it('tolerates missing arguments', () => {
    const { sections, flatRows } = buildFullSearchSections(null, null, 'all');
    expect(sections).toEqual([]);
    expect(flatRows).toEqual([]);
  });
});
