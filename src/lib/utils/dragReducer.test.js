import { describe, it, expect } from 'vitest';
import { ItemTypes } from '../../Constants';
import { applyDrag } from './dragReducer';

describe('applyDrag', () => {
  // a url dragged from the Tabs sidebar (a non-label source) is inserted into
  // the destination label at the drop index, with nothing to ungroup
  it('inserts a url dropped from the sidebar into the destination label', () => {
    const labels = { Work: { title: 'Work', position: 0, urlKeys: [] } };
    const activeTabs = [{ urlKey: 'url-x', tabKey: 'tab-5' }];

    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: 'Tabs-urls-ungrouped-url-x',
        source: { droppableId: 'Tabs-urls-ungrouped', index: 0 },
        destination: { droppableId: '0-LabelCollection-urls-Work', index: 0 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Work.urlKeys).toEqual(['url-x']);
    expect(result.ungroupTabIds).toEqual([]);
  });

  // moving a url between two groups removes it from the source group's urlKeys,
  // inserts it into the destination at the drop index, and reports the active
  // tab id that must be ungrouped from its Chrome tab group
  it('moves a url between groups and reports the tab to ungroup', () => {
    const labels = {
      Work: { title: 'Work', position: 0, urlKeys: ['url-a', 'url-b'] },
      Reading: { title: 'Reading', position: 1, urlKeys: ['url-c'] }
    };
    const activeTabs = [{ urlKey: 'url-a', tabKey: 'tab-7' }];

    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Work-url-a',
        source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
        destination: { droppableId: '1-LabelCollection-urls-Reading', index: 1 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Work.urlKeys).toEqual(['url-b']);
    expect(result.labels.Reading.urlKeys).toEqual(['url-c', 'url-a']);
    expect(result.ungroupTabIds).toEqual([7]);
  });

  // moving a url out of a group whose member is not an open tab needs no ungroup
  it('does not report an ungroup when the moved url has no active tab', () => {
    const labels = {
      Work: { title: 'Work', position: 0, urlKeys: ['url-a'] },
      Reading: { title: 'Reading', position: 1, urlKeys: [] }
    };

    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Work-url-a',
        source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
        destination: { droppableId: '1-LabelCollection-urls-Reading', index: 0 }
      },
      { labels, activeTabs: [] }
    );

    expect(result.labels.Work.urlKeys).toEqual([]);
    expect(result.labels.Reading.urlKeys).toEqual(['url-a']);
    expect(result.ungroupTabIds).toEqual([]);
  });

  // reordering a group rewrites every label's position to its new index
  it('rewrites positions when a group is reordered', () => {
    const labels = {
      A: { title: 'A', position: 0, urlKeys: [] },
      B: { title: 'B', position: 1, urlKeys: [] },
      C: { title: 'C', position: 2, urlKeys: [] }
    };

    const result = applyDrag(
      {
        type: ItemTypes.LABEL_COLLECTION,
        source: { index: 0 },
        destination: { index: 2, droppableId: 'LabelCollections0' }
      },
      { labels, activeTabs: [] }
    );

    // A moved to the end → order is B, C, A
    expect(result.labels.B.position).toBe(0);
    expect(result.labels.C.position).toBe(1);
    expect(result.labels.A.position).toBe(2);
  });

  // a drop with no valid destination is a no-op (returns null)
  it('returns null when there is no destination', () => {
    expect(
      applyDrag(
        { type: ItemTypes.URL, source: { droppableId: 'x', index: 0 }, destination: null },
        { labels: {}, activeTabs: [] }
      )
    ).toBeNull();
  });
});
