import './FullSearchHint.css';

import React from 'react';

// What the page says before anything has been typed.
//
// It names the five things this search actually covers, because the page's whole
// claim is breadth and an empty screen makes no claim at all. A user who arrives
// here with no query should leave knowing that their notes and their open tabs
// are searchable — facts they had no way to learn from the sidebar box.
const FullSearchHint = () => (
  <div className="FullSearch-hint">
    Start typing to search your groups, your history, your notes, and every tab you have open.
  </div>
);

export default FullSearchHint;
