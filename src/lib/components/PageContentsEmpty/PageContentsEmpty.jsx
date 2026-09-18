import './PageContentsEmpty.css';

import React from 'react';

// What the Page contents section says when a scan finished and matched nothing.
//
// The section renders this rather than disappearing, because "no section" and
// "a section that found nothing" answer different questions and only the second
// one means the search was actually done. A user who scanned sixty pages and got
// an empty screen cannot tell whether it ran at all.
//
// The second sentence names the most likely reason, which is the one the user
// has no way to guess: a page read without loading it sees only what the site
// sends before its own scripts run, so a signed-in app can hold the phrase and
// still not match. It points at the Deep scan checkbox without naming it as an
// instruction.
const PageContentsEmpty = () => (
  <div className="PageContentsEmpty">
    No page contained this text. Pages read without loading them see only what
    the site sends before its scripts run.
  </div>
);

export default PageContentsEmpty;
