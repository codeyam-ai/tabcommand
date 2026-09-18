import { useEffect, useRef } from 'react';

import { Chrome } from '../utils/Chrome';
import { Pages } from '../../Constants';

// Writes the Full Search query back into `uxSettings.page` so a reload resumes
// the same search, the way `Pages.URL` carries its `urlKey`.
//
// Debounced because the alternative is a storage write per keystroke, and every
// write fans out to `chrome.storage.onChanged` — which the search index itself
// listens to. The first render is skipped outright: writing back the query we
// were just handed is a no-op round-trip through storage that would fire a
// change event before the user has typed anything.
//
// The write re-reads `uxSettings` and bails unless the app is still ON the
// search page. A pending debounce can land AFTER the user has navigated away —
// clicking a result routes to Home — and without the guard it would silently
// drag them back to search on the next reload.
export const usePersistedPageQuery = (query, delayMs = 400) => {
  const firstWrite = useRef(true);

  useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }

    const timer = setTimeout(() => {
      Chrome.get('usePersistedPageQuery1', 'uxSettings', ({ uxSettings }) => {
        const next = uxSettings || {};
        if (!next.page || next.page.name !== Pages.SEARCH) return;
        next.page = { name: Pages.SEARCH, query };
        Chrome.set('usePersistedPageQuery1', { uxSettings: next });
      });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [query, delayMs]);
};

export default usePersistedPageQuery;
