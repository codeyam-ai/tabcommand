import { ItemTypes } from '../../Constants';

// The droppable id shape for a group's URL list is
// `<index>-LabelCollection-urls-<title>` (see LabelCollection). Used to
// recognize a drag that ENDED in a group so the addition audit trail can note
// the member that joined it.
const LABEL_URLS_ID = /[^-]*-LabelCollection-urls-/;

// Describe the destination-group addition caused by a URL drag, or null when
// there is none to record: non-URL drags (label reorders), drops outside a group
// (the sidebar), drags with no destination, and same-group reorders (the key was
// already a member, so nothing joined). `labelsAfter` is the post-`applyDrag`
// labels map, so `total` reflects the destination group's new length. The
// returned shape feeds straight into `buildGroupAdditionEntry` as its details
// object. Mirror of `describeDragRemoval`.
export function describeDragAddition(result, labelsAfter) {
  if (result.type !== ItemTypes.URL) return null;
  const { source, destination, draggableId } = result;
  if (!source || !destination) return null;
  if (destination.droppableId.search(LABEL_URLS_ID) === -1) return null;
  const destLabelTitle = destination.droppableId.replace(LABEL_URLS_ID, '');
  const sourceLabelTitle = source.droppableId.replace(LABEL_URLS_ID, '');
  if (destLabelTitle === sourceLabelTitle) return null;
  const urlKey = draggableId.replace(source.droppableId + '-', '');
  const destLabel = labelsAfter[destLabelTitle];
  return {
    labelTitle: destLabelTitle,
    urlKeys: [urlKey],
    total: (destLabel && destLabel.urlKeys.length) || 0
  };
}

export default describeDragAddition;
