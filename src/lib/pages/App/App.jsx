import './App.css';

import React, { useEffect, useState } from 'react';

import logo from '../../../images/logo.svg';
import { Chrome } from '../../utils/Chrome';

const App = () => {
  // TEMPORARY: removed in the home-and-tabs plan. This reads seeded storage
  // through the real Chrome.get path and renders the counts, proving the whole
  // seed -> localStorage -> chromeShim -> Chrome.get -> React pipeline end to end
  // through codeyam. Empty storage reads "seeded: 0 labels ..." (documents the
  // empty state too).
  const [counts, setCounts] = useState({ labels: 0, activeTabs: 0, allUrls: 0 });

  useEffect(() => {
    Chrome.get('AppDiagnostic', ['labels', 'activeTabs', 'allUrls'], ({ labels, activeTabs, allUrls }) => {
      setCounts({
        labels: Object.keys(labels).length,
        activeTabs: activeTabs.length,
        allUrls: allUrls.length,
      });
    });
  }, []);

  return (
    <div className="App">
      <div className="App-sidebar">
        <img src={logo} className="App-logo" alt="TabCommand" />
      </div>
      <div className="App-content">
        {/* TEMPORARY: removed in home-and-tabs plan */}
        <div className="App-placeholder">
          seeded: {counts.labels} labels · {counts.activeTabs} active tabs · {counts.allUrls} urls
        </div>
      </div>
    </div>
  );
};

export default App;
