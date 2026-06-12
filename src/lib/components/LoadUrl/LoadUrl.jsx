import './LoadUrl.css';

import React from 'react';

import defaultFavicon from '../../../images/defaultFavicon.png';
import { summarizeProcessLoad } from '../../utils/processLoad';

// A single card in the Load page's URL list: the tab's favicon (falling back to
// the bundled default) and its title linked out to the live URL in a new tab,
// plus a per-tab load readout (average CPU + private memory with a severity-
// colored bar) when the URL's sampled `processes` data is present. The `url`
// object carries `urlKey` (React key), `url` (href), `title`, `favicon`, and
// `processes`, derived from storage by the Load page.
const LoadUrl = ({ url }) => {
  const load = summarizeProcessLoad(url.processes);

  return (
    <div className='Load-url'>
      <h3 className='Load-url-title'>
        <a href={url.url} target='_blank' rel="noreferrer">
          <img src={url.favicon || defaultFavicon} />
          {url.title}
        </a>
      </h3>
      {load && (
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
