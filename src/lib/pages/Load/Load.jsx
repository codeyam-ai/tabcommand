import './Load.css';

import React, { useEffect, useState } from 'react';

import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { LoadProcesses, LoadUrl, LoadPerTabNote } from '../../components';
import { Icon } from '../../components/Icon';

// The Load page: a grid of the active tabs' URLs (seedable, driven by
// `activeTabs` + the per-URL `url-<url>` objects) alongside a raw per-process
// table (LoadProcesses). A segmented toggle switches between the full
// "Processes" view (per-tab bars + the per-process rail) and a "Chrome
// fallback" view that explains per-tab stats need Chrome's Dev channel and
// drops the bars. When per-tab data is unavailable (stable Chrome),
// LoadPerTabNote independently explains the empty per-tab area. The sidebar
// LoadMeter gauge links here; the Home link returns to the Home page.
const Load = () => {
  const [urls, setUrls] = useState([]);
  const [view, setView] = useState('processes');

  const goHome = (e) => {
    e.stopPropagation();
    Chrome.get('Load1', 'uxSettings', ({uxSettings}) => {
      uxSettings.page = { name: Pages.HOME };
      Chrome.set('Load1', { uxSettings: uxSettings });
    })
  };

  useEffect(() => {
    Chrome.get('Load2', 'activeTabs', (result) => {
      const urlKeys = result.activeTabs.map((urlTab) => urlTab.urlKey);

      Chrome.get('Load3', urlKeys, (result) => {
        const urls = urlKeys.map((urlKey) => {
          // The modern per-URL object carries only title/favicon/processes; the
          // `urlKey` and the displayed `url` string are derived from the storage
          // key, exactly as the Url component does (urlKey.replace(/^url-/, '')).
          const url = result[urlKey] || {};
          return { ...url, urlKey, url: urlKey.replace(/^url-/, '') };
        });

        setUrls(urls);
      });
    });
  }, []);

  const fallback = view === 'fallback';

  return (
    <div className="Load">
      <div className="Load-main">
        <button className="Load-homeLink" onClick={goHome}>
          <Icon name="arrowLeft" size={15} /> Home
        </button>
        <h1 className="Load-title">Load</h1>

        <div className="Load-toggle" role="tablist" aria-label="Load data source">
          <button
            type="button"
            role="tab"
            aria-selected={!fallback}
            className={`Load-toggle-btn ${!fallback ? 'is-active' : ''}`}
            onClick={() => setView('processes')}
          >
            Processes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={fallback}
            className={`Load-toggle-btn ${fallback ? 'is-active' : ''}`}
            onClick={() => setView('fallback')}
          >
            Chrome fallback
          </button>
        </div>

        {fallback && (
          <div className="Load-fallbackBanner">
            <Icon name="info" size={16} className="Load-fallbackBanner-icon" />
            <span>
              Per-tab CPU &amp; memory stats need Chrome&rsquo;s Dev channel
              (<code>chrome.processes</code>). On this build the gauge shows
              whole-browser load only.
            </span>
          </div>
        )}

        <LoadPerTabNote />

        <div className="Load-details">
          {urls.map((url) => (
            <LoadUrl
              key={`Load-url-${url.urlKey}`}
              url={url}
              showLoad={!fallback}
            />
          ))}
        </div>
      </div>
      {!fallback && <LoadProcesses />}
    </div>
  );
}

export default Load;
