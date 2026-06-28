import './SearchHint.css';

import React from 'react';

// A quiet, low-emphasis hint rendered under the search bar (Home only). It makes
// an existing affordance discoverable: the app already focuses the search input
// on any keystroke (Search.jsx's handleKeyDown), so "just start typing" is honest.
const SearchHint = () => (
  <p className="SearchHint">Just start typing at any time to search</p>
);

export default SearchHint;
