import './PageContentsSection.css';

import React from 'react';
import PropTypes from 'prop-types';

import { PageContentsRow } from '../PageContentsRow';
import { PageContentsEmpty } from '../PageContentsEmpty';

// The "Page contents" section: the hits a scan produced, under the same tinted
// band every other source-section on the page uses.
//
// It renders in three states and the difference between the last two matters.
// Before a scan has run there is no section at all — an empty band would claim a
// source the user has not opted into. DURING a scan it renders as soon as the
// first hit lands rather than waiting for the scan to finish, because a scan of
// sixty pages is slow enough that batching the results would leave the page
// looking broken while it worked. AFTER a scan that found nothing it says so
// explicitly, because "no section" and "a section that found nothing" answer
// different questions and only one of them means the search was done.
const PageContentsSection = ({ results = [], scanned, onActivate }) => {
  if (!scanned && !results.length) return null;

  return (
    <div className="FullSearch-section FullSearch-section-pageContents">
      <div className="FullSearch-section-title">
        Page contents
        <span className="FullSearch-section-count">{results.length}</span>
      </div>

      {results.length
        ? results.map((result) => (
            <PageContentsRow
              key={`pageContents-${result.urlKey}`}
              result={result}
              onActivate={onActivate}
            />
          ))
        : <PageContentsEmpty />}
    </div>
  );
};

PageContentsSection.propTypes = {
  results: PropTypes.array,
  scanned: PropTypes.bool,
  onActivate: PropTypes.func.isRequired,
};

export default PageContentsSection;
