import './App.css';

import React, { useEffect, useState } from 'react';
import { Tabs, Labels, LoadMeter, Search } from '../../components';
import { Load } from '../Load';
import { UrlDetails } from '../UrlDetails';
import { ItemTypes, Pages } from '../../../Constants';

import { DragDropContext } from '@hello-pangea/dnd';

import logo from '../../../images/logo.svg';
import { Chrome } from '../../utils/Chrome';
import { applyDrag } from '../../utils/dragReducer';

// Pages that have their own plans render a placeholder until those land:
// URL → url-details, IMPORTEXPORT → import-export, LOAD → load-meter.
const ComingSoon = ({ title }) => (
  <div className="App-comingSoon">
    <h2>{title}</h2>
    <p>Coming soon.</p>
  </div>
);

const App = () => {
  const [page, setPage] = useState({ name: Pages.HOME });

  useEffect(() => {
    Chrome.get('App1', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.page && uxSettings.page !== page) {
        setPage(uxSettings.page || { name: Pages.HOME });
      }
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.uxSettings) {
        const newValue = changes.uxSettings.newValue || {};
        if (newValue.page !== page) {
          setPage(newValue.page || { name: Pages.HOME });
        }
      }
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

  return (
    <div className="App">
      <div className="App-sidebar">
        <img
          src={logo}
          className="App-logo"
          alt="TabCommand"
          onClick={() => changePage(Pages.HOME)}
        />
        <Search />

        <div onClick={() => changePage(Pages.LOAD)}>
          <LoadMeter />
        </div>

        <div className='App-sidebar-footer'>
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
          <ComingSoon title="Import / Export" />
        }
        {page.name === Pages.LOAD &&
          <Load />
        }
        {page.name === Pages.HOME &&
          <DragDropContext onDragEnd={handleDrag} onDragStart={handleDragStart}>
            <Tabs />
            <Labels />
          </DragDropContext>
        }
      </div>
    </div>
  );
}

export default App;
