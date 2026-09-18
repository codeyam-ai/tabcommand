import './OpenFullSearchRow.css';

import React from 'react';
import PropTypes from 'prop-types';

import { Icon } from '../Icon';

// The pinned first row of the sidebar search overlay: "Open Full Search for
// <query>".
//
// It occupies flat index 0 whenever there is query text, and it is the default
// selection — so Enter goes to the full page rather than to the top hit. That is
// a deliberate change to a reflex people already have (Enter used to open the
// first result, which is now ArrowDown then Enter), and the row earns it by
// being the only affordance that can answer "show me everything" from an overlay
// that caps its own results at ten.
//
// It renders ABOVE every section including "No Results", because a query with no
// hits is exactly when a user most wants somewhere else to look.
const OpenFullSearchRow = ({ query, selected, onSelect, onActivate }) => (
  <div
    className={`SearchResults-result SearchResults-result-fullSearch ${selected ? 'SearchResults-result-selected' : ''}`}
    onMouseEnter={onSelect}
    onClick={onActivate}
  >
    <Icon name="search" size={15} className='SearchResults-fullSearchIcon' />
    <div className='SearchResults-result-title'>
      Open Full Search for &ldquo;{query}&rdquo;
    </div>
  </div>
);

OpenFullSearchRow.propTypes = {
  query: PropTypes.string,
  selected: PropTypes.bool,
  onSelect: PropTypes.func,
  onActivate: PropTypes.func,
};

export default OpenFullSearchRow;
