import './ChromeHistoryToggle.css';

import React from 'react';
import PropTypes from 'prop-types';

// The opt-in switch for searching Chrome's own browsing history.
//
// The "asks permission the first time" note is shown ONLY while the permission
// is ungranted, and it is the component's whole reason for existing as its own
// piece: this is the one control in TabCommand that triggers a browser
// permission prompt, and a switch that summons a system dialog without warning
// is a switch people learn not to touch. Once granted, the note disappears —
// it has said what it needed to.
const ChromeHistoryToggle = ({ checked, granted, onToggle }) => (
  <label className="FullSearch-toggle">
    <input type="checkbox" checked={checked} onChange={onToggle} />
    <span className="FullSearch-toggle-label">Include Chrome history</span>
    {!granted && (
      <span className="FullSearch-toggle-note">asks permission the first time</span>
    )}
  </label>
);

ChromeHistoryToggle.propTypes = {
  checked: PropTypes.bool,
  granted: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
};

export default ChromeHistoryToggle;
