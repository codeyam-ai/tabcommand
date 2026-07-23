import { describe, it, expect } from 'vitest';
import { describeDragRemoval } from './describeDragRemoval.js';
import { ItemTypes } from '../../Constants';

// Build a @hello-pangea/dnd-style drag result whose draggableId matches the
// `<source>-<urlKey>` convention the reducer/describer parse.
const dragResult = (sourceDroppableId, destDroppableId, urlKey) => ({
  type: ItemTypes.URL,
  draggableId: `${sourceDroppableId}-${urlKey}`,
  source: { droppableId: sourceDroppableId },
  destination: { droppableId: destDroppableId },
});

describe('describeDragRemoval', () => {
  // A URL dragged out of one group into another removes it from the source
  // group; the descriptor names that group, the moved key, and its new length.
  it('describes a URL dragged from one group into another', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '1-LabelCollection-urls-Reading',
      'url-https://a.com'
    );
    const labelsAfter = { Work: { urlKeys: ['url-https://b.com'] } };
    expect(describeDragRemoval(result, labelsAfter)).toEqual({
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      remaining: 1,
    });
  });

  // Dragging the last member out leaves the source group empty — remaining 0.
  it('reports remaining 0 when the dragged key was the source group last member', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '1-LabelCollection-urls-Reading',
      'url-https://a.com'
    );
    const labelsAfter = { Work: { urlKeys: [] } };
    expect(describeDragRemoval(result, labelsAfter).remaining).toBe(0);
  });

  // A drag that STARTS in the sidebar (not a group) adds a member but removes
  // none, so there is nothing to record.
  it('returns null for a sidebar-origin drag with no source group', () => {
    const result = {
      type: ItemTypes.URL,
      draggableId: 'tab-list-url-https://a.com',
      source: { droppableId: 'tab-list' },
      destination: { droppableId: '1-LabelCollection-urls-Reading' },
    };
    expect(describeDragRemoval(result, {})).toBeNull();
  });

  // Reordering a member within its own group never moves it out — no removal.
  it('returns null for a same-group reorder', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '0-LabelCollection-urls-Work',
      'url-https://a.com'
    );
    const labelsAfter = { Work: { urlKeys: ['url-https://a.com'] } };
    expect(describeDragRemoval(result, labelsAfter)).toBeNull();
  });

  // A group-reorder drag (LABEL_COLLECTION type) moves no members.
  it('returns null for a non-URL label reorder drag', () => {
    const result = {
      type: ItemTypes.LABEL_COLLECTION,
      draggableId: 'LabelCollectionDraggable-Work',
      source: { droppableId: 'labels' },
      destination: { droppableId: 'labels' },
    };
    expect(describeDragRemoval(result, {})).toBeNull();
  });

  // A drop with no destination (released in empty space) removes nothing.
  it('returns null when there is no destination', () => {
    const result = {
      type: ItemTypes.URL,
      draggableId: '0-LabelCollection-urls-Work-url-https://a.com',
      source: { droppableId: '0-LabelCollection-urls-Work' },
      destination: null,
    };
    expect(describeDragRemoval(result, {})).toBeNull();
  });

  // Defensive: if the source group is absent from the post-drag map, remaining
  // falls back to 0 rather than throwing.
  it('defaults remaining to 0 when the source group is missing from labelsAfter', () => {
    const result = dragResult(
      '0-LabelCollection-urls-Work',
      '1-LabelCollection-urls-Reading',
      'url-https://a.com'
    );
    expect(describeDragRemoval(result, {})).toEqual({
      labelTitle: 'Work',
      urlKeys: ['url-https://a.com'],
      remaining: 0,
    });
  });
});
