import './App.css';

import React, { useEffect, useRef, useState } from 'react';
import { Tabs, Labels, LoadMeter, Search, AppBrand, ThemeToggle, Triage, Settings, Favorites, SearchHint } from '../../components';
import { Load } from '../Load';
import { ImportExport } from '../ImportExport';
import { UrlDetails } from '../UrlDetails';
import { History } from '../History';
import { ItemTypes, Pages } from '../../../Constants';

import { DragDropContext } from '@hello-pangea/dnd';

import { Chrome } from '../../utils/Chrome';
import { applyDrag } from '../../utils/dragReducer';
import { dropTargetIdAtPoint } from '../../utils/dropTargeting';
import { setDragHover, getDragHover } from '../../utils/dragHoverStore';
import { useTheme } from '../../hooks/useTheme';

const App = () => {
  const [page, setPage] = useState({ name: Pages.HOME });
  const [theme, toggleTheme] = useTheme();
  const [reviewMode, setReviewMode] = useState(false);
  const [counts, setCounts] = useState({ tabs: 0, groups: 0 });

  // Holds the teardown for the in-flight drag's pointer tracking (see
  // handleDragStart). The hovered group itself lives in the dragHoverStore, not
  // React state, so tracking the cursor never re-renders this component (which
  // would cancel the drag).
  const hoverCleanupRef = useRef(null);

  useEffect(() => {
    Chrome.get('App1', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.page && uxSettings.page !== page) {
        setPage(uxSettings.page || { name: Pages.HOME });
      }
    });

    const refreshCounts = () => {
      Chrome.get('AppCounts', ['labels', 'activeTabs'], ({ labels, activeTabs }) => {
        setCounts({
          tabs: (activeTabs || []).length,
          groups: Object.keys(labels || {}).length,
        });
      });
    };
    refreshCounts();

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.uxSettings) {
        const newValue = changes.uxSettings.newValue || {};
        if (newValue.page !== page) {
          setPage(newValue.page || { name: Pages.HOME });
        }
      }
      if (changes.labels || changes.activeTabs) refreshCounts();
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const stopHoverTracking = () => {
    if (hoverCleanupRef.current) hoverCleanupRef.current();
  };

  // The heart of TabCommand: dropping a tab into a group moves its urlKey into
  // that label, and dragging a group reorders the grid. The transform itself
  // lives in the testable `applyDrag` reducer; here we persist the result and
  // ungroup any real Chrome tabs that left an active label.
  const handleDrag = (dragResult) => {
    const labelsElement = document.getElementById('Labels');
    if (labelsElement) labelsElement.style.overflowY = 'scroll';

    // For a mouse drag, the tab drops into whichever group the cursor is over —
    // overriding @hello-pangea/dnd's center-based destination. If the cursor
    // isn't over any group, there is no drop (a tab released in empty space or
    // back in the sidebar stays put). Keyboard drags keep the library's target.
    const { cursorActive, dropId: cursorDropId } = getDragHover();
    stopHoverTracking();

    let result = dragResult;
    if (dragResult.type === ItemTypes.URL && cursorActive) {
      if (!cursorDropId) return;
      result = { ...dragResult, destination: { droppableId: cursorDropId, index: 0 } };
    }

    if (!result.destination || !result.destination.droppableId) return;

    Chrome.get('App3', ['labels', 'activeTabs'], ({ labels, activeTabs }) => {
      const dropResult = applyDrag(result, { labels, activeTabs });
      if (!dropResult) return;

      dropResult.ungroupTabIds.forEach((tabId) => {
        if (chrome.tabs.ungroup) chrome.tabs.ungroup(tabId);
      });

      Chrome.set('App2', { labels: dropResult.labels });
    });
  };

  const handleDragStart = (info) => {
    if (info.type !== ItemTypes.URL) return;

    const labelsElement = document.getElementById('Labels');
    if (labelsElement) labelsElement.style.overflowY = 'hidden';

    // Only a fluid (pointer) drag has a cursor to follow; keyboard drags report
    // mode 'SNAP' and keep @hello-pangea/dnd's built-in targeting + highlight.
    if (info.mode !== 'FLUID') return;

    setDragHover({ cursorActive: true, dropId: null });

    const onPointerMove = (event) => {
      const point = (event.touches && event.touches[0]) || event;
      setDragHover({ cursorActive: true, dropId: dropTargetIdAtPoint(point.clientX, point.clientY) });
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove);

    hoverCleanupRef.current = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      hoverCleanupRef.current = null;
      setDragHover({ cursorActive: false, dropId: null });
    };
  };

  useEffect(() => stopHoverTracking, []);

  const changePage = (pageName) => {
    Chrome.get('App2', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.page === page) return;
      uxSettings.page = { name: pageName };
      Chrome.set('App1', { uxSettings: uxSettings });
    });
  }

  const isHome = page.name === Pages.HOME;

  return (
    <div className="App">
      <div className="App-sidebar">
        <div className="App-sidebar-header">
          <AppBrand onClick={() => changePage(Pages.HOME)} />
          <div className="App-sidebar-tools">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {isHome && <Settings />}
          </div>
        </div>
        <Search />

        {isHome && <SearchHint />}

        {isHome && <Favorites />}

        <div className='App-sidebar-footer'>
          {isHome && (
            <Triage
              reviewMode={reviewMode}
              onToggleReview={() => setReviewMode((r) => !r)}
            />
          )}
          <div className="App-gauge" onClick={() => changePage(Pages.LOAD)}>
            <LoadMeter />
          </div>
          {isHome && (
            <div className="App-sidebar-counts">
              {counts.tabs} {counts.tabs === 1 ? 'tab' : 'tabs'} · {counts.groups}{' '}
              {counts.groups === 1 ? 'group' : 'groups'}
            </div>
          )}
          <div
            className='App-sidebar-link'
            onClick={() => changePage(Pages.IMPORTEXPORT)}
          >
            Import/Export
          </div>
        </div>
      </div>
      <div className="App-content">
        {page.name === Pages.URL &&
          <UrlDetails urlKey={page.urlKey} />
        }
        {page.name === Pages.IMPORTEXPORT &&
          <ImportExport onComplete={() => changePage(Pages.HOME)} />
        }
        {page.name === Pages.LOAD &&
          <Load />
        }
        {page.name === Pages.HISTORY &&
          <History />
        }
        {isHome &&
          <DragDropContext onDragEnd={handleDrag} onDragStart={handleDragStart}>
            <div className="App-home">
              <Labels />
              <Tabs reviewMode={reviewMode} />
            </div>
          </DragDropContext>
        }
      </div>
    </div>
  );
}

export default App;
