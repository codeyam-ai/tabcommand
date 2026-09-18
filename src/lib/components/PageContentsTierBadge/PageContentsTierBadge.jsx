import './PageContentsTierBadge.css';

import React from 'react';
import PropTypes from 'prop-types';

import { TIER_LIVE, TIER_FETCHED, TIER_DEEP } from '../../utils/pageContentScan';

// What each tier means, in the user's terms rather than the implementation's.
// The table lives with the badge because it IS the badge — the label and the
// hover explanation are the only places these three words are ever spelled out.
const TIERS = {
  [TIER_LIVE]: { label: 'Live', title: 'Read from the open tab, as you see it now' },
  [TIER_FETCHED]: { label: 'Fetched', title: 'Read from the page source, without running its scripts' },
  [TIER_DEEP]: { label: 'Deep', title: 'Read by loading the page in a background tab' },
};

// Which of the three readings of "the page" produced this result.
//
// It is not decoration. The same URL yields genuinely different text depending
// on how it was read, and the difference is the honest answer to "why did this
// page not match?" — a FETCHED miss on a signed-in app means the text was never
// there to search, which is a very different statement from LIVE finding
// nothing. Without the badge a thin result is mysterious; with it, it is
// explained.
//
// Falls back to the fetched copy for an unrecognised tier rather than rendering
// an empty pill: a row with a blank badge would read as a rendering fault.
const PageContentsTierBadge = ({ tier }) => {
  const { label, title } = TIERS[tier] || TIERS[TIER_FETCHED];

  return (
    <div className={`PageContentsTierBadge PageContentsTierBadge-${tier}`} title={title}>
      {label}
    </div>
  );
};

PageContentsTierBadge.propTypes = {
  tier: PropTypes.string,
};

export default PageContentsTierBadge;
