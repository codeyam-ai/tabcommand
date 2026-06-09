import './App.css';

import React, { useEffect, useState } from 'react';
import { Tabs, Labels, LoadMeter, Search } from '../../components';
import { Pages } from '../../../Constants';

import { DragDropContext } from '@hello-pangea/dnd';

import logo from '../../../images/logo.svg';
import { Chrome } from '../../utils/Chrome';

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

  // Minimal no-op: the URL lists are drag sources only, and the drop targets
  // (Labels) don't exist yet. Real grouping/reordering lands in labels-and-dnd.
  const handleDrag = () => {};

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
          <ComingSoon title="URL Details" />
        }
        {page.name === Pages.IMPORTEXPORT &&
          <ComingSoon title="Import / Export" />
        }
        {page.name === Pages.LOAD &&
          <ComingSoon title="Load" />
        }
        {page.name === Pages.HOME &&
          <DragDropContext onDragEnd={handleDrag}>
            <Tabs />
            <Labels />
          </DragDropContext>
        }
      </div>
    </div>
  );
}

export default App;
