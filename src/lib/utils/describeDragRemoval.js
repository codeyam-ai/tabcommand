import { ItemTypes } from '../../Constants';

// The droppable id shape for a group's URL list is
// `<index>-LabelCollection-urls-<title>` (see LabelCollection). Used to
// recognize a drag that STARTED in a group so the removal audit trail can note
// the member that left it.
const LABEL_URLS_ID = /[^-]*-LabelCollection-urls-/;

// Describe the source-group removal caused by a URL drag, or null when there is
// none to record: non-URL drags (label reorders), sidebar-origin drags (no
// source group), drags with no destination, and same-group reorders (the key
// never leaves its group). `labelsAfter` is the post-`applyDrag` labels map, so
// `remaining` reflects the source group's new length. The returned shape feeds
// straight into `buildGroupRemovalEntry` as its details object.
export function describeDragRemoval(result, labelsAfter) {
  if (result.type !== ItemTypes.URL) return null;
  const { source, destination, draggableId } = result;
  if (!source || !destination) return null;
  if (source.droppableId.search(LABEL_URLS_ID) === -1) return null;
  const sourceLabelTitle = source.droppableId.replace(LABEL_URLS_ID, '');
  const destLabelTitle = destination.droppableId.replace(LABEL_URLS_ID, '');
  if (destLabelTitle === sourceLabelTitle) return null;
  const urlKey = draggableId.replace(source.droppableId + '-', '');
  const sourceLabel = labelsAfter[sourceLabelTitle];
  return {
    labelTitle: sourceLabelTitle,
    urlKeys: [urlKey],
    remaining: (sourceLabel && sourceLabel.urlKeys.length) || 0
  };
}

export default describeDragRemoval;
