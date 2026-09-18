import './PageContentsRow.css';

import React from 'react';
import PropTypes from 'prop-types';

import { Favicon } from '../Favicon';
import { PageContentsTierBadge } from '../PageContentsTierBadge';
import { PageContentsSnippet } from '../PageContentsSnippet';
import hostLabel from '../../utils/hostLabel';

// One page whose text contained the query: which site it came from, how its text
// was read, and the passage that matched.
//
// The row reuses the page's shared `.FullSearch-row` shell so a content hit sits
// in the same rhythm as every other result, and composes the two pieces that are
// unique to it — the tier badge and the excerpt. Both decide their own contents
// (and, for the snippet, whether to render at all), so this component is just
// the arrangement.
const PageContentsRow = ({ result, onActivate }) => {
  const host = hostLabel(result.url);

  return (
    <div
      className="FullSearch-row PageContentsRow"
      onClick={(e) => onActivate(result, e.metaKey)}
    >
      <Favicon favicon={result.favicon} urlKey={result.urlKey} title={result.title} />
      <div className="FullSearch-row-main">
        <div className="FullSearch-row-title">{result.title}</div>
        {host && <div className="FullSearch-row-host">{host}</div>}
      </div>
      <PageContentsTierBadge tier={result.tier} />
      <PageContentsSnippet snippet={result.snippet} />
    </div>
  );
};

PageContentsRow.propTypes = {
  result: PropTypes.object.isRequired,
  onActivate: PropTypes.func.isRequired,
};

export default PageContentsRow;
