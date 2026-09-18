import './PageContentsSlot.css';

import React from 'react';

// The visible slot where searching inside page text will land.
//
// It is deliberately NOT omitted until the feature exists. This page claims to
// show "every match", and a user who searches a phrase they remember reading —
// rather than a title they remember seeing — will find nothing and reasonably
// conclude the search is broken. Naming the gap is more honest than a page that
// silently searches less than it appears to, and it names the cost too: reading
// page text needs permission to read the sites you visit, which is why it is not
// simply switched on.
const PageContentsSlot = () => (
  <div className="FullSearch-section FullSearch-section-pending">
    <div className="FullSearch-section-title">Page contents</div>
    <div className="FullSearch-pending">
      Searching the text inside your pages is coming — it needs permission to read the sites you visit.
    </div>
  </div>
);

export default PageContentsSlot;
