import './HistoryRow.css';

import React from 'react';
import { Favicon } from '../Favicon';

// One closed/visited tab in the History list: a group-color dot, the tab's
// favicon (monogram fallback when the site has none), its title (full
// title+URL in the native tooltip), a mono timestamp when known, and a Reopen
// action. `row` carries `{ urlKey, title, favicon, color, ts }`; `onReopen`
// receives the urlKey.
const HistoryRow = ({ row, onReopen }) => (
  <div className="HistoryRow">
    <span
      className="HistoryRow-dot"
      style={{ background: row.color || 'var(--text-muted)' }}
    />
    <Favicon favicon={row.favicon} urlKey={row.urlKey} title={row.title} />
    <span className="HistoryRow-title" title={row.title}>{row.title}</span>
    {row.ts && (
      <span className="HistoryRow-time">
        {new Date(row.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    )}
    <button className="HistoryRow-reopen" onClick={() => onReopen(row.urlKey)}>
      ↻ Reopen
    </button>
  </div>
);

export default HistoryRow;
