import './Search.css';

import React, { useState, useEffect } from 'react';

import { SearchResults } from '..'
import { Icon } from '../Icon'

import { KeyDown } from '../../utils';
import segmentSearchResults from '../../utils/segmentSearchResults';
import { useSearchIndex } from '../../hooks/useSearchIndex';

const Search = () => {
  // The index itself — construction, rebuilds, and the race guard — belongs to
  // `useSearchIndex`, which the Full Search page shares. This component is the
  // overlay: the input, the Escape/focus keyboard behavior, and the capped
  // quick-jump list.
  const { search: searchIndex } = useSearchIndex();
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState(null);

  const search = (query) => {
    setSearchText(query);
    setResults(segmentSearchResults(searchIndex(query)));
  }

  const close = () => {
    setResults(null);
    setSearchText("");
    document.getElementById('Search-Input').blur();
  }

  useEffect(() => {
    // Under StrictMode + `createRoot`, effects are double-invoked in dev, so we
    // name the handler and remove it on cleanup.
    const handleKeyDown = (e) => {
      const input = document.getElementById('Search-Input');

      if (e.metaKey && e.key === 'f') {
        e.stopPropagation();
        e.preventDefault();
        input.focus();
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === " " && input.value.length === 0) return;
      if (e.key ==='Escape') {
        e.stopPropagation();
        close();
      } else {
        input.focus();
      }
    };
    KeyDown.add(handleKeyDown);

    return () => KeyDown.remove(handleKeyDown);
  }, []);

  // The overlay opens on any query text, not just a query with hits: "Open Full
  // Search" is pinned at the top of the list and is the thing Enter activates,
  // so a zero-hit query still needs somewhere to go. "No Results" now renders
  // underneath that row rather than instead of the whole overlay.
  const segmented = results || { labels: [], urls: [], archived: [] };

  return (
    <div className='Search'>
      <div className='Search-inputWrap'>
        <Icon name="search" size={16} className='Search-icon' />
        <input
          id="Search-Input"
          type="text"
          value={searchText}
          placeholder="Find Anything"
          onChange={(e) => search(e.target.value)}
        />
      </div>
      {(searchText && searchText.length > 0) &&
        <div>
          <SearchResults
            query={searchText}
            labels={segmented.labels}
            urls={segmented.urls.slice(0,10)}
            archived={segmented.archived.slice(0,10)}
          />
          <div id="BackgroundOverlay" onClick={close}></div>
        </div>
      }
    </div>
  )
}

Search.propTypes = {
}

export default Search;
