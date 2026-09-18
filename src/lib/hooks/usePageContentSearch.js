import { useState, useEffect, useRef, useCallback } from 'react';

import { Chrome } from '../utils/Chrome';
import pageContentScan, { MAX_PAGES } from '../utils/pageContentScan';
import pageContentTargets, { SCOPE_OPEN_TABS } from '../utils/pageContentTargets';

// What the feature asks for, and asks for only when it is first used. The host
// permission is the whole reason this is opt-in: `<all_urls>` is the broadest
// grant Chrome offers, and holding it at install time would put a permission
// warning on a store listing whose entire claim today is that TabCommand reads
// no page content.
export const CONTENT_PERMISSIONS = { permissions: ['scripting'], origins: ['<all_urls>'] };

const hasPermissionsApi = () => (
  typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request
);

// Everything behind the Page contents panel: the optional permission, the chosen
// scope, the scan in flight, and the hits it has produced so far.
//
// The scan is deliberately MANUAL — it runs on a click, never as a side effect
// of typing. Every other section of this page re-queries as the user types
// because querying an in-memory index is free. This one reads real pages, so an
// as-you-type version would fetch a hundred pages for "t", then for "ta", then
// for "tab". The button is not a missing convenience; it is the consent.
//
// Results live here and nowhere else — not in storage, not in the index. They
// are gone on reload, which is the correct default for a transcript of what is
// on the pages the user visits.
export const usePageContentSearch = (query, { activeTabs = [] } = {}) => {
  const [granted, setGranted] = useState(false);
  const [denied, setDenied] = useState(false);
  const [scope, setScope] = useState(SCOPE_OPEN_TABS);
  const [deep, setDeep] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [labels, setLabels] = useState({});

  const abortRef = useRef(null);
  // Guards every `set*` that lands after an await, so a scan that outlives the
  // page does not set state on an unmounted component.
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // The grant can be revoked in Chrome's own settings long after it was given,
  // so it is read at mount rather than remembered from the session that asked.
  useEffect(() => {
    if (!hasPermissionsApi() || !chrome.permissions.contains) return;
    chrome.permissions.contains(CONTENT_PERMISSIONS, (isGranted) => {
      if (liveRef.current) setGranted(!!isGranted);
    });
  }, []);

  // The group list the scope picker offers.
  useEffect(() => {
    Chrome.get('usePageContentSearch1', 'labels', ({ labels: stored }) => {
      if (liveRef.current) setLabels(stored || {});
    });
  }, []);

  // A new query invalidates the old hits outright. Showing yesterday's snippets
  // under today's query would be worse than showing nothing, because the
  // snippets highlight a term the box no longer contains.
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    setResults([]);
    setProgress(null);
    setScanning(false);
  }, [query]);

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setScanning(false);
  }, []);

  const run = useCallback(() => {
    if (!query) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setResults([]);
    setDenied(false);
    setScanning(true);
    setProgress({ scanned: 0, total: 0 });

    Chrome.get('usePageContentSearch2', ['labels', 'allUrls', 'autoClosed'], (base) => {
      const allUrls = base.allUrls || [];

      // The url-* records carry the title and favicon each result row renders,
      // and the recency the History scope orders by. Read in one batched call
      // rather than per target.
      Chrome.get('usePageContentSearch3', allUrls, (urlRecords) => {
        if (!liveRef.current || controller.signal.aborted) return;

        const targets = pageContentTargets(scope, {
          activeTabs,
          labels: base.labels || {},
          allUrls,
          urlRecords: urlRecords || {},
          autoClosed: base.autoClosed || {},
        });

        pageContentScan({
          targets,
          query,
          deep,
          limit: MAX_PAGES,
          signal: controller.signal,
          onResult: (result) => {
            if (liveRef.current && !controller.signal.aborted) {
              setResults((prev) => [...prev, result]);
            }
          },
          onProgress: (next) => {
            if (liveRef.current && !controller.signal.aborted) setProgress(next);
          },
        }).finally(() => {
          if (liveRef.current) setScanning(false);
        });
      });
    });
  }, [query, scope, deep, activeTabs]);

  // The one entry point the button calls. The permission is requested here,
  // inside the click, because Chrome only honours `permissions.request` from a
  // user gesture — asking at mount would be both rejected and rude.
  const start = useCallback(() => {
    if (granted) {
      run();
      return;
    }
    if (!hasPermissionsApi()) return;

    chrome.permissions.request(CONTENT_PERMISSIONS, (isGranted) => {
      if (!liveRef.current) return;
      setGranted(!!isGranted);
      setDenied(!isGranted);
      if (isGranted) setTimeout(run, 0);
    });
  }, [granted, run]);

  return {
    granted,
    denied,
    scope,
    setScope,
    deep,
    setDeep,
    labels,
    scanning,
    progress,
    results,
    start,
    cancel,
  };
};

export default usePageContentSearch;
