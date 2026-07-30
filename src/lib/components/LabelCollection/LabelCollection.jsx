import './LabelCollection.css';

import React, { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Url, LabelSectionHeader } from '..';
import { LabelCollectionMenu } from '../LabelCollectionMenu';

import { ItemTypes } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import appendGroupingLog from '../../utils/groupingLog';
import {
  buildGroupRemovalEntry,
  GROUP_REMOVAL_LOG_KEY,
  GROUP_REMOVAL_LOG_CAP,
  RemovalSource
} from '../../utils/groupRemovalLog';
import {
  getDragHover,
  subscribeDragHover,
  getDragActive,
  subscribeDragActive
} from '../../utils/dragHoverStore';
import anchoredMenuCoords from '../../utils/anchoredMenuCoords';
import groupCardAppearance from '../../utils/groupCardAppearance';

// Must match the border-box width in LabelCollectionMenu.css — the menu is
// positioned in viewport coordinates, so its width has to be known before it is
// measured.
const MENU_WIDTH = 205;
// First-paint guess for the flip-up decision; corrected against the real
// measured height in a layout effect below before the browser paints.
const MENU_HEIGHT_ESTIMATE = 280;

const LabelCollection = ({ index, draggable, title, urlKeys, backgroundColor, expanded }) => {
  const urlsDroppableId = `${index}-LabelCollection-urls-${title}`;

  // Subscribe to the cursor-hover store with a BOOLEAN selector: this card only
  // re-renders when it becomes (or stops being) the group under the pointer, so
  // moving the cursor between groups never re-renders the card holding the
  // dragged tab. Returns true only during a mouse drag whose cursor is over us.
  const isCursorTarget = useSyncExternalStore(
    subscribeDragHover,
    () => {
      const hover = getDragHover();
      return hover.cursorActive && hover.dropId === urlsDroppableId;
    }
  );

  // During a mouse drag the highlight follows the cursor (matching where the tab
  // will actually drop); keyboard drags fall back to @hello-pangea/dnd's own
  // center-based `isDraggingOver`.
  const isDropTarget = (dropSnapshot) =>
    getDragHover().cursorActive ? isCursorTarget : dropSnapshot.isDraggingOver;

  const [
    {
      currentTitle,
      currentUrlKeys,
      currentBackgroundColor,
      previewTitle,
      previewBackgroundColor,
      menuDisplayed,
      menuAnchor,
      menuCoords,
      activeTabs,
      titleMap
    }, setState] = useState(
      {
        currentTitle: title,
        currentUrlKeys: urlKeys || [],
        currentBackgroundColor: backgroundColor,
        // Uncommitted appearance reported by the open edit form. Deliberately
        // card-local: a preview must never reach chrome.storage, or it would
        // leak to the real Chrome tab group and every other surface.
        previewTitle: null,
        previewBackgroundColor: null,
        menuDisplayed: false,
        menuAnchor: null,
        menuCoords: { top: 0, left: 0 },
        activeTabs: [],
        titleMap: {}
      }
    );

  const menuButtonRef = useRef();
  const menuRef = useRef();

  // Storage updates that arrived while a drag was in flight, held until it ends.
  const pendingUpdatesRef = useRef({});
  const pendingTitlesRef = useRef({});

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

  // Functional setState so the relevance filter reads the current url set rather
  // than a stale closure — same reason the inline version did.
  const mergeTitles = (changedTitles) => {
    setState((prev) => {
      const relevant = Object.keys(changedTitles).filter((key) => prev.currentUrlKeys.includes(key));
      if (!relevant.length) return prev;
      const newTitleMap = { ...prev.titleMap };
      for (const key of relevant) newTitleMap[key] = changedTitles[key];
      return { ...prev, titleMap: newTitleMap };
    });
  };

  // Re-rendering this card mid-drag does two bad things: it remounts the
  // Droppable/Draggable subtree (cancelling the drag outright), and it re-sorts
  // `completeUrlKeys` — active tabs above inactive — which shifts Draggable
  // `index` values under the library while it is mid-flight. So both the source
  // and destination card hold their updates until the drag ends.
  const applyOrBuffer = (updates, changedTitles) => {
    const hasUpdates = updates && Object.keys(updates).length > 0;
    const hasTitles = changedTitles && Object.keys(changedTitles).length > 0;

    if (getDragActive()) {
      if (hasUpdates) pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
      if (hasTitles) pendingTitlesRef.current = { ...pendingTitlesRef.current, ...changedTitles };
      return;
    }

    if (hasUpdates) setPartialState(updates);
    if (hasTitles) mergeTitles(changedTitles);
  };

  // Drag over: apply the buffered state, then the buffered titles — in that
  // order, so the title relevance filter sees the new url set.
  useEffect(() => subscribeDragActive(() => {
    if (getDragActive()) return;
    const updates = pendingUpdatesRef.current;
    const titles = pendingTitlesRef.current;
    pendingUpdatesRef.current = {};
    pendingTitlesRef.current = {};
    if (Object.keys(updates).length) setPartialState(updates);
    if (Object.keys(titles).length) mergeTitles(titles);
  }), []);

  useEffect(() => {
    Chrome.get('LabelCollection1', 'activeTabs', (result) => {
      applyOrBuffer({ activeTabs: result.activeTabs || [] });
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      const updates = {};

      if (changes.labels) {
        const newLabels = changes.labels.newValue;
        if (!newLabels[currentTitle]) return;
        if (newLabels[currentTitle].urlKeys !== currentUrlKeys) {
          updates.currentUrlKeys = newLabels[currentTitle].urlKeys;
        }
      }

      if (changes.activeTabs) {
        updates.activeTabs = changes.activeTabs.newValue;
      }

      // A tab's title can load/change after the card mounts; keep titleMap fresh
      // so the ambiguity check (and its subtitles) react.
      const changedTitles = {};
      for (const key of Object.keys(changes).filter((key) => key.startsWith('url-'))) {
        changedTitles[key] = displayedTitle(key, changes[key].newValue);
      }

      applyOrBuffer(updates, changedTitles);
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Load the displayed title for every url in this group so we can spot titles
  // shared by 2+ tabs. Re-runs whenever the group's url set changes.
  useEffect(() => {
    if (!currentUrlKeys || !currentUrlKeys.length) {
      applyOrBuffer({ titleMap: {} });
      return;
    }
    Chrome.get('LabelCollectionTitles', currentUrlKeys, (records) => {
      const newTitleMap = {};
      for (const urlKey of currentUrlKeys) {
        newTitleMap[urlKey] = displayedTitle(urlKey, records[urlKey]);
      }
      // Issued before the drag began, but it can resolve mid-drag — same gate.
      applyOrBuffer({ titleMap: newTitleMap });
    });
  }, [currentUrlKeys]);

  const deleteLabel = async (event) => {
    event.stopPropagation();
    if (confirm(`Are you sure you want to permanently delete the label, "${currentTitle}"?`)) {
      Chrome.get('LabelCollection2', ['labels', GROUP_REMOVAL_LOG_KEY], ({ labels, [GROUP_REMOVAL_LOG_KEY]: removalLog }) => {
        const removedUrlKeys = (labels[currentTitle] && labels[currentTitle].urlKeys) || [];
        delete labels[currentTitle];
        Chrome.set('LabelCollections1', {
          labels: labels,
          [GROUP_REMOVAL_LOG_KEY]: appendGroupingLog(
            removalLog,
            buildGroupRemovalEntry(RemovalSource.UI_DELETE_LABEL, {
              labelTitle: currentTitle,
              urlKeys: removedUrlKeys,
              remaining: 0,
              t: Date.now()
            }),
            GROUP_REMOVAL_LOG_CAP
          )
        });
      });
    }
  };

  const removeUrl = async (event, urlKey) => {
    event.stopPropagation();
    Chrome.get('LabelCollection3', urlKey, (urlResult) => {
      const url = urlResult[urlKey];
      if (confirm(`Are you sure you want to remove the url, ${url.title}, from the group ${currentTitle}?`)) {
        Chrome.get('LabelCollections4', ['labels', 'activeTabs', GROUP_REMOVAL_LOG_KEY], ({ labels, activeTabs, [GROUP_REMOVAL_LOG_KEY]: removalLog }) => {
          const updates = {};
          const updatedUrlKeys = [...currentUrlKeys];
          updatedUrlKeys.splice(updatedUrlKeys.indexOf(urlKey), 1);
          labels[currentTitle].urlKeys = updatedUrlKeys;
          updates.labels = labels;

          updates[GROUP_REMOVAL_LOG_KEY] = appendGroupingLog(
            removalLog,
            buildGroupRemovalEntry(RemovalSource.UI_REMOVE_URL, {
              labelTitle: currentTitle,
              urlKeys: [urlKey],
              remaining: updatedUrlKeys.length,
              t: Date.now()
            }),
            GROUP_REMOVAL_LOG_CAP
          );

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

          // The group ✕ asks exactly one question, about the group. It means
          // "un-file this page", never "erase it" — so no history prompt follows.
          // Deleting a page from history has its own dedicated entry points (the
          // History page's row ✕ and Url's remove action), and offering it here
          // fired on every single removal, making one stray Enter enough to
          // destroy history the user never meant to touch.
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

  const handlePreview = ({ title: nextTitle, backgroundColor: nextBackgroundColor }) =>
    setPartialState({ previewTitle: nextTitle, previewBackgroundColor: nextBackgroundColor });

  // Save promotes the previewed values into the committed ones in the SAME
  // update that clears the preview, so there is no frame showing the old color.
  // Storage remains the source of truth — Labels re-keys this card once the
  // storage change lands, and the remount arrives on these same values.
  const handleSaved = ({ title: savedTitle, backgroundColor: savedBackgroundColor }) =>
    setPartialState({
      currentTitle: savedTitle,
      currentBackgroundColor: savedBackgroundColor,
      previewTitle: null,
      previewBackgroundColor: null
    });

  const toggleMenu = (event) => {
    if (event) event.stopPropagation();
    // Both branches drop the preview: toggleMenu is the single handler behind
    // Cancel, the dismiss overlay, and the ⋮ button, so clearing here reverts
    // the card on every dismissal path.
    if (menuDisplayed) {
      setPartialState({
        menuDisplayed: false,
        menuAnchor: null,
        previewTitle: null,
        previewBackgroundColor: null
      });
      return;
    }
    const rect = menuButtonRef.current && menuButtonRef.current.getBoundingClientRect();
    setPartialState({
      menuDisplayed: true,
      menuAnchor: rect || null,
      previewTitle: null,
      previewBackgroundColor: null,
      menuCoords: rect
        ? anchoredMenuCoords(rect, { width: MENU_WIDTH, height: MENU_HEIGHT_ESTIMATE })
        : { top: 0, left: 0 }
    });
  };

  // The open menu is measured once it exists and repositioned if the estimate
  // put it in the wrong place. Runs before paint, so the correction is never
  // visible as a jump.
  useLayoutEffect(() => {
    if (!menuDisplayed || !menuAnchor || !menuRef.current) return;
    const measured = menuRef.current.getBoundingClientRect().height;
    if (!measured) return;
    const next = anchoredMenuCoords(menuAnchor, { width: MENU_WIDTH, height: measured });
    if (next.top !== menuCoords.top || next.left !== menuCoords.left) {
      setPartialState({ menuCoords: next });
    }
  }, [menuDisplayed, menuAnchor]);

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

  // What the card actually paints — the pending edit when one is in flight,
  // otherwise the committed values. See groupCardAppearance for the fallbacks.
  const { color: displayedColor, titleText: displayedTitleText } = groupCardAppearance({
    previewTitle,
    previewBackgroundColor,
    currentTitle,
    currentBackgroundColor,
    title
  });

  const menu = () => (
    <LabelCollectionMenu
      menuRef={menuRef}
      title={title}
      // Seeded from the COMMITTED color, never the preview — otherwise a
      // cancelled edit would reopen already dirtied.
      backgroundColor={currentBackgroundColor}
      coords={menuCoords}
      onCancel={toggleMenu}
      onDelete={deleteLabel}
      onPreview={handlePreview}
      onSaved={handleSaved}
    />
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
      {/* The menu and its dismiss overlay are portalled to document.body: this
          card sets `overflow: hidden` (load-bearing for the drop-target inset
          ring and the rounded corners), which clipped the tall menu at the card's
          bottom edge. Portalling escapes the containing block entirely — the same
          pattern Settings uses to escape the sidebar's scroll container. */}
      {menuDisplayed && createPortal(
        <>
          <div className='LabelCollection-overlay' onClick={toggleMenu}></div>
          {menu()}
        </>,
        document.body
      )}
      <Droppable
        key={`${index}-LabelCollection-urls-${title}`}
        droppableId={`${index}-LabelCollection-urls-${title}`}
        direction="vertical"
        type={ItemTypes.URL}
      >
        {(dropProvided, dropSnapshot) => (
          // Full-card drop zone: the URL droppable spans the title bar AND the
          // body, so a dragged tab's center crosses it as soon as it reaches the
          // top of the card (center-based collision needs a bigger box, not a
          // threshold knob). --group-color drives the drag-over highlight.
          <div
            className={`LabelCollection-dropzone ${isDropTarget(dropSnapshot) ? 'UrlOver' : ''}`}
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
            style={
              displayedColor
                ? { ...dropProvided.droppableProps.style, '--group-color': displayedColor }
                : dropProvided.droppableProps.style
            }
          >
            <div
              className='LabelCollection-title'
              style={{ backgroundColor: displayedColor || '#707071' }}
              {...provided.dragHandleProps}
              onClick={pin}
            >
              <h3>{displayedTitleText}</h3>
              <span className='LabelCollection-count'>{(currentUrlKeys || []).length}</span>
              <button
                ref={menuButtonRef}
                type='button'
                className='LabelCollection-menuButton'
                aria-label='Group menu'
                title='Group menu'
                onClick={toggleMenu}
              >⋮</button>
            </div>

            <div className='LabelCollection-urls'>
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
                      {(dragProvided, dragSnapshot) => (
                        <Url
                          key={`Url-${urlKey}`}
                          dragRef={dragProvided.innerRef}
                          draggableProps={dragProvided.draggableProps}
                          dragHandleProps={dragProvided.dragHandleProps}
                          dragging={dragSnapshot.isDragging}
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
                      {(dragProvided, dragSnapshot) => (
                        <Url
                          key={`Url-${urlKey}`}
                          dragRef={dragProvided.innerRef}
                          draggableProps={dragProvided.draggableProps}
                          dragHandleProps={dragProvided.dragHandleProps}
                          dragging={dragSnapshot.isDragging}
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
              {dropProvided.placeholder}
            </div>
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
