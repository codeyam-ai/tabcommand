import './ExportPanel.css';

import React from 'react';

import { SnapshotField } from '../SnapshotField';

// The backup half of the recover/backup page: the current groups serialized to
// JSON, and every prior snapshot beneath it.
//
// Every snapshot here — current and previous alike — is copyable in one click,
// because the whole purpose of the page is handing the user a snapshot they can
// paste somewhere safe. The Previous entries are a list, where a per-row button
// is the only way to act on a specific row.
const ExportPanel = ({ current, previous = [] }) => (
  <section className="ExportPanel">
    <h2 className="ExportPanel-eyebrow">Export</h2>

    <h3 className="ExportPanel-subhead">Current</h3>
    <SnapshotField value={current} />

    <h3 className="ExportPanel-subhead">Previous (most recent first)</h3>
    {previous.map((snapshot, index) => (
      <SnapshotField key={`previousLabels-${index}`} value={snapshot} />
    ))}
  </section>
);

export default ExportPanel;
