import './PageContentsProgress.css';

import React from 'react';
import PropTypes from 'prop-types';

import scanProgressPercent from '../../utils/scanProgressPercent';

// How far through a scan is: a bar and a literal count.
//
// Both are here on purpose, because they answer different questions at
// different moments. DURING the scan the bar answers "how much longer", which a
// pair of numbers makes you do arithmetic for. AFTER it, the count answers
// "did it actually look at everything" — which is the question a scan that
// found nothing immediately raises, and the one a full bar cannot answer.
//
// The verb changes with the state for the same reason: "Scanned 23 / 60" while
// it runs reads as a progress report, but left on screen after the run it reads
// as though it stopped early. "Finished 60 / 60" says the run completed.
const PageContentsProgress = ({ scanned, total, scanning }) => (
  <div className="PageContentsProgress">
    <div className="PageContentsProgress-bar">
      <div
        className="PageContentsProgress-fill"
        style={{ width: `${scanProgressPercent(scanned, total)}%` }}
      />
    </div>
    <span className="PageContentsProgress-count">
      {scanning ? 'Scanned' : 'Finished'} {scanned} / {total}
    </span>
  </div>
);

PageContentsProgress.propTypes = {
  scanned: PropTypes.number,
  total: PropTypes.number,
  scanning: PropTypes.bool,
};

export default PageContentsProgress;
