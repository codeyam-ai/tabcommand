// What a group card should paint right now: the pending appearance reported by
// an open edit form when one is in flight, otherwise the committed values.
//
// The two fallback chains carry the feature's whole contract. Preview values are
// cleared to null on every dismissal path, so dropping them is what reverts the
// card — there is no separate revert step. And the title falls through to the
// committed name rather than rendering the empty string, so clearing the name
// field mid-edit previews as the current title instead of a blank header.
//
// `title` is the immutable prop the card was mounted with; `currentTitle` is the
// storage-backed value, which is what a rename updates.
const groupCardAppearance = ({
  previewTitle,
  previewBackgroundColor,
  currentTitle,
  currentBackgroundColor,
  title
} = {}) => ({
  color: previewBackgroundColor || currentBackgroundColor,
  titleText: previewTitle || currentTitle || title
});

export default groupCardAppearance;
