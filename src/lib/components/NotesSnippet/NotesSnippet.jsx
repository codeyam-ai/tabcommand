import './NotesSnippet.css';

import React from 'react';
import PropTypes from 'prop-types';

import searchNotesSnippet from '../../utils/searchNotesSnippet';

// The one-line notes excerpt under a search result whose match landed in its
// notes, with the matched term called out.
//
// Both search surfaces render this: the sidebar overlay and the Full Search
// page. Each carried its own copy of the windowing check plus the
// `{before}<span>{match}</span>{after}` markup, which is how the two drifted
// into different class names for the same element. The component owns the whole
// decision — including whether there is anything to show at all — so a caller
// renders `<NotesSnippet hit={hit} />` and gets nothing when the match was in
// the title instead.
//
// It renders null (not an empty element) in three cases: the hit did not match
// in `notes`, minisearch supplied no terms, or the term is not actually present
// in the stored notes. `searchNotesSnippet` owns that last judgement.
const NotesSnippet = ({ hit, className = '' }) => {
  if (!hit || !hit.match || !hit.terms || !hit.terms.length) return null;

  const matchAreas = Object.values(hit.match).flat();
  if (matchAreas.indexOf('notes') === -1) return null;

  const snippet = searchNotesSnippet(hit.notes, hit.terms[0]);
  if (!snippet) return null;

  return (
    <div className={`NotesSnippet ${className}`}>
      {snippet.before}<span>{snippet.match}</span>{snippet.after}
    </div>
  );
};

NotesSnippet.propTypes = {
  hit: PropTypes.object,
  className: PropTypes.string,
};

export default NotesSnippet;
