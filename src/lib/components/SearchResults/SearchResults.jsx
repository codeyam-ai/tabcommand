import './SearchResults.css';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { KeyDown, event } from '../../utils';

import { Pages } from '../../../Constants';
import { Icon } from '../Icon';
import { Favicon } from '../Favicon';
import { Chrome } from '../../utils/Chrome';
import searchNotesSnippet from '../../utils/searchNotesSnippet';
import groupSearchUrlsByLabel from '../../utils/groupSearchUrlsByLabel';

const SearchResults = ({ labels, urls, archived }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Grouped URL hits, split into one sub-section per group. `flatUrls` recovers
  // the render order (group by group), so keyboard/click activation indices
  // still line up with what's on screen regardless of the input's order.
  const urlGroups = groupSearchUrlsByLabel(urls);
  const flatUrls = urlGroups.flatMap((group) => group.urls);

  const handleClick = (e, index) => {
    KeyDown.trigger(event({ key: "Escape" }));
    // The flat activation order matches the render order below:
    // Groups, then Grouped URLs (group by group), then Archived URLs.
    const selectedItem = [...labels, ...flatUrls, ...(archived || [])][index];
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
      Chrome.get('SearchResults2', 'activeTabs', (result) => {
        const activeTab = (result.activeTabs || []).filter(
          (activeTab) => activeTab.urlKey === selectedItem.id
        )[0];
        if (activeTab && !e.metaKey) {
          const tabId = parseInt(activeTab.tabKey.split('-')[1]);
          chrome.tabs.update(tabId, { active: true }, () => { });
        } else if (!activeTab) {
          chrome.tabs.create({
            url: selectedItem.url,
            active: !e.metaKey
          }, () => { });
        }
      })
    }
  }

  useEffect(() => {
    setSelectedIndex(0);
    const totalItems = (labels || []).length + flatUrls.length + (archived || []).length;
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
  }, [labels, urls, archived]);

  const labelResult = (i, label) => {
    return (
      <div
        key={`searchResult-${label.id}`}
        className={`SearchResults-result SearchResults-result-label ${i === selectedIndex && 'SearchResults-result-selected'}`}
        onMouseEnter={() => setSelectedIndex(i)}
        onClick={(e) => handleClick(e, i)}
      >
        <div
          key={`searchResult-${label.id}-icon`}
          className='SearchResults-labelIcon'
          style={{ backgroundColor: label.color }}
        ></div>
        <div key={`searchResult-${label.id}-title`} className='SearchResults-result-title'>
          {label.labelTitle}
        </div>
      </div>
    );
  }

  const urlResult = (i, url) => {
    let notesElement = false;
    const matchAreas = Object.values(url.match).flat();
    if (matchAreas.indexOf('notes') > -1) {
      const snippet = searchNotesSnippet(url.notes, url.terms[0]);
      if (snippet) {
        notesElement = (
          <div key={`searchResult-${url.id}-notes`} className='SearchResults-result-notes'>
            {snippet.before}<span>{snippet.match}</span>{snippet.after}
          </div>
        );
      }
    }

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
        {notesElement}
      </div>
    )
  }

  let index = -1;
  return (
    <div id='SearchResults' className='SearchResults'>
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
  labels: PropTypes.array,
  urls: PropTypes.array,
  archived: PropTypes.array
}

export default SearchResults;
