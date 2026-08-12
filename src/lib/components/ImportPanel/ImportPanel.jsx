import './ImportPanel.css';

import React from 'react';

import { SnapshotBox } from '../SnapshotBox';
import { ImportMessage } from '../ImportMessage';

// Where a saved snapshot is pasted back in to restore the user's groups.
//
// Purely presentational — the parse, the write, and the read-back confirmation
// all stay on the page, because "did the groups actually land" is a storage
// question and this component has no business asking it. What it owns is the
// arrangement: the message sits BETWEEN the box and the button, so an account
// of what went wrong appears next to the text it went wrong on rather than
// below the control that triggered it.
const ImportPanel = ({ value, onChange, onImport, error, notice }) => (
  <section className="ImportPanel">
    <h2 className="ImportPanel-eyebrow">Import</h2>

    <SnapshotBox
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // The app opens search on any keystroke, so an unguarded paste box would
      // have every character stolen by the search field.
      onKeyDown={(event) => event.stopPropagation()}
    />

    <ImportMessage tone="error">{error}</ImportMessage>
    <ImportMessage tone="notice">{notice}</ImportMessage>

    <button className="ImportPanel-save" onClick={onImport}>
      Import
    </button>
  </section>
);

export default ImportPanel;
