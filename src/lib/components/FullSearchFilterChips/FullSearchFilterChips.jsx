import './FullSearchFilterChips.css';

import React from 'react';
import PropTypes from 'prop-types';

// The filter row: one chip per source, each carrying its count.
//
// The count is the feature, not decoration. It is how the shape of a result set
// becomes legible before a single row is read — "forty matches, but only two are
// in my groups" is the answer the page exists to give, and it is visible without
// clicking anything.
//
// A zero-count chip is DIMMED BUT STILL CLICKABLE rather than hidden. Hiding it
// would make the chip row change width as the user types, and the absence of a
// section is itself an answer: "nothing in Notes" is information, and it can
// only be read from a chip that is still there.
const FullSearchFilterChips = ({ chips, counts, active, onSelect }) => (
  <div className="FullSearch-chips">
    {chips.map((chip) => (
      <button
        key={`chip-${chip.key}`}
        className={`FullSearch-chip ${active === chip.key ? 'FullSearch-chip-active' : ''} ${counts[chip.key] ? '' : 'FullSearch-chip-empty'}`}
        onClick={() => onSelect(chip.key)}
      >
        {chip.label}
        <span className="FullSearch-chip-count">{counts[chip.key] || 0}</span>
      </button>
    ))}
  </div>
);

FullSearchFilterChips.propTypes = {
  chips: PropTypes.array.isRequired,
  counts: PropTypes.object.isRequired,
  active: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};

export default FullSearchFilterChips;
