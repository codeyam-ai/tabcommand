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

    labels[labelTitle].urlKeys.splice(destination.index, 0, urlKey);
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
