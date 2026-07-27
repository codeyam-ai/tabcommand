import './HistorySection.css';

import React from 'react';
import { HistoryRow } from '../HistoryRow';

// One day group on the History page: the bucket name as a mono eyebrow, then
// its rows. Renders nothing for an empty bucket so a day with no history leaves
// no orphan heading behind. Rows arrive already sorted newest-first by
// useHistoryRows; this component does not reorder them.
const HistorySection = ({ bucket, rows, onReopen }) => {
  if (!rows.length) return null;

  return (
    <section className="History-section">
      <div className="History-eyebrow">{bucket}</div>
      {rows.map((row) => (
        <HistoryRow key={row.urlKey} row={row} onReopen={onReopen} />
      ))}
    </section>
  );
};

export default HistorySection;
