import './PageContentsPanel.css';

import React from 'react';
import PropTypes from 'prop-types';

import { PageContentsScopeControls } from '../PageContentsScopeControls';
import { PageContentsDenied } from '../PageContentsDenied';
import { PageContentsProgress } from '../PageContentsProgress';

// The Page contents scan control surface: what to scan, whether to start it, and
// how far through it is.
//
// The panel composes three pieces that each appear under a different condition —
// the controls always, the refusal only after one, the progress only once a scan
// has begun — so the panel's whole job is owning those three conditions in one
// place. Each piece decides nothing about when it is shown, which is what keeps
// "denied" and "scanning" from ever rendering as if they were both true.
const PageContentsPanel = ({
  scope, onScopeChange,
  deep, onDeepChange,
  labels = {},
  granted, denied,
  scanning, progress,
  onStart, onCancel,
}) => (
  <div className="PageContentsPanel">
    <PageContentsScopeControls
      scope={scope}
      onScopeChange={onScopeChange}
      deep={deep}
      onDeepChange={onDeepChange}
      labels={labels}
      granted={granted}
      denied={denied}
      scanning={scanning}
      onStart={onStart}
      onCancel={onCancel}
    />

    {denied && <PageContentsDenied onRetry={onStart} />}

    {progress && (
      <PageContentsProgress
        scanned={progress.scanned}
        total={progress.total}
        scanning={scanning}
      />
    )}
  </div>
);

PageContentsPanel.propTypes = {
  scope: PropTypes.string.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  deep: PropTypes.bool,
  onDeepChange: PropTypes.func.isRequired,
  labels: PropTypes.object,
  granted: PropTypes.bool,
  denied: PropTypes.bool,
  scanning: PropTypes.bool,
  progress: PropTypes.object,
  onStart: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default PageContentsPanel;
