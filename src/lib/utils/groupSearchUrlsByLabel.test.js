import { describe, it, expect } from 'vitest';
import groupSearchUrlsByLabel from './groupSearchUrlsByLabel';

describe('groupSearchUrlsByLabel', () => {
  const url = (id, title, color) => ({
    id,
    url: `https://${id}.com`,
    urlTitle: id,
    urlLabelTitle: title,
    urlLabelColor: color,
  });

  // groups appear in first-appearance order; urls keep their input order within a group
  it('groups urls by label in first-appearance order', () => {
    const groups = groupSearchUrlsByLabel([
      url('a', 'Work', '#1873E4'),
      url('b', 'Reading', '#1F8E43'),
      url('c', 'Work', '#1873E4'),
    ]);
    expect(groups).toEqual([
      { title: 'Work', color: '#1873E4', urls: [url('a', 'Work', '#1873E4'), url('c', 'Work', '#1873E4')] },
      { title: 'Reading', color: '#1F8E43', urls: [url('b', 'Reading', '#1F8E43')] },
    ]);
  });

  // a single group yields exactly one sub-section
  it('returns a single group when all urls share a label', () => {
    const groups = groupSearchUrlsByLabel([
      url('a', 'Work', '#1873E4'),
      url('b', 'Work', '#1873E4'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Work');
    expect(groups[0].urls.map((u) => u.id)).toEqual(['a', 'b']);
  });

  // flattening the groups recovers the input order, keeping activation indices aligned
  it('preserves overall order when flattened', () => {
    const urls = [
      url('a', 'Work', '#1873E4'),
      url('b', 'Reading', '#1F8E43'),
      url('c', 'Work', '#1873E4'),
      url('d', 'Reading', '#1F8E43'),
    ];
    const flat = groupSearchUrlsByLabel(urls).flatMap((g) => g.urls);
    // grouped, so ordering is Work's two then Reading's two — not the raw input
    expect(flat.map((u) => u.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  // the group carries the color off the first url seen for that label
  it('carries the group color from the first url in the group', () => {
    const groups = groupSearchUrlsByLabel([url('a', 'Shopping', '#E47415')]);
    expect(groups[0].color).toBe('#E47415');
  });

  // a null/empty/non-array input yields an empty list, never throws
  it('returns an empty array for empty or invalid input', () => {
    expect(groupSearchUrlsByLabel([])).toEqual([]);
    expect(groupSearchUrlsByLabel(null)).toEqual([]);
    expect(groupSearchUrlsByLabel(undefined)).toEqual([]);
  });
});
