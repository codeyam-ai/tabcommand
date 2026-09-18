import './PageContentsSnippet.css';

import React from 'react';
import PropTypes from 'prop-types';

// The excerpt of page text that contained the query, with the matched phrase
// called out.
//
// This is the sibling of `NotesSnippet`, and the difference between them is the
// reason it is a separate component rather than a prop on that one. A notes
// snippet quotes something the user WROTE and has already seen, so a fragment on
// one line is enough to jog the memory. This one quotes prose the user only
// read, often months ago, so it is the only evidence that this page is the one
// they are thinking of — which is why it gets a sentence and two lines instead.
//
// Renders null when the scan produced no snippet, so a caller can hand it a
// result unconditionally.
const PageContentsSnippet = ({ snippet }) => {
  if (!snippet) return null;

  return (
    <div className="PageContentsSnippet">
      {snippet.before}<span>{snippet.match}</span>{snippet.after}
    </div>
  );
};

PageContentsSnippet.propTypes = {
  snippet: PropTypes.object,
};

export default PageContentsSnippet;
