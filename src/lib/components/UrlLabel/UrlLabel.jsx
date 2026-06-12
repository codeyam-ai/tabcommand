import './UrlLabel.css';

import React from 'react';
import { CloseCircleOutlined } from '@ant-design/icons';

// One removable "Groups" chip in the UrlDetails form: the close icon plus the
// label's title. Clicking it asks the page to remove this URL from that group
// (the page wraps the removal in a confirm). `title` is also passed as the
// button's value so the page handler can read which group was clicked.
const UrlLabel = ({ title, onRemove }) => {
  return (
    <button
      className="UrlDetails-label"
      value={title}
      onClick={onRemove}
    >
      <CloseCircleOutlined />
      {title}
    </button>
  );
};

export default UrlLabel;
