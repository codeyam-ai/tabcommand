import { describe, it, expect } from 'vitest';
import { describeDragAddition } from './describeDragAddition.js';
import { ItemTypes } from '../../Constants';

// Build a @hello-pangea/dnd-style drag result whose draggableId matches the
// `<source>-<urlKey>` convention the reducer/describer parse.
const dragResult = (sourceDroppableId, destDroppableId, urlKey) => ({
  type: ItemTypes.URL,
  draggableId: `${sourceDroppableId}-${urlKey}`,
  source: { droppableId: sourceDroppableId },
  destination: { droppableId: destDroppableId },
});

describe('describeDragAddition', () => {
  // A URL dragged from one group into another joins the destination group; the
  // descriptor names that group, the moved key, and its new length.
  it('describes a URL dragged from one group into another', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '1-LabelCollection-urls-Reading',
      'url-https://a.com'
    );
    const labelsAfter = { Reading: { urlKeys: ['url-https://a.com', 'url-https://c.com'] } };
    expect(describeDragAddition(result, labelsAfter)).toEqual({
      labelTitle: 'Reading',
      urlKeys: ['url-https://a.com'],
      total: 2,
    });
  });

  // A drag that STARTS in the sidebar still ADDS a member — this is exactly the
  // "where did that row come from" case the trail exists for, so it is recorded
  // even though `describeDragRemoval` returns null for the same drop.
  it('describes a sidebar-origin drag that adds a member to a group', () => {
    const result = {
      type: ItemTypes.URL,
      draggableId: 'tab-list-url-https://a.com',
      source: { droppableId: 'tab-list' },
      destination: { droppableId: '1-LabelCollection-urls-Reading' },
    };
    const labelsAfter = { Reading: { urlKeys: ['url-https://a.com'] } };
    expect(describeDragAddition(result, labelsAfter)).toEqual({
      labelTitle: 'Reading',
      urlKeys: ['url-https://a.com'],
      total: 1,
    });
  });

  // A drop OUTSIDE any group (back onto the sidebar) adds no member.
  it('returns null when the destination is not a group', () => {
    const result = {
      type: ItemTypes.URL,
      draggableId: '0-LabelCollection-urls-Work-url-https://a.com',
      source: { droppableId: '0-LabelCollection-urls-Work' },
      destination: { droppableId: 'tab-list' },
    };
    expect(describeDragAddition(result, {})).toBeNull();
  });

  // Reordering within one group never changes membership — nothing joined.
  it('returns null for a same-group reorder', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '0-LabelCollection-urls-Work',
      'url-https://a.com'
    );
    expect(describeDragAddition(result, { Work: { urlKeys: ['url-https://a.com'] } })).toBeNull();
  });

  // Label reorders move whole groups, not members.
  it('returns null for a label-reorder drag', () => {
    const result = {
      ...dragResult('Labels', 'Labels', 'Work'),
      type: ItemTypes.LABEL_COLLECTION,
    };
    expect(describeDragAddition(result, {})).toBeNull();
  });

  // A drag abandoned outside any droppable has no destination to add to.
  it('returns null for a drag with no destination', () => {
    const result = {
      type: ItemTypes.URL,
      draggableId: '0-LabelCollection-urls-Work-url-https://a.com',
      source: { droppableId: '0-LabelCollection-urls-Work' },
      destination: null,
    };
    expect(describeDragAddition(result, {})).toBeNull();
  });
});
