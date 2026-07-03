import './FavoritesResetControl.css';

import React, { useState } from 'react';

// The "Reset favorites tracking" control on the Favorites View All page. A quiet
// utility button at rest; clicking it reveals an inline two-step confirm — an
// explanatory line plus a destructive "Yes, reset everything" and a "Cancel" —
// so the destructive action always takes a deliberate second click (rather than
// a native confirm() dialog). It owns only the confirm/cancel toggle state; the
// actual reset is `onReset`, supplied by the page (which clears the visit signal
// and favoritesHidden in storage).
const FavoritesResetControl = ({ onReset }) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="FavoritesResetControl">
      {confirming ? (
        <div className="FavoritesResetControl-confirm">
          <span className="FavoritesResetControl-warning">
            This clears every site&apos;s visit history for Favorites and
            unhides all removed favorites. History &amp; Search are untouched.
          </span>
          <button
            type="button"
            className="FavoritesResetControl-yes"
            onClick={() => {
              onReset();
              setConfirming(false);
            }}
          >
            Yes, reset everything
          </button>
          <button
            type="button"
            className="FavoritesResetControl-cancel"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="FavoritesResetControl-btn"
          onClick={() => setConfirming(true)}
        >
          Reset favorites tracking
        </button>
      )}
    </div>
  );
};

export default FavoritesResetControl;
