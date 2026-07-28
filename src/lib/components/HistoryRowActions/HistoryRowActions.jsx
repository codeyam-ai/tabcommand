import './HistoryRowActions.css';

import React from 'react';

// The trailing action area of a History row, in one of two states: at rest a
// Reopen button plus an optional ✕ that arms a delete, and while `confirming` a
// destructive Delete beside a Cancel.
//
// Purely presentational — the `confirming` flag lives in HistoryRow, which also
// uses it to hold the row visually raised while the second click is pending.
// Every button stops propagation so it never double-fires the row's own
// click-to-reopen handler.
//
// The ✕ arms an INLINE confirm rather than a native confirm() dialog, following
// FavoritesResetControl: the confirming state is a real rendered state, so it
// can be shown, captured and cancelled — a native dialog can be none of those.
const HistoryRowActions = ({
  confirming,
  onReopen,
  onStartConfirm,
  onConfirmDelete,
  onCancel,
  deleteLabel,
}) => {
  const stop = (handler) => (e) => {
    e.stopPropagation();
    handler();
  };

  if (confirming) {
    return (
      <>
        <button className="HistoryRowActions-confirmDelete" onClick={stop(onConfirmDelete)}>
          Delete
        </button>
        <button className="HistoryRowActions-cancel" onClick={stop(onCancel)}>
          Cancel
        </button>
      </>
    );
  }

  return (
    <>
      <button className="HistoryRowActions-reopen" onClick={stop(onReopen)}>
        ↻ Reopen
      </button>
      {onStartConfirm && (
        <button
          className="HistoryRowActions-delete"
          title="Delete from history"
          aria-label={deleteLabel}
          onClick={stop(onStartConfirm)}
        >
          ✕
        </button>
      )}
    </>
  );
};

export default HistoryRowActions;
