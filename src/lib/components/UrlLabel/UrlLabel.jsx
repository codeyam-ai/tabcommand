import './UrlLabel.css';

import React from 'react';
import { Icon } from '../Icon';

// One removable "Groups" chip in the UrlDetails form: a group-color dot, the
// label's title, and a remove (×) glyph. Clicking it asks the page to remove
// this URL from that group (the page wraps the removal in a confirm). `title`
// is also passed as the button's value so the page handler can read which
// group was clicked; inner elements are pointer-transparent (see CSS) so the
// click target is always the button itself. `color` tints the dot.
const UrlLabel = ({ title, color, onRemove }) => {
  return (
    <button
      type="button"
      className="UrlLabel"
      value={title}
      onClick={onRemove}
    >
      <span className="UrlLabel-dot" style={{ background: color || 'var(--c-t5)' }} />
      <span className="UrlLabel-name">{title}</span>
      <Icon name="close" size={12} className="UrlLabel-remove" />
    </button>
  );
};

export default UrlLabel;
