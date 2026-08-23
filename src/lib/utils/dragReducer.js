// Pure transform behind App's `onDragEnd`. Factored out of the component so the
// URL-move and label-reorder logic can be unit-tested without driving
// `@hello-pangea/dnd` end-to-end (which is brittle in jsdom). This is App's
// `handleDrag` logic.
//
// Mutates and returns the passed `labels` map (it reads-modifies-writes the
// stored object), plus the list of tab ids that must
// be ungrouped via `chrome.tabs.ungroup` when a url leaves an active label.
// Returns `null` for drops with no valid destination (the caller should no-op).
import { ItemTypes } from '../../Constants';
import labelDisplayOrder from './labelDisplayOrder';

// `destination.index` counts rows as the group card PAINTS them (open tabs
// first), which is not the order they sit in `urlKeys`. Translate: find the key
// currently occupying that displayed slot and insert immediately before it. An
// index at or past the end — an ambiguous drop, or the last slot — appends,
// which is also what the service worker does when it files a new member.
const storageIndexForDisplayIndex = (displayIndex, urlKeys, activeTabs) => {
  const displayed = labelDisplayOrder(urlKeys, activeTabs);
  if (!(displayIndex >= 0) || displayIndex >= displayed.length) return urlKeys.length;

  const keyAtSlot = displayed[displayIndex];
  const storageIndex = urlKeys.indexOf(keyAtSlot);
  return storageIndex === -1 ? urlKeys.length : storageIndex;
};

export const applyDrag = (
  { type, source, destination, draggableId },
  { labels, activeTabs }
) => {
  if (!destination || !destination.droppableId) return null;

  const ungroupTabIds = [];

  if (type === ItemTypes.URL) {
    const labelContainerIdPart = /[^-]*-LabelCollection-urls-/;
    const urlKey = draggableId.replace(source.droppableId + '-', '');
    const labelTitle = destination.droppableId.replace(labelContainerIdPart, '');

    if (source.droppableId.search(labelContainerIdPart) > -1) {
      const sourceLabelTitle = source.droppableId.replace(labelContainerIdPart, '');
      const sourceIndex = labels[sourceLabelTitle].urlKeys.indexOf(urlKey);
      labels[sourceLabelTitle].urlKeys.splice(sourceIndex, 1);

      const activeTab = (activeTabs || []).filter(t => t.urlKey === urlKey)[0];
      if (activeTab) {
        ungroupTabIds.push(parseInt(activeTab.tabKey.split('-')[1]));
      }
    }

    // A drop into a group that no longer exists has nowhere to land; no-op
    // rather than throwing, the same contract as a destination-less drop.
    const destinationLabel = labels[labelTitle];
    if (!destinationLabel || !destinationLabel.urlKeys) return null;

    // Computed AFTER the source removal above: for a same-group reorder the
    // library reports its destination index against the post-removal list, and
    // that splice has already mutated this very array.
    const storageIndex = storageIndexForDisplayIndex(
      destination.index,
      destinationLabel.urlKeys,
      activeTabs
    );

    destinationLabel.urlKeys.splice(storageIndex, 0, urlKey);
  } else if (type === ItemTypes.LABEL_COLLECTION) {
    const sortedLabels = Object.values(labels).sort(
      (a, b) => a.title.localeCompare(b.title)
    ).sort(
      (a, b) => (a.position || 0) - (b.position || 0)
    );
    sortedLabels.splice(destination.index, 0, sortedLabels.splice(source.index, 1)[0]);

    for (let i = 0; i < sortedLabels.length; ++i) {
      sortedLabels[i].position = i;
      labels[sortedLabels[i].title] = sortedLabels[i];
    }
  }

  return { labels, ungroupTabIds };
};

export default applyDrag;
