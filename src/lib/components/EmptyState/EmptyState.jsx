import './EmptyState.css';

import React from 'react';

// The muted "nothing here yet" line a page shows in place of its list. History
// and ViewAllFavorites each carried their own copy of this markup off
// identically-styled classes, so it lives here once.
const EmptyState = ({ message }) => <div className="EmptyState">{message}</div>;

export default EmptyState;
