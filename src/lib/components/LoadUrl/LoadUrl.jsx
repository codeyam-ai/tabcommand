import './LoadUrl.css';

import React from 'react';

import { Favicon } from '../Favicon';
import { summarizeProcessLoad } from '../../utils/processLoad';

// A single card in the Load page's URL list: the tab's favicon (a colored
// monogram tile when the site has none) and its title linked out to the live
// URL in a new tab,
// plus a per-tab load readout (average CPU + private memory with a severity-
// colored bar) when the URL's sampled `processes` data is present. The `url`
// object carries `urlKey` (React key), `url` (href), `title`, `favicon`, and
// `processes`, derived from storage by the Load page. `showLoad` lets the Load
// page hide the per-tab bars in its Chrome-fallback view (where per-tab stats
// don't exist); it defaults to true so the standalone card keeps its readout.
const LoadUrl = ({ url, showLoad = true }) => {
  const load = summarizeProcessLoad(url.processes);

  return (
    <div className='Load-url'>
      <h3 className='Load-url-title'>
        <a href={url.url} target='_blank' rel="noreferrer">
          <Favicon favicon={url.favicon} urlKey={url.urlKey} title={url.title} />
          {url.title}
        </a>
      </h3>
      {showLoad && load && (
        <div className={`Load-url-load Url-load-${load.level}`}>
          <div className='Load-url-load-stats'>
            <span>CPU {Math.round(load.cpu * 10) / 10}%</span>
            <span>Memory {Math.round(load.mem)}M</span>
          </div>
          <div className='Url-loadIndicatorContainer'>
            <div className='Url-loadIndicator' style={{ width: load.width + '%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadUrl;
