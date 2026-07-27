import { useEffect, useState } from 'react';
import { Chrome } from '../utils/Chrome';
import { bucketByDay } from '../utils/historyBuckets';
import { historyTimestamp } from '../utils/historyTimestamp';

// Owns the History page's data: turns the `allUrls` / `autoClosed` / `labels`
// stores plus each `url-*` record into display rows, and keeps them live.
//
// Each row is dated by `historyTimestamp`, NOT by `autoClosed` alone. That store
// only covers tabs the inactivity sweep closed — it is deleted when the user
// returns to a tab and pruned past MAX_AUTO_CLOSED_TIME — so reading it as the
// sole timestamp left every manually-closed or still-open page undated, and
// bucketByDay(null) buried today's pages under "Earlier this week".
//
// Rows come back sorted newest-first. `now` is recomputed on every load so the
// Today/Yesterday split stays correct across a midnight boundary while the page
// is left open. Returns `{ rows, reopen }`.
export const useHistoryRows = () => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = () => {
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
            // Newest of the record's own recency signals (lastVisit / visits)
            // and its auto-close time, in either stored shape.
            const closed = autoClosed[urlKey];
            const ts = historyTimestamp(data, closed);
            return {
              urlKey,
              title: data.title || urlKey.replace(/^url-/, ''),
              favicon: data.favicon,
              // Label membership is the primary color source; the object-form
              // backgroundColor is only a fallback and never read off a number.
              color: colorFor[urlKey] || (closed && typeof closed === 'object' && closed.backgroundColor),
              ts,
              bucket: bucketByDay(ts, now),
            };
          });
          // Newest first. Now that every dated row carries a real timestamp,
          // sorting by it beats the incidental `allUrls` order (which drifts via
          // closeUrl's move-to-front and eviction). Array.prototype.sort is
          // stable, so undated rows all tie at -Infinity and keep their original
          // `allUrls` order at the end.
          built.sort((a, b) => (b.ts ?? -Infinity) - (a.ts ?? -Infinity));
          setRows(built);
        });
      });
    };

    load();

    // Stay live: re-load whenever a key History reads changes. Mirrors the
    // ViewAllFavorites listener so both pages update without a remount.
    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      const touched = Object.keys(changes).some(
        (key) =>
          key === 'allUrls' ||
          key === 'autoClosed' ||
          key === 'labels' ||
          key.startsWith('url-')
      );
      if (touched) load();
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const reopen = (urlKey) => {
    const url = urlKey.replace(/^url-/, '');
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  };

  return { rows, reopen };
};

export default useHistoryRows;
