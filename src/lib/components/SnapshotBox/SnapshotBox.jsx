import './SnapshotBox.css';

import React from 'react';

// The text field a snapshot lives in — pasted into for Import, read out of for
// Export. Read-only is the common case; the Import box is the one that is not.
//
// `onKeyDown` is passed through rather than assumed, because the Import box has
// to stop key events from propagating: the app listens globally for typing to
// open search, and without that guard every keystroke of a paste-and-edit would
// be stolen by the search field.
const SnapshotBox = ({ value, readOnly = false, onChange, onKeyDown }) => (
  <textarea
    className="SnapshotBox"
    value={value}
    readOnly={readOnly}
    onChange={onChange}
    onKeyDown={onKeyDown}
  />
);

export default SnapshotBox;
