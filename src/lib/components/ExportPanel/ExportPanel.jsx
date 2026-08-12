import './ExportPanel.css';

import React from 'react';

import { SnapshotBox } from '../SnapshotBox';
import { SnapshotField } from '../SnapshotField';

// The backup half of the recover/backup page: the current groups serialized to
// JSON, and every prior snapshot beneath it.
//
// The current snapshot deliberately has NO Copy button while each previous one
// does. It is the field the sync warnings point at, so it is the one the user is
// most likely to be reading rather than reaching for — and the Previous entries
// are a list, where a per-row button is the only way to act on a specific row.
const ExportPanel = ({ current, previous = [] }) => (
  <section className="ExportPanel">
    <h2 className="ExportPanel-eyebrow">Export</h2>

    <h3 className="ExportPanel-subhead">Current</h3>
    <SnapshotBox value={current} readOnly={true} />

    <h3 className="ExportPanel-subhead">Previous (most recent first)</h3>
    {previous.map((snapshot, index) => (
      <SnapshotField key={`previousLabels-${index}`} value={snapshot} />
    ))}
  </section>
);

export default ExportPanel;
