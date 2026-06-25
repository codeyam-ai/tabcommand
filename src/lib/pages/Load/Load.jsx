import './Load.css';

import React, { useEffect, useState } from 'react';

import { HomeFilled } from '@ant-design/icons'

import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { LoadProcesses, LoadUrl, LoadPerTabNote } from '../../components';

// The Load page: a grid of the active tabs' URLs (seedable, driven by
// `activeTabs` + the per-URL `url-<url>` objects) alongside a raw per-process
// table (LoadProcesses). When per-tab data is unavailable (stable Chrome),
// LoadPerTabNote explains the empty per-tab area. The sidebar LoadMeter gauge
// links here; the Home link returns to the Home page.
const Load = () => {
  const [urls, setUrls] = useState([]);

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

  return (
    <div className="Load">
      <div className="Load-main">
        <div className="Load-homeLink" onClick={goHome}>
          <HomeFilled /> Home
        </div>
        <h2 className='Load-title'>Load</h2>
        <LoadPerTabNote />
        <div className='Load-details'>
          {urls.map((url) => (
            <LoadUrl key={`Load-url-${url.urlKey}`} url={url} />
          ))}
        </div>
      </div>
      <LoadProcesses />
    </div>
  );
}

export default Load;
