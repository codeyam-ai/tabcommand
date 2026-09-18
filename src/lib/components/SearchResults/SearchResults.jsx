import './SearchResults.css';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { KeyDown, event } from '../../utils';

import { Pages } from '../../../Constants';
import { Icon } from '../Icon';
import { Favicon } from '../Favicon';
import { GroupSwatch } from '../GroupSwatch';
import { NotesSnippet } from '../NotesSnippet';
import { OpenFullSearchRow } from '../OpenFullSearchRow';
import { Chrome } from '../../utils/Chrome';
import openUrlKey from '../../utils/openUrlKey';
import groupSearchUrlsByLabel from '../../utils/groupSearchUrlsByLabel';

const SearchResults = ({ query, labels, urls, archived }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Grouped URL hits, split into one sub-section per group. `flatUrls` recovers
  // the render order (group by group), so keyboard/click activation indices
  // still line up with what's on screen regardless of the input's order.
  const urlGroups = groupSearchUrlsByLabel(urls);
  const flatUrls = urlGroups.flatMap((group) => group.urls);

  // "Open Full Search" is pinned at flat index 0 whenever there is query text,
  // which shifts every other index by one. It is absent (and the indices are
  // unshifted) when the component is rendered without a query — the isolated
  // scenarios do exactly that, and they should keep showing the plain list.
  const hasFullSearch = !!query;
  const offset = hasFullSearch ? 1 : 0;

  const openFullSearch = () => {
    KeyDown.trigger(event({ key: "Escape" }));
    Chrome.get('SearchResults4', 'uxSettings', ({ uxSettings }) => {
      const next = uxSettings || {};
      next.page = { name: Pages.SEARCH, query };
      Chrome.set('SearchResults3', { uxSettings: next });
    });
  };

  const handleClick = (e, index) => {
    if (hasFullSearch && index === 0) {
      openFullSearch();
      return;
    }

    KeyDown.trigger(event({ key: "Escape" }));
    // The flat activation order matches the render order below:
    // Groups, then Grouped URLs (group by group), then Archived URLs.
    const selectedItem = [...labels, ...flatUrls, ...(archived || [])][index - offset];
    if (!selectedItem) return;
    if (selectedItem.labelTitle) {
      // Navigation lives entirely on `uxSettings`: select the label by title
      // (a string, matching LabelCollection) and route Home via
      // `uxSettings.page`.
      Chrome.get('SearchResults1', 'uxSettings', ({ uxSettings }) => {
        uxSettings.selectedLabel = selectedItem.labelTitle;
        uxSettings.page = { name: Pages.HOME };
        Chrome.set('SearchResults1', { uxSettings: uxSettings });
      });
    } else {
      // Open-or-focus is `openUrlKey`, shared with the Full Search page so the
      // two surfaces cannot drift on what clicking a result does.
      openUrlKey(selectedItem.id, selectedItem.url, { newTab: !!e.metaKey });
    }
  }

  useEffect(() => {
    setSelectedIndex(0);
    const totalItems = offset + (labels || []).length + flatUrls.length + (archived || []).length;
    let _selectedIndex = selectedIndex;

    const handleKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === "ArrowDown") {
        _selectedIndex = Math.min(totalItems - 1, _selectedIndex + 1);
        setSelectedIndex(_selectedIndex);
      } else if (e.key === "ArrowUp") {
        _selectedIndex = Math.max(0, _selectedIndex - 1);
        setSelectedIndex(_selectedIndex);
      } else if (e.key === "Enter") {
        handleClick(e, _selectedIndex);
      }
    }

    KeyDown.add(handleKeyDown);

    return () => KeyDown.remove(handleKeyDown);
  }, [query, labels, urls, archived]);

  const labelResult = (i, label) => {
    return (
      <div
        key={`searchResult-${label.id}`}
        className={`SearchResults-result SearchResults-result-label ${i === selectedIndex && 'SearchResults-result-selected'}`}
        onMouseEnter={() => setSelectedIndex(i)}
        onClick={(e) => handleClick(e, i)}
      >
        <GroupSwatch
          key={`searchResult-${label.id}-icon`}
          color={label.color}
          size={14}
          className='SearchResults-labelIcon'
        />
        <div key={`searchResult-${label.id}-title`} className='SearchResults-result-title'>
          {label.labelTitle}
        </div>
      </div>
    );
  }

  const urlResult = (i, url) => {
    const editUrl = (e) => {
      KeyDown.trigger(event({ key: "Escape" }));
      e.preventDefault();
      e.stopPropagation();
      Chrome.get('SearchResults3', 'uxSettings', (result) => {
        const uxSettings = result.uxSettings || {};
        uxSettings.page = { name: Pages.URL, urlKey: url.id };
        Chrome.set('SearchResults2', { uxSettings: uxSettings });
      })
    };

    return (
      <div
        key={`searchResult-${url.id}`}
        className={`SearchResults-result SearchResults-result-url ${i === selectedIndex && 'SearchResults-result-selected'}`}
        onMouseEnter={() => setSelectedIndex(i)}
        onClick={(e) => handleClick(e, i)}
      >
        <div className='SearchResults-result-url-edit' onClick={editUrl}>
          <Icon name="edit" size={15} />
        </div>
        <Favicon favicon={url.favicon} urlKey={url.id} title={url.urlTitle} />
        <div key={`searchResult-${url.id}-title`} className='SearchResults-result-title'>
          {url.urlTitle}
        </div>
        <NotesSnippet hit={url} className='SearchResults-result-notes' />
      </div>
    )
  }

  let index = offset - 1;
  return (
    <div id='SearchResults' className='SearchResults'>
      {hasFullSearch &&
        <OpenFullSearchRow
          query={query}
          selected={selectedIndex === 0}
          onSelect={() => setSelectedIndex(0)}
          onActivate={(e) => handleClick(e, 0)}
        />
      }
      {(!labels || !labels.length) && (!urls || !urls.length) && (!archived || !archived.length) &&
        <div className='SearchResults-section'>
          <div className='SearchResults-section-title'>No Results</div>
        </div>
      }
      {labels && labels.length > 0 &&
        <div className='SearchResults-section'>
          <div className='SearchResults-section-title'>Groups</div>
          {labels.map((label) => {
            index += 1;
            return labelResult(index, label);
          })}
        </div>
      }
      {urls && urls.length > 0 &&
        <div className='SearchResults-section'>
          <div className='SearchResults-section-title'>Grouped URLs</div>
          {urlGroups.map((group) => {
            if (!group.urls.length) return null;
            return (
              <div className='SearchResults-group' key={`searchGroup-${group.title}`}>
                <div className='SearchResults-group-header'>
                  <div
                    className='SearchResults-labelIcon'
                    style={{ backgroundColor: group.color }}
                  ></div>
                  <div className='SearchResults-group-title'>{group.title}</div>
                </div>
                {group.urls.map((url) => {
                  index += 1;
                  return urlResult(index, url);
                })}
              </div>
            );
          })}
        </div>
      }
      {archived && archived.length > 0 &&
        <div className='SearchResults-section'>
          <div className='SearchResults-section-title'>Archived URLs</div>
          {archived.map((url) => {
            index += 1;
            return urlResult(index, url);
          })}
        </div>
      }
    </div>
  )
}

SearchResults.propTypes = {
  query: PropTypes.string,
  labels: PropTypes.array,
  urls: PropTypes.array,
  archived: PropTypes.array
}

export default SearchResults;
