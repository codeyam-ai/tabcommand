import './History.css';

import React, { useEffect, useState } from 'react';
import { Chrome } from '../../utils/Chrome';
import { Pages } from '../../../Constants';
import { Icon, HistoryRow } from '../../components';
import { bucketByDay, HISTORY_BUCKETS } from '../../utils/historyBuckets';

const back = () => {
  Chrome.get('History0', 'uxSettings', ({ uxSettings }) => {
    uxSettings.page = { name: Pages.HOME };
    Chrome.set('History1', { uxSettings });
  });
};

// History: every closed/visited tab, grouped by Today / Yesterday / Earlier this
// week, each with a Reopen action. "Nothing is ever lost." Reads `allUrls` for
// the full set, `autoClosed` for close timestamps + originating group color, and
// `labels` to color-code each row's dot by its group.
const History = () => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const now = Date.now();
    Chrome.get('History2', ['allUrls', 'autoClosed', 'labels'], (base) => {
      const allUrls = base.allUrls || [];
      const autoClosed = base.autoClosed || {};
      const labels = base.labels || {};

      // urlKey -> group color, derived from label membership.
      const colorFor = {};
      Object.values(labels).forEach((label) => {
        (label.urlKeys || label.urls || []).forEach((k) => {
          colorFor[k] = label.backgroundColor;
        });
      });

      if (!allUrls.length) return setRows([]);
      Chrome.get('History3', allUrls, (urls) => {
        const built = allUrls.map((urlKey) => {
          const data = urls[urlKey] || {};
          const closed = autoClosed[urlKey];
          const ts = closed && closed.time ? closed.time : null;
          return {
            urlKey,
            title: data.title || urlKey.replace(/^url-/, ''),
            favicon: data.favicon,
            color: colorFor[urlKey] || (closed && closed.backgroundColor),
            ts,
            bucket: bucketByDay(ts, now),
          };
        });
        setRows(built);
      });
    });
  }, []);

  const reopen = (urlKey) => {
    const url = urlKey.replace(/^url-/, '');
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  };

  return (
    <div className="History">
      <button className="Page-back" onClick={back}>
        <Icon name="arrowLeft" size={15} /> Home
      </button>
      <h1 className="Page-h1">History</h1>
      <p className="Page-intro">Nothing is ever lost — every tab you have closed or visited lives here.</p>

      {HISTORY_BUCKETS.map((bucket) => {
        const group = rows.filter((r) => r.bucket === bucket);
        if (!group.length) return null;
        return (
          <section key={bucket} className="History-section">
            <div className="History-eyebrow">{bucket}</div>
            {group.map((row) => (
              <HistoryRow key={row.urlKey} row={row} onReopen={reopen} />
            ))}
          </section>
        );
      })}

      {!rows.length && <div className="History-empty">No history yet.</div>}
    </div>
  );
};

export default History;
