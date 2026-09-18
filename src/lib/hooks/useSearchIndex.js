import { useState, useEffect, useRef } from 'react';

import MiniSearch from 'minisearch';

import { Chrome } from '../utils/Chrome';
import { LOCAL, changedInArea } from '../utils/storageAreas';
import { buildSearchDocuments, buildUrlDocuments } from '../utils/buildSearchDocuments';

// The one MiniSearch index behind both search surfaces: the sidebar overlay
// (Search) and the Full Search page. It was built inline in Search.jsx, which
// meant a second consumer would have had to stand up its own index and the two
// could drift — different fields, different boosts, different rebuild triggers.
// The hook owns construction, the `buildToken` race guard, and the `onChanged`
// rebuild, and hands back a `search(query)` returning raw MiniSearch hits.
//
// `indexVersion` bumps on every completed rebuild. The overlay does not need it
// (it re-searches on each keystroke), but a surface that renders results for a
// query it already holds — the Full Search page, which is seeded from a query
// carried in `uxSettings.page` — has no keystroke to hang a re-search on, so it
// re-runs its search whenever the version changes.
export const useSearchIndex = () => {
  const [miniSearch] = useState(() =>
    new MiniSearch({
      fields: ['labelTitle', 'urlTitle', 'url', 'notes'],
      storeFields: ['labelTitle', 'urlTitle', 'url', 'urlLabelTitle', 'urlLabelColor', 'color', 'favicon', 'notes'],
      searchOptions: {
        boost: { labelTitle: 100, urlTitle: 50, notes: 5 }
      }
    })
  );
  const [indexVersion, setIndexVersion] = useState(0);

  // Rebuilds can overlap (StrictMode double-effect's two mount reads, plus the
  // seed-time `onChanged`). `addAllAsync` resolving after a newer rebuild's
  // `removeAll` would re-add already-cleared ids and corrupt minisearch's id map
  // (the same url indexed twice → duplicate React keys). A monotonic token lets
  // only the latest rebuild commit its async url batch.
  //
  // The token lives in a ref, NOT in the effect. The two StrictMode mount
  // effects share ONE MiniSearch instance, so an effect-local token cannot see
  // the other effect's build: both passed their own guard, both called
  // `addAllAsync` with the same ids, and the loser rejected on a duplicate id —
  // a rejection the catch below swallowed, leaving the index silently
  // half-built. A shared token makes the stale build bail where it should.
  const buildTokenRef = useRef(0);

  useEffect(() => {
    if (miniSearch === null) return;

    let cancelled = false;

    const addDocuments = (labels, allUrls) => {
      if (cancelled) return;
      const myToken = ++buildTokenRef.current;
      miniSearch.removeAll();

      const built = buildSearchDocuments(labels);
      const labelMap = built.labelMap;
      const labelColorMap = built.labelColorMap;
      miniSearch.addAll(built.labelDocuments);

      // Index the WHOLE archive, not just labeled URLs: the deduped union of
      // `allUrls` (the authoritative full set History reads) and the labeled
      // keys. Archived URLs come through with no `urlLabelTitle`.
      const urlKeys = Array.from(
        new Set([...(allUrls || []), ...Object.keys(labelMap)])
      );
      if (urlKeys.length === 0) {
        if (!cancelled) setIndexVersion((v) => v + 1);
        return;
      }

      Chrome.get('Search1', urlKeys, (result) => {
        if (myToken !== buildTokenRef.current) return;
        const documents = buildUrlDocuments(urlKeys, labelMap, labelColorMap, result);

        miniSearch.addAllAsync(documents).then(() => {
          if (myToken !== buildTokenRef.current || cancelled) return;
          setIndexVersion((v) => v + 1);
        }).catch(e => console.error("Search index build failed", e));
      })
    }

    Chrome.get('Search2', ['labels', 'allUrls'], ({ labels, allUrls }) => {
      addDocuments(labels, allUrls);
    });

    // Re-read both `labels` and `allUrls` for a full rebuild — mirrors how
    // History.jsx re-reads the archive on change so newly visited/closed URLs
    // become searchable live.
    const rebuildFromStorage = () => {
      Chrome.get('Search3', ['labels', 'allUrls'], ({ labels, allUrls }) => {
        addDocuments(labels || {}, allUrls || []);
      });
    };

    const handleStorageChange = (changes, areaName) => {
      // `labels` lives in chrome.storage.sync while `allUrls` and the `url-*`
      // records stay local, so ONE event carries only one area's keys. A blanket
      // `areaName !== 'local'` guard would drop every group change and the index
      // would go stale the moment a group was renamed or a member added.
      const labelsChange = changedInArea(changes, areaName, 'labels');
      const allUrlsChange = changedInArea(changes, areaName, 'allUrls');

      // A label change OR a grow/shrink of the archive re-indexes everything.
      if (labelsChange || allUrlsChange) {
        rebuildFromStorage();
        return;
      }

      // A notes edit on any already-indexed URL (labeled or archived) re-indexes
      // so its updated notes are searchable. `url-*` records are local-only.
      if (areaName !== LOCAL) return;
      for (const changedKey of Object.keys(changes)) {
        if (!changedKey.startsWith('url-')) continue;
        const { newValue, oldValue } = changes[changedKey];
        if (newValue && oldValue && newValue.notes !== oldValue.notes) {
          rebuildFromStorage();
          return;
        }
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const search = (query) => miniSearch.search(query, { prefix: true });

  return { search, indexVersion };
};

export default useSearchIndex;
