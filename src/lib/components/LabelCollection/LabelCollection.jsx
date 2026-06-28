import './LabelCollection.css';

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Url, LabelForm, LabelSectionHeader } from '..';
import { Icon } from '../Icon';

import { ItemTypes } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';

const LabelCollection = ({ index, draggable, title, urlKeys, backgroundColor, expanded }) => {
  const [
    {
      currentTitle,
      currentUrlKeys,
      currentBackgroundColor,
      menuDisplayed,
      activeTabs,
      titleMap
    }, setState] = useState(
      {
        currentTitle: title,
        currentUrlKeys: urlKeys || [],
        currentBackgroundColor: backgroundColor,
        menuDisplayed: false,
        activeTabs: [],
        titleMap: {}
      }
    );

  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      };
    });
  };

  // Displayed title for a url record: its page title, or the bare URL when the
  // title is missing. Mirrors the fallback in Url's render so collision detection
  // matches what the user actually sees.
  const displayedTitle = (urlKey, record) =>
    (record && record.title) || urlKey.replace(/^url-/, '');

  useEffect(() => {
    Chrome.get('LabelCollection1', 'activeTabs', (result) => {
      setPartialState({ activeTabs: result.activeTabs || [] });
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes.labels) {
        const newLabels = changes.labels.newValue;
        if (!newLabels[currentTitle]) return;
        if (newLabels[currentTitle].urlKeys !== currentUrlKeys) {
          setPartialState({ currentUrlKeys: newLabels[currentTitle].urlKeys });
        }
      }

      if (changes.activeTabs) {
        setPartialState({ activeTabs: changes.activeTabs.newValue });
      }

      // A tab's title can load/change after the card mounts; keep titleMap fresh
      // so the ambiguity check (and its subtitles) react. Functional setState
      // avoids a stale closure over currentUrlKeys.
      const urlChanges = Object.keys(changes).filter((key) => key.startsWith('url-'));
      if (urlChanges.length) {
        setState((prev) => {
          const relevant = urlChanges.filter((key) => prev.currentUrlKeys.includes(key));
          if (!relevant.length) return prev;
          const newTitleMap = { ...prev.titleMap };
          for (const key of relevant) {
            newTitleMap[key] = displayedTitle(key, changes[key].newValue);
          }
          return { ...prev, titleMap: newTitleMap };
        });
      }
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Load the displayed title for every url in this group so we can spot titles
  // shared by 2+ tabs. Re-runs whenever the group's url set changes.
  useEffect(() => {
    if (!currentUrlKeys || !currentUrlKeys.length) {
      setPartialState({ titleMap: {} });
      return;
    }
    Chrome.get('LabelCollectionTitles', currentUrlKeys, (records) => {
      const newTitleMap = {};
      for (const urlKey of currentUrlKeys) {
        newTitleMap[urlKey] = displayedTitle(urlKey, records[urlKey]);
      }
      setPartialState({ titleMap: newTitleMap });
    });
  }, [currentUrlKeys]);

  const deleteLabel = async (event) => {
    event.stopPropagation();
    if (confirm(`Are you sure you want to permanently delete the label, "${currentTitle}"?`)) {
      Chrome.get('LabelCollection2', 'labels', ({ labels }) => {
        delete labels[currentTitle];
        Chrome.set('LabelCollections1', { labels: labels });
      });
    }
  };

  const removeUrl = async (event, urlKey) => {
    event.stopPropagation();
    Chrome.get('LabelCollection3', urlKey, (urlResult) => {
      const url = urlResult[urlKey];
      if (confirm(`Are you sure you want to remove the url, ${url.title}, from the group ${currentTitle}?`)) {
        Chrome.get('LabelCollections4', ['labels', 'activeTabs'], ({ labels, activeTabs }) => {
          const updates = {};
          const updatedUrlKeys = [...currentUrlKeys];
          updatedUrlKeys.splice(updatedUrlKeys.indexOf(urlKey), 1);
          labels[currentTitle].urlKeys = updatedUrlKeys;
          updates.labels = labels;

          const tab = activeTabs.filter((tabInfo) => tabInfo.urlKey === urlKey)[0];
          if (tab && tab.groupId && tab.groupId > -1) {
            const tabIndex = activeTabs.indexOf(tab);
            delete tab.groupId;
            if (chrome.tabs.ungroup) {
              chrome.tabs.ungroup(parseInt(tab.tabKey.split('-')[1]));
            }
            activeTabs.splice(tabIndex, 1, tab);
            updates.activeTabs = activeTabs;
          }

          Chrome.set('LabelCollections2', updates);
          setPartialState({ currentUrlKeys: updatedUrlKeys });
        });
      }
    });
  };

  const pin = async () => {
    Chrome.get('LabelCollection5', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.selectedLabel === title) {
        delete uxSettings.selectedLabel;
        if (Object.keys(uxSettings).length === 0) {
          Chrome.remove('LabelCollection1', 'uxSettings');
          return;
        }
      } else {
        uxSettings.selectedLabel = title;
      }
      Chrome.set('LabelCollections3', { uxSettings: uxSettings });
    });
  };

  const toggleMenu = (event) => {
    if (event) event.stopPropagation();
    setPartialState({ menuDisplayed: !menuDisplayed });
  };

  const completeUrlKeys = [...currentUrlKeys].sort(
    (a, b) =>
      (activeTabs.filter((tab) => tab.urlKey === a).length ? -1 : 1) -
      (activeTabs.filter((tab) => tab.urlKey === b).length ? -1 : 1)
  );

  const activeUrls = completeUrlKeys.filter(
    (urlKey => activeTabs.filter((tab) => tab.urlKey === urlKey).length > 0)
  );

  const inactiveUrls = completeUrlKeys.filter(
    (urlKey => activeTabs.filter((tab) => tab.urlKey === urlKey).length === 0)
  );

  // Titles shared by 2+ tabs in this group are ambiguous; those rows get a URL
  // subtitle so they can be told apart. Unique titles stay clean.
  const titleCounts = {};
  for (const urlKey of currentUrlKeys || []) {
    const t = titleMap[urlKey];
    if (t) titleCounts[t] = (titleCounts[t] || 0) + 1;
  }
  const isAmbiguous = (urlKey) => {
    const t = titleMap[urlKey];
    return !!t && titleCounts[t] > 1;
  };

  const menu = () => (
    <div
      className='LabelCollection-menu'
      onClick={(e) => e.stopPropagation()}
    >
      <LabelForm
        onCancel={toggleMenu}
        label={{ title: title, backgroundColor: currentBackgroundColor }}
      />
      <div className='LabelCollection-menu-section LabelCollection-menu-actions'>
        <button className='LabelCollection-share' disabled title='Group sharing is coming soon'>
          <Icon name="globe" size={15} /> Share Group
        </button>
        <button className='LabelCollection-delete' onClick={deleteLabel}>
          <Icon name="close" size={15} /> Delete Group
        </button>
      </div>
    </div>
  );

  let urlIndex = 0;
  const content = (provided = {}) => (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      key={`LabelCollection-${title}`}
      id={`LabelCollection-${title}`}
      className='LabelCollection'
    >
      {menuDisplayed && <div id="BackgroundOverlay" onClick={toggleMenu}></div>}
      {menuDisplayed && menu()}
      <div
        className='LabelCollection-title'
        style={{ backgroundColor: currentBackgroundColor || '#707071' }}
        {...provided.dragHandleProps}
        onClick={pin}
      >
        <h3>{currentTitle || title}</h3>
        <span className='LabelCollection-count'>{(currentUrlKeys || []).length}</span>
        <span className='LabelCollection-menuButton' onClick={toggleMenu}>⋮</span>
      </div>

      <Droppable
        key={`${index}-LabelCollection-urls-${title}`}
        droppableId={`${index}-LabelCollection-urls-${title}`}
        direction="vertical"
        type={ItemTypes.URL}
      >
        {(provided, snapshot) => (
          <div
            className={`LabelCollection-urls ${snapshot.isDraggingOver ? 'UrlOver' : ''}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {(!currentUrlKeys || !currentUrlKeys.length) &&
              <div className='LabelCollection-empty'>
                Drag tabs from the sidebar into this group to save them.
              </div>
            }

            {activeUrls.length > 0 &&
              <div className='LabelCollection-urls-active'>
                <LabelSectionHeader label='Open' count={activeUrls.length} />
                {activeUrls.map((urlKey) => (
                  <Draggable
                    key={`${index}-LabelCollection-urls-${title}-${urlKey}`}
                    draggableId={`${index}-LabelCollection-urls-${title}-${urlKey}`}
                    index={urlIndex++}
                  >
                    {dragProvided => (
                      <Url
                        key={`Url-${urlKey}`}
                        dragRef={dragProvided.innerRef}
                        draggableProps={dragProvided.draggableProps}
                        dragHandleProps={dragProvided.dragHandleProps}
                        showLoad={true}
                        expanded={expanded}
                        showUrl={isAmbiguous(urlKey)}
                        onRemove={(event) => removeUrl(event, urlKey)}
                        urlKey={urlKey}
                      />
                    )}
                  </Draggable>
                ))}
              </div>
            }

            {inactiveUrls.length > 0 &&
              <div className='LabelCollection-urls-inactive'>
                {inactiveUrls.map((urlKey) => (
                  <Draggable
                    key={`${index}-LabelCollection-urls-${title}-${urlKey}`}
                    draggableId={`${index}-LabelCollection-urls-${title}-${urlKey}`}
                    index={urlIndex++}
                  >
                    {dragProvided => (
                      <Url
                        key={`Url-${urlKey}`}
                        dragRef={dragProvided.innerRef}
                        draggableProps={dragProvided.draggableProps}
                        dragHandleProps={dragProvided.dragHandleProps}
                        expanded={expanded}
                        showUrl={isAmbiguous(urlKey)}
                        onRemove={(event) => removeUrl(event, urlKey)}
                        urlKey={urlKey}
                      />
                    )}
                  </Draggable>
                ))}
              </div>
            }
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );

  const fullContent = (!draggable
    ? content()
    : (
      <Draggable
        key={`LabelCollectionDraggable-${title}`}
        draggableId={`LabelCollectionDraggable-${title}`}
        index={index}
      >
        {provided => content(provided)}
      </Draggable>
    )
  );

  return fullContent;
};

LabelCollection.propTypes = {
  index: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  draggable: PropTypes.bool,
  title: PropTypes.string,
  urlKeys: PropTypes.array,
  backgroundColor: PropTypes.string,
  expanded: PropTypes.bool
};

export default LabelCollection;
