import { describe, it, expect } from 'vitest';
import { labelDisplayOrder } from './labelDisplayOrder';

const tab = (urlKey) => ({ urlKey, tabKey: `tab-${urlKey}` });

describe('labelDisplayOrder', () => {
  // the card paints open tabs above saved-only rows, whatever order they are stored in
  it('puts open tabs ahead of saved-only rows', () => {
    const order = labelDisplayOrder(
      ['url-a', 'url-b', 'url-c'],
      [tab('url-c')]
    );

    expect(order).toEqual(['url-c', 'url-a', 'url-b']);
  });

  // the sort is stable, so rows keep their stored order within the Open section
  it('preserves stored order among the open tabs', () => {
    const order = labelDisplayOrder(
      ['url-a', 'url-b', 'url-c', 'url-d'],
      [tab('url-d'), tab('url-b')]
    );

    expect(order).toEqual(['url-b', 'url-d', 'url-a', 'url-c']);
  });

  // stability again on the other side of the split: saved rows keep their order
  it('preserves stored order among the saved-only rows', () => {
    const order = labelDisplayOrder(
      ['url-z', 'url-y', 'url-x'],
      [tab('url-y')]
    );

    expect(order).toEqual(['url-y', 'url-z', 'url-x']);
  });

  // with nothing open the displayed order is exactly the stored order
  it('returns the stored order unchanged when no tab is open', () => {
    expect(labelDisplayOrder(['url-a', 'url-b'], [])).toEqual(['url-a', 'url-b']);
  });

  // an absent activeTabs list is treated as "nothing is open" rather than throwing
  it('tolerates a null activeTabs list', () => {
    expect(labelDisplayOrder(['url-a', 'url-b'], null)).toEqual(['url-a', 'url-b']);
  });

  // an empty or absent group is tolerated rather than throwing
  it('returns an empty array for an empty or missing group', () => {
    expect(labelDisplayOrder([], [tab('url-a')])).toEqual([]);
    expect(labelDisplayOrder(null, [tab('url-a')])).toEqual([]);
  });

  // callers hand in the stored array itself, so the helper must not reorder it in place
  it('does not mutate the urlKeys it was given', () => {
    const stored = ['url-a', 'url-b', 'url-c'];
    labelDisplayOrder(stored, [tab('url-c')]);
    expect(stored).toEqual(['url-a', 'url-b', 'url-c']);
  });
});
