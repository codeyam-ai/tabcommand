import './History.css';

import React from 'react';
import { Chrome } from '../../utils/Chrome';
import { Pages } from '../../../Constants';
import { PageHeader, HistorySection, EmptyState } from '../../components';
import { HISTORY_BUCKETS } from '../../utils/historyBuckets';
import { useHistoryRows } from '../../hooks/useHistoryRows';

const back = () => {
  Chrome.get('History0', 'uxSettings', ({ uxSettings }) => {
    uxSettings.page = { name: Pages.HOME };
    Chrome.set('History1', { uxSettings });
  });
};

// History: every closed/visited tab, grouped by Today / Yesterday / Earlier this
// week and sorted newest-first within each group, each with a Reopen action.
// "Nothing is ever lost." All the data work — reading the stores, dating each
// row, bucketing, sorting, and staying live — belongs to useHistoryRows; this
// file only composes the view.
const History = () => {
  const { rows, reopen, deleteRow } = useHistoryRows();

  // The confirm step lives in HistoryRow as an inline two-step control (the
  // FavoritesResetControl pattern), so `deleteRow` is already the confirmed
  // action by the time it reaches here. Deleting only forgets the page — it
  // deliberately leaves group membership alone, so a deleted page can still
  // appear on its group card.
  return (
    <div className="History">
      <PageHeader
        title="History"
        intro="Nothing is ever lost — every tab you have closed or visited lives here."
        onBack={back}
      />

      {HISTORY_BUCKETS.map((bucket) => (
        <HistorySection
          key={bucket}
          bucket={bucket}
          rows={rows.filter((row) => row.bucket === bucket)}
          onReopen={reopen}
          onDelete={deleteRow}
        />
      ))}

      {!rows.length && <EmptyState message="No history yet." />}
    </div>
  );
};

export default History;
