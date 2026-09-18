import React from 'react';
import PropTypes from 'prop-types';

import { FullSearchSection } from '../FullSearchSection';

// The two-column result area: every visible section, in order, flowed into
// columns.
//
// It owns the columns wrapper rather than the page, so the layout decision and
// the `break-inside` rule that makes it work stay with the thing they describe.
// Reading order is DOM order, which is also `flatRows` order — the keyboard
// walks the columns the way the eye does.
const FullSearchResults = ({ sections, renderRow }) => (
  <div className="FullSearch-columns">
    {sections.map((section) => (
      <FullSearchSection
        key={`section-${section.key}`}
        sectionKey={section.key}
        title={section.title}
        count={section.rows.length}
        groups={section.groups}
        rows={section.rows}
        renderRow={renderRow}
      />
    ))}
  </div>
);

FullSearchResults.propTypes = {
  sections: PropTypes.array.isRequired,
  renderRow: PropTypes.func.isRequired,
};

export default FullSearchResults;
