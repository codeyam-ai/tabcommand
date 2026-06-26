import './AppBrand.css';

import React from 'react';
import PropTypes from 'prop-types';

import brandIcon from '../../../images/icon.svg';

// The TabCommand wordmark in the sidebar header: the 4-color mark plus a
// "TabCommand" text wordmark (Tab + Command in their brand colors). Clicking it
// returns to Home (handler supplied by the parent).
const AppBrand = ({ onClick }) => (
  <div className="App-brand" onClick={onClick}>
    <img src={brandIcon} className="App-brand-icon" alt="TabCommand" />
    <span className="App-brand-text">
      <span className="App-brand-tab">Tab</span><span className="App-brand-command">Command</span>
    </span>
  </div>
);

AppBrand.propTypes = {
  onClick: PropTypes.func
};

export default AppBrand;
