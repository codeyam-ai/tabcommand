import './PageContentsScopeControls.css';

import React from 'react';
import PropTypes from 'prop-types';

import scanScopeOptions from '../../utils/scanScopeOptions';

// The row that says WHAT to scan and starts or stops it.
//
// The scope picker leads because it is the only place the user says how much of
// their browsing this is allowed to touch, and `scanScopeOptions` owns the order
// it offers them in.
//
// Everything here is disabled while a scan runs, except the button — which
// becomes Cancel. A scan that could be re-scoped underneath itself would finish
// reporting a total from one scope and results from another.
//
// The permission note is shown ONLY while the grant is outstanding and no
// refusal has been recorded, the same rule the Chrome history toggle follows:
// this is the one control here that summons a browser dialog, and a control that
// does that without warning is a control people learn not to touch. Once granted
// it disappears, having said what it needed to.
const PageContentsScopeControls = ({
  scope, onScopeChange,
  deep, onDeepChange,
  labels, granted, denied,
  scanning, onStart, onCancel,
}) => (
  <div className="PageContentsScopeControls">
    <select
      className="PageContentsScopeControls-scope"
      value={scope}
      onChange={(e) => onScopeChange(e.target.value)}
      disabled={scanning}
      aria-label="Pages to search"
    >
      {scanScopeOptions(labels).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>

    <button
      type="button"
      className="PageContentsScopeControls-button"
      onClick={scanning ? onCancel : onStart}
    >
      {scanning ? 'Cancel' : 'Search page contents'}
    </button>

    <label className="PageContentsScopeControls-deep">
      <input
        type="checkbox"
        checked={deep}
        onChange={(e) => onDeepChange(e.target.checked)}
        disabled={scanning}
      />
      <span>Deep scan (loads pages)</span>
    </label>

    {!granted && !denied && (
      <span className="PageContentsScopeControls-note">
        asks permission to read the sites you visit
      </span>
    )}
  </div>
);

PageContentsScopeControls.propTypes = {
  scope: PropTypes.string.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  deep: PropTypes.bool,
  onDeepChange: PropTypes.func.isRequired,
  labels: PropTypes.object,
  granted: PropTypes.bool,
  denied: PropTypes.bool,
  scanning: PropTypes.bool,
  onStart: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default PageContentsScopeControls;
