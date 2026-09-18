import './FullSearchInput.css';

import React from 'react';
import PropTypes from 'prop-types';

import { Icon } from '../Icon';

// The Full Search page's own query field — large, autofocused, and seeded with
// whatever query the sidebar overlay handed over.
//
// It is a second input for the same search, not a duplicate of the sidebar box:
// arriving on this page means the user wants to work the query rather than jump
// to a hit, so the field is where their attention already is and takes focus on
// mount.
const FullSearchInput = ({ value, onChange, inputRef, placeholder = 'Search everything' }) => (
  <div className="FullSearch-inputWrap">
    <Icon name="search" size={18} className="FullSearch-inputIcon" />
    <input
      ref={inputRef}
      id="FullSearch-Input"
      className="FullSearch-input"
      type="text"
      value={value}
      placeholder={placeholder}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

FullSearchInput.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  inputRef: PropTypes.object,
  placeholder: PropTypes.string,
};

export default FullSearchInput;
