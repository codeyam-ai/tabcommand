import './AppBrand.css';

import React from 'react';
import PropTypes from 'prop-types';

// The TabCommand brand in the sidebar header: the blocky "TC" monogram (inline
// SVG, lime/gray accent via --brand-command) plus the lowercase "tabcommand"
// wordmark ("tab" in --brand-tab, "command" in --brand-command). Clicking it
// returns to Home (handler supplied by the parent). The crossbar uses
// currentColor (white in dark, ink in light); the three stepped blocks form a
// "C" whose center→left→center zigzag reads as a T over a stepped C.
const AppBrand = ({ onClick }) => (
  <div className="App-brand" onClick={onClick} role="img" aria-label="TabCommand">
    <svg className="App-brand-mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.6" y="2.4" width="19" height="4" rx="1.2" fill="currentColor" />
      <rect x="10.5" y="6.7" width="3.8" height="4" rx="1.1" fill="var(--brand-command)" />
      <rect x="6.4" y="11" width="3.8" height="7.2" rx="1.1" fill="var(--brand-command)" />
      <rect x="10.5" y="18.5" width="3.8" height="4" rx="1.1" fill="var(--brand-command)" />
    </svg>
    <span className="App-brand-text">
      <span className="App-brand-tab">tab</span><span className="App-brand-command">command</span>
    </span>
  </div>
);

AppBrand.propTypes = {
  onClick: PropTypes.func
};

export default AppBrand;
