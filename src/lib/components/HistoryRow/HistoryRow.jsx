import './HistoryRow.css';

import React, { useState } from 'react';
import { Favicon } from '../Favicon';
import { HistoryRowActions } from '../HistoryRowActions';

// One closed/visited tab in the History list: a group-color dot, the tab's
// favicon (monogram fallback when the site has none), its title (full
// title+URL in the native tooltip), a mono timestamp when known, and a Reopen
// action. `row` carries `{ urlKey, title, favicon, color, ts }`; `onReopen`
// receives the urlKey. The whole row is a click/keyboard target that reopens
// the tab; the explicit Reopen button stops propagation so it doesn't double-fire.
//
// `onDelete` (also urlKey-in) is OPTIONAL and adds a ✕ that deletes the page
// from History. Rendering it only when supplied keeps every existing render site
// — and the component scenarios pinned to them — unchanged.
//
// The ✕ opens an INLINE two-step confirm rather than a native confirm() dialog,
// following FavoritesResetControl: a destructive action takes a deliberate
// second click, and unlike a native dialog the confirming state is a real
// rendered state that can be shown, captured, and cancelled.
const HistoryRow = ({ row, onReopen, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const reopen = () => onReopen(row.urlKey);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      reopen();
    }
  };

  return (
    <div
      className={`HistoryRow${confirming ? ' HistoryRow-confirming' : ''}`}
      role="button"
      tabIndex={0}
      onClick={reopen}
      onKeyDown={handleKeyDown}
    >
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
      <HistoryRowActions
        confirming={confirming}
        onReopen={reopen}
        onStartConfirm={onDelete && (() => setConfirming(true))}
        onConfirmDelete={() => {
          setConfirming(false);
          onDelete(row.urlKey);
        }}
        onCancel={() => setConfirming(false)}
        deleteLabel={`Delete ${row.title} from history`}
      />
    </div>
  );
};

export default HistoryRow;
