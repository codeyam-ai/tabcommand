import './PageContentsDenied.css';

import React from 'react';
import PropTypes from 'prop-types';

// What the panel says when the user declines the permission prompt.
//
// It states what STILL works rather than what they withheld. Declining to let an
// extension read every page you visit is a reasonable choice, and the page keeps
// doing everything it did before — titles, groups, notes and history are all
// still searched. A message that framed the refusal as a problem would be
// arguing with a decision that was the user's to make.
//
// The retry is here because the browser only re-shows a permission prompt on a
// fresh user gesture: without a button there is no way back short of reloading,
// and someone who dismissed the dialog by accident would have no route to the
// feature at all.
const PageContentsDenied = ({ onRetry }) => (
  <div className="PageContentsDenied">
    Without permission to read the sites you visit, TabCommand can search page
    titles and your notes but not the text inside a page.
    <button type="button" className="PageContentsDenied-retry" onClick={onRetry}>
      Ask again
    </button>
  </div>
);

PageContentsDenied.propTypes = {
  onRetry: PropTypes.func.isRequired,
};

export default PageContentsDenied;
