import './FullSearchSection.css';

import React from 'react';
import PropTypes from 'prop-types';

import { GroupSwatch } from '../GroupSwatch';

// One source-section of the Full Search page: a tinted title band naming the
// source, its count, and the rows beneath.
//
// The band's colour comes from a `FullSearch-section-<key>` class the page sets,
// so the accent is data-driven rather than a prop threaded through every call —
// and the same key that picks the colour is the one that picked the section, so
// the two cannot disagree.
//
// The `groups` prop is what makes "In my groups" different from every other
// section: its rows are sub-divided, one header per group. Its ABSENCE (rather
// than an empty array) is the branch, which is the contract
// `buildFullSearchSections` deliberately holds up.
const FullSearchSection = ({ sectionKey, title, count, groups, rows, renderRow }) => (
  <div className={`FullSearch-section FullSearch-section-${sectionKey}`}>
    <div className="FullSearch-section-title">
      {title}
      <span className="FullSearch-section-count">{count}</span>
    </div>

    {groups
      ? groups.map((group) => (
          <div className="FullSearch-group" key={`group-${group.title}`}>
            <div className="FullSearch-group-header">
              <GroupSwatch color={group.color} />
              <div className="FullSearch-group-title">{group.title}</div>
            </div>
            {group.urls.map(renderRow)}
          </div>
        ))
      : rows.map(renderRow)}
  </div>
);

FullSearchSection.propTypes = {
  sectionKey: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  count: PropTypes.number,
  groups: PropTypes.array,
  rows: PropTypes.array,
  renderRow: PropTypes.func.isRequired,
};

export default FullSearchSection;
