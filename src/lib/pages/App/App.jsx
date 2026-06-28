import './App.css';

import React, { useEffect, useState } from 'react';
import { Tabs, Labels, LoadMeter, Search, AppBrand, ThemeToggle, Triage, Settings, Favorites, SearchHint } from '../../components';
import { Load } from '../Load';
import { ImportExport } from '../ImportExport';
import { UrlDetails } from '../UrlDetails';
import { History } from '../History';
import { ItemTypes, Pages } from '../../../Constants';

import { DragDropContext } from '@hello-pangea/dnd';

import { Chrome } from '../../utils/Chrome';
import { applyDrag } from '../../utils/dragReducer';
import { useTheme } from '../../hooks/useTheme';

const App = () => {
  const [page, setPage] = useState({ name: Pages.HOME });
  const [theme, toggleTheme] = useTheme();
  const [reviewMode, setReviewMode] = useState(false);
  const [counts, setCounts] = useState({ tabs: 0, groups: 0 });

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

  // The heart of TabCommand: dropping a tab into a group moves its urlKey into
  // that label, and dragging a group reorders the grid. The transform itself
  // lives in the testable `applyDrag` reducer; here we persist the result and
  // ungroup any real Chrome tabs that left an active label.
  const handleDrag = (dragResult) => {
    const labelsElement = document.getElementById('Labels');
    if (labelsElement) labelsElement.style.overflowY = 'scroll';

    if (!dragResult.destination || !dragResult.destination.droppableId) return;

    Chrome.get('App3', ['labels', 'activeTabs'], ({ labels, activeTabs }) => {
      const result = applyDrag(dragResult, { labels, activeTabs });
      if (!result) return;

      result.ungroupTabIds.forEach((tabId) => {
        if (chrome.tabs.ungroup) chrome.tabs.ungroup(tabId);
      });

      Chrome.set('App2', { labels: result.labels });
    });
  };

  const handleDragStart = (info) => {
    if (info.type === ItemTypes.URL) {
      const labelsElement = document.getElementById('Labels');
      if (labelsElement) labelsElement.style.overflowY = 'hidden';
    }
  };

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
