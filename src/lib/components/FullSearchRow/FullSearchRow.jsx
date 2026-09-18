import './FullSearchRow.css';

import React from 'react';
import PropTypes from 'prop-types';

import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import { GroupSwatch } from '../GroupSwatch';
import { NotesSnippet } from '../NotesSnippet';
import searchHitHref, { isChromeHistoryHit } from '../../utils/searchHitHref';
import hostLabel from '../../utils/hostLabel';

// One URL result on the Full Search page: favicon, title, host, the group it
// belongs to, whether it is open right now, an edit affordance, and the notes
// excerpt when the match landed there.
//
// Everything conditional about the row is a statement about the hit, not a
// prop the caller has to get right:
//   - the group swatch appears only for a hit that belongs to a group;
//   - the OPEN badge only when the url is among the active tabs;
//   - the edit pencil is withheld from a Chrome-history hit, which is not a
//     tracked record and so has no URL detail page to open — the pencil would
//     route to a blank screen;
//   - the notes line renders itself, or nothing (see NotesSnippet).
const FullSearchRow = ({ hit, index, selected, isOpen, onSelect, onActivate, onEdit }) => {
  const host = hostLabel(searchHitHref(hit));

  const editUrl = (e) => {
    // The pencil sits inside a row that is itself clickable, so its click must
    // not also open the tab underneath it.
    e.preventDefault();
    e.stopPropagation();
    onEdit(hit);
  };

  return (
    <div
      className={`FullSearch-row FullSearch-row-url ${selected ? 'FullSearch-row-selected' : ''}`}
      onMouseEnter={() => onSelect(index)}
      onClick={(e) => onActivate(hit, e.metaKey)}
    >
      <Favicon favicon={hit.favicon} urlKey={hit.id} title={hit.urlTitle} />
      <div className='FullSearch-row-main'>
        <div className='FullSearch-row-title'>{hit.urlTitle}</div>
        {host && <div className='FullSearch-row-host'>{host}</div>}
      </div>
      {hit.urlLabelColor && (
        <GroupSwatch
          color={hit.urlLabelColor}
          size={9}
          title={hit.urlLabelTitle}
          className='FullSearch-swatch-trailing'
        />
      )}
      {isOpen && <div className='FullSearch-badge'>Open</div>}
      {!isChromeHistoryHit(hit.id) && (
        <div className='FullSearch-row-edit' onClick={editUrl}>
          <Icon name="edit" size={15} />
        </div>
      )}
      <NotesSnippet hit={hit} className='FullSearch-row-notes' />
    </div>
  );
};

FullSearchRow.propTypes = {
  hit: PropTypes.object.isRequired,
  index: PropTypes.number,
  selected: PropTypes.bool,
  isOpen: PropTypes.bool,
  onSelect: PropTypes.func,
  onActivate: PropTypes.func,
  onEdit: PropTypes.func,
};

export default FullSearchRow;
