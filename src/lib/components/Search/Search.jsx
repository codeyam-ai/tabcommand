import './Search.css';

import React, { useState, useEffect } from 'react';

import MiniSearch from 'minisearch'

import { SearchResults } from '..'
import { Icon } from '../Icon'

import { KeyDown } from '../../utils';
import { Chrome } from '../../utils/Chrome';
import segmentSearchResults from '../../utils/segmentSearchResults';
import { buildSearchDocuments, buildUrlDocuments } from '../../utils/buildSearchDocuments';

const Search = () => {
  const [miniSearch] = useState(
    new MiniSearch({
      fields: ['labelTitle', 'urlTitle', 'url', 'notes'],
      storeFields: ['labelTitle', 'urlTitle', 'url', 'urlLabelTitle', 'color', 'favicon', 'notes'],
      searchOptions: {
        boost: { labelTitle: 100, urlTitle: 50, notes: 5 }
      }
    })
  );
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState(null);

  const search = (query) => {
    setSearchText(query);
    const searchResults = miniSearch.search(query, {prefix: true});
    setResults(segmentSearchResults(searchResults));
  }

  const close = () => {
    setResults(null);
    setSearchText("");
    document.getElementById('Search-Input').blur();
  }

  useEffect(() => {
    let labelMap = {};
    if (miniSearch === null) return;

    // Under StrictMode + `createRoot`, effects are double-invoked in dev, so we
    // name the handlers and remove them on cleanup — otherwise the duplicate
    // `onChanged` listener races two index builds and emits duplicate result
    // keys. Matches how App/Labels/SearchResults already manage their listeners.
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

    // Rebuilds can overlap (StrictMode double-effect's two mount reads, plus the
    // seed-time `onChanged`). `addAllAsync` resolving after a newer rebuild's
    // `removeAll` would re-add already-cleared ids and corrupt minisearch's
    // id map (the same url indexed twice → duplicate React keys). A monotonic
    // token lets only the latest rebuild commit its async url batch.
    let buildToken = 0;
    const addDocuments = (labels, allUrls) => {
      const myToken = ++buildToken;
      miniSearch.removeAll();

      const built = buildSearchDocuments(labels);
      labelMap = built.labelMap;
      miniSearch.addAll(built.labelDocuments);

      // Index the WHOLE archive, not just labeled URLs: the deduped union of
      // `allUrls` (the authoritative full set History reads) and the labeled
      // keys. Archived URLs come through with no `urlLabelTitle`.
      const urlKeys = Array.from(
        new Set([...(allUrls || []), ...Object.keys(labelMap)])
      );
      if (urlKeys.length > 0) {
        Chrome.get('Search1', urlKeys, (result) => {
          if (myToken !== buildToken) return;
          const documents = buildUrlDocuments(urlKeys, labelMap, result);

          miniSearch.addAllAsync(documents).then(
            () => console.log("Search Indexing Complete For URLs")
          ).catch(e => console.log("Search Error", e));
        })
      }
    }

    Chrome.get('Search2', ['labels', 'allUrls'], ({ labels, allUrls }) => {
      addDocuments(labels, allUrls);
    });

    // Re-read both `labels` and `allUrls` for a full rebuild — mirrors how
    // History.jsx re-reads the archive on change so newly visited/closed URLs
    // become searchable live.
    const rebuildFromStorage = () => {
      Chrome.get('Search3', ['labels', 'allUrls'], ({ labels, allUrls }) => {
        addDocuments(labels || {}, allUrls || []);
      });
    };

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      // A label change OR a grow/shrink of the archive re-indexes everything.
      if (changes.labels || changes.allUrls) {
        rebuildFromStorage();
        return;
      }

      // A notes edit on any already-indexed URL (labeled or archived) re-indexes
      // so its updated notes are searchable.
      for (const changedKey of Object.keys(changes)) {
        if (!changedKey.startsWith('url-')) continue;
        const { newValue, oldValue } = changes[changedKey];
        if (newValue && oldValue && newValue.notes !== oldValue.notes) {
          rebuildFromStorage();
          return;
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      KeyDown.remove(handleKeyDown);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

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
      {(searchText && searchText.length > 0 && results) &&
        <div>
          <SearchResults
            labels={results.labels}
            urls={results.urls.slice(0,10)}
            archived={results.archived.slice(0,10)}
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
