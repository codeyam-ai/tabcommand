import React from 'react';
import PropTypes from 'prop-types';

import { GroupSwatch } from '../GroupSwatch';

// A group result on the Full Search page — the user searched a word that names
// one of their groups, so the group itself is the match.
//
// Deliberately much plainer than a URL row: a group has no host, no notes, no
// open state and nothing to edit from here. Activating it selects the group and
// routes Home, which the page owns.
const FullSearchLabelRow = ({ hit, index, selected, onSelect, onActivate }) => (
  <div
    className={`FullSearch-row FullSearch-row-label ${selected ? 'FullSearch-row-selected' : ''}`}
    onMouseEnter={() => onSelect(index)}
    onClick={(e) => onActivate(hit, e.metaKey)}
  >
    <GroupSwatch color={hit.color} />
    <div className='FullSearch-row-title'>{hit.labelTitle}</div>
  </div>
);

FullSearchLabelRow.propTypes = {
  hit: PropTypes.object.isRequired,
  index: PropTypes.number,
  selected: PropTypes.bool,
  onSelect: PropTypes.func,
  onActivate: PropTypes.func,
};

export default FullSearchLabelRow;
