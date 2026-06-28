import './LabelSectionHeader.css';

import React from 'react';

// A small uppercase section header used inside a group card to demarcate a
// subset of Url rows (e.g. the currently-open tabs). Renders a lime "live"
// status dot, the section `label`, and a compact `count` pushed to the right.
// Purely presentational — the parent decides when to render it.
const LabelSectionHeader = ({ label, count }) => {
  return (
    <div className="LabelSectionHeader">
      <span className="LabelSectionHeader-dot" />
      <span className="LabelSectionHeader-label">{label}</span>
      <span className="LabelSectionHeader-count">{count}</span>
    </div>
  );
};

export default LabelSectionHeader;
