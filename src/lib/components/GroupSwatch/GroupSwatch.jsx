import './GroupSwatch.css';

import React from 'react';
import PropTypes from 'prop-types';

// The coloured dot that stands for a group.
//
// It appears in five places across the two search surfaces — leading a group
// result row, heading a grouped sub-section, and trailing a Full Search row to
// say which group the URL belongs to — and it was three different class names
// for the same 12px circle. `size` covers the one real variation: the trailing
// marker is smaller than the leading one so it reads as an annotation rather
// than as the row's icon.
//
// `title` becomes the hover tooltip, which is how a trailing swatch names its
// group without spending a line of width on it.
const GroupSwatch = ({ color, size = 12, title, className = '' }) => (
  <div
    className={`GroupSwatch ${className}`}
    style={{ backgroundColor: color, height: size, width: size }}
    title={title}
  ></div>
);

GroupSwatch.propTypes = {
  color: PropTypes.string,
  size: PropTypes.number,
  title: PropTypes.string,
  className: PropTypes.string,
};

export default GroupSwatch;
