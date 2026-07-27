import './PageHeader.css';

import React from 'react';
import { Icon } from '../Icon';

// The shared chrome at the top of a full-page view: a back link, the page
// title, and a one-line intro. History and ViewAllFavorites both rendered this
// trio inline off the same `Page-*` classes, so it lives here once. `intro`
// takes a node, not just a string, since some pages wrap it across lines.
// `backLabel` names the destination the back link returns to.
// The wrapper is a real block element, not a fragment: the three children stack
// only because a block parent makes them, and a fragment would inherit whatever
// layout the host imposes — which lays them out in an overlapping row when the
// component is mounted on its own in isolation.
const PageHeader = ({ title, intro, onBack, backLabel = 'Home' }) => (
  <header className="PageHeader">
    <button className="Page-back" onClick={onBack}>
      <Icon name="arrowLeft" size={15} /> {backLabel}
    </button>
    <h1 className="Page-h1">{title}</h1>
    {intro && <p className="Page-intro">{intro}</p>}
  </header>
);

export default PageHeader;
