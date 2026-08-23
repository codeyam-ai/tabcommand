import { describe, it, expect } from 'vitest';
import { ItemTypes } from '../../Constants';
import { applyDrag } from './dragReducer';
import { labelDisplayOrder } from './labelDisplayOrder';

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

  // a group card renders open tabs above saved ones, so the drop index the
  // library reports is an index into that DISPLAYED order — reordering the
  // saved rows must move the right key in the stored urlKeys array
  it('maps the displayed drop index onto the stored urlKeys order', () => {
    // stored order [a, b, c]; c is open, so the card paints [c, a, b]
    const labels = { Personal: { title: 'Personal', position: 0, urlKeys: ['url-a', 'url-b', 'url-c'] } };
    const activeTabs = [{ urlKey: 'url-c', tabKey: 'tab-3' }];

    // drag url-b (displayed index 2) up to displayed index 1, just under url-c
    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Personal-url-b',
        source: { droppableId: '0-LabelCollection-urls-Personal', index: 2 },
        destination: { droppableId: '0-LabelCollection-urls-Personal', index: 1 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Personal.urlKeys).toEqual(['url-b', 'url-a', 'url-c']);
  });

  // the plain case: with nothing open, displayed and stored order are identical
  // and a reorder is a straight splice — proves the translation is a no-op here
  it('reorders an all-saved group without disturbing the stored order', () => {
    const labels = { Work: { title: 'Work', position: 0, urlKeys: ['url-a', 'url-b', 'url-c'] } };

    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Work-url-a',
        source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
        destination: { droppableId: '0-LabelCollection-urls-Work', index: 2 }
      },
      { labels, activeTabs: [] }
    );

    expect(result.labels.Work.urlKeys).toEqual(['url-b', 'url-c', 'url-a']);
  });

  // a cross-group drop lands mid-list in a destination whose displayed order
  // differs from its stored order — the same translation, across cards
  it('lands a cross-group drop at the displayed slot it was dropped on', () => {
    const labels = {
      Work: { title: 'Work', position: 0, urlKeys: ['url-a'] },
      // stored [r1, r2, r3] with r3 open, so the card paints [r3, r1, r2]
      Reading: { title: 'Reading', position: 1, urlKeys: ['url-r1', 'url-r2', 'url-r3'] }
    };
    const activeTabs = [{ urlKey: 'url-r3', tabKey: 'tab-9' }];

    // dropped on displayed index 2 — the slot url-r2 occupies
    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Work-url-a',
        source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
        destination: { droppableId: '1-LabelCollection-urls-Reading', index: 2 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Reading.urlKeys).toEqual(['url-r1', 'url-a', 'url-r2', 'url-r3']);
    expect(labelDisplayOrder(result.labels.Reading.urlKeys, activeTabs))
      .toEqual(['url-r3', 'url-r1', 'url-a', 'url-r2']);
  });

  // an ambiguous drop — the title bar, the empty state, below the last row —
  // arrives as an index past the end and must append rather than land on top
  it('appends when the drop index is past the end of the group', () => {
    const labels = {
      Work: { title: 'Work', position: 0, urlKeys: ['url-a'] },
      Reading: { title: 'Reading', position: 1, urlKeys: ['url-r1', 'url-r2'] }
    };
    const activeTabs = [{ urlKey: 'url-r2', tabKey: 'tab-4' }];

    const result = applyDrag(
      {
        type: ItemTypes.URL,
        draggableId: '0-LabelCollection-urls-Work-url-a',
        source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
        destination: { droppableId: '1-LabelCollection-urls-Reading', index: 99 }
      },
      { labels, activeTabs }
    );

    expect(result.labels.Reading.urlKeys).toEqual(['url-r1', 'url-r2', 'url-a']);
  });

  // a drop onto a group that no longer exists is a no-op rather than a throw
  it('returns null when the destination group is missing', () => {
    const labels = { Work: { title: 'Work', position: 0, urlKeys: ['url-a'] } };

    expect(
      applyDrag(
        {
          type: ItemTypes.URL,
          draggableId: '0-LabelCollection-urls-Work-url-a',
          source: { droppableId: '0-LabelCollection-urls-Work', index: 0 },
          destination: { droppableId: '1-LabelCollection-urls-Gone', index: 0 }
        },
        { labels, activeTabs: [] }
      )
    ).toBeNull();
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
