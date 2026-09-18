import { useState, useEffect } from 'react';

import { Chrome } from '../utils/Chrome';
import { changedInArea } from '../utils/storageAreas';

// The two live reads Full Search needs from storage, kept together because they
// are read in one call and invalidated by the same events.
//
// `activeTabs` drives the "Open" badges and the Open tabs section; `allUrls` is
// the set a Chrome-history hit is deduped against. Both are re-read on change so
// the page stays honest while tabs open and close underneath it — a search
// result that says OPEN about a tab the user closed a minute ago is worse than
// no badge at all.
export const useActiveTabs = () => {
  const [activeTabs, setActiveTabs] = useState([]);
  const [indexedUrls, setIndexedUrls] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      Chrome.get('useActiveTabs1', ['activeTabs', 'allUrls'], ({ activeTabs, allUrls }) => {
        if (cancelled) return;
        setActiveTabs(activeTabs || []);
        setIndexedUrls(allUrls || []);
      });
    };
    read();

    // `activeTabs` and `allUrls` are both local, but route through
    // `changedInArea` anyway so a future move to sync needs no edit here.
    const handleChange = (changes, areaName) => {
      if (changedInArea(changes, areaName, 'activeTabs') ||
          changedInArea(changes, areaName, 'allUrls')) {
        read();
      }
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(handleChange);
    };
  }, []);

  return { activeTabs, indexedUrls };
};

export default useActiveTabs;
