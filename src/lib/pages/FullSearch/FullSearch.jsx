import './FullSearch.css';

import React, { useCallback, useMemo, useRef, useState } from 'react';

import { Pages } from '../../../Constants';
import {
  PageHeader,
  EmptyState,
  FullSearchInput,
  FullSearchFilterChips,
  FullSearchResults,
  FullSearchRow,
  FullSearchLabelRow,
  FullSearchHint,
  ChromeHistoryToggle,
  PageContentsPanel,
  PageContentsSection,
} from '../../components';
import { Chrome } from '../../utils/Chrome';
import { useSearchIndex } from '../../hooks/useSearchIndex';
import { useActiveTabs } from '../../hooks/useActiveTabs';
import { useChromeHistorySearch } from '../../hooks/useChromeHistorySearch';
import { usePageContentSearch } from '../../hooks/usePageContentSearch';
import { usePersistedPageQuery } from '../../hooks/usePersistedPageQuery';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import segmentFullSearchResults from '../../utils/segmentFullSearchResults';
import buildFullSearchSections from '../../utils/buildFullSearchSections';
import countFullSearchSections from '../../utils/countFullSearchSections';
import searchHitHref from '../../utils/searchHitHref';
import openUrlKey from '../../utils/openUrlKey';

const back = () => {
  Chrome.get('FullSearch0', 'uxSettings', ({ uxSettings }) => {
    uxSettings.page = { name: Pages.HOME };
    Chrome.set('FullSearch1', { uxSettings });
  });
};

// The chips, in render order. `key` doubles as the section key, so the chip row
// and the section list cannot fall out of step.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'labels', label: 'Groups' },
  { key: 'grouped', label: 'In my groups' },
  { key: 'history', label: 'History' },
  { key: 'notes', label: 'Notes' },
  { key: 'openTabs', label: 'Open tabs' },
];

const CHROME_HISTORY_CHIP = { key: 'chromeHistory', label: 'Chrome history' };

// Appended only once a scan has actually run. Unlike Chrome history — whose chip
// appears as soon as the source is switched on — there is no standing "page
// contents" result set to filter down to until the user has asked for one.
const PAGE_CONTENTS_CHIP = { key: 'pageContents', label: 'Page contents' };

// Full Search: every match for a query, with nothing capped and nothing hidden.
//
// The sidebar overlay is a quick-jump — ten grouped hits, ten archived, and no
// way to see the rest or to ask where a hit came from. This page is the other
// half of that trade: the whole result set, split by SOURCE, with a count on
// every filter so the shape of the results is legible before a single row is
// read.
//
// The query lives in `uxSettings.page.query`, not in component state alone, so a
// reload lands back on the same search — the way `Pages.URL` carries its
// `urlKey`.
const FullSearch = ({ initialQuery = '' }) => {
  const { search, indexVersion } = useSearchIndex();
  const { activeTabs, indexedUrls } = useActiveTabs();

  const [query, setQuery] = useState(initialQuery || '');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef(null);

  usePersistedPageQuery(query);

  const {
    active: chromeHistoryActive,
    granted: chromeHistoryGranted,
    hits: chromeHits,
    toggle: toggleChromeHistory,
  } = useChromeHistorySearch(query, indexedUrls);

  const pageContents = usePageContentSearch(query, { activeTabs });

  // Re-runs when the query changes AND when the index finishes a rebuild: the
  // page can mount with a query already in hand, before the index holds a single
  // document, so without `indexVersion` it would render an empty result set and
  // never correct itself.
  const results = useMemo(
    () => segmentFullSearchResults(query ? search(query) : [], activeTabs),
    [query, activeTabs, indexVersion] // eslint-disable-line
  );

  const counts = useMemo(
    () => countFullSearchSections(results, chromeHits, pageContents.results),
    [results, chromeHits, pageContents.results]
  );

  const { sections, flatRows } = useMemo(
    () => buildFullSearchSections(results, chromeHits, filter),
    [results, chromeHits, filter]
  );

  const activate = useCallback((hit, meta) => {
    if (!hit) return;
    if (hit.labelTitle) {
      Chrome.get('FullSearch2', 'uxSettings', ({ uxSettings }) => {
        const next = uxSettings || {};
        next.selectedLabel = hit.labelTitle;
        next.page = { name: Pages.HOME };
        Chrome.set('FullSearch2', { uxSettings: next });
      });
      return;
    }
    openUrlKey(hit.id, searchHitHref(hit), { newTab: !!meta });
  }, []);

  // Page-content results are not part of `flatRows`, so they sit outside the
  // keyboard walk and open through their own handler. They are plain URLs — no
  // group to jump to, no label branch — so this is the whole of it.
  const activatePageContent = useCallback((result, meta) => {
    if (result) openUrlKey(result.urlKey, result.url, { newTab: !!meta });
  }, []);

  const blurInput = useCallback(() => {
    if (inputRef.current) inputRef.current.blur();
  }, []);

  const { selectedIndex, setSelectedIndex } = useListKeyboardNav(
    flatRows, activate, { onEscape: blurInput }
  );

  const editUrl = useCallback((hit) => {
    Chrome.get('FullSearch3', 'uxSettings', ({ uxSettings }) => {
      const next = uxSettings || {};
      next.page = { name: Pages.URL, urlKey: hit.id };
      Chrome.set('FullSearch3', { uxSettings: next });
    });
  }, []);

  const openKeys = useMemo(
    () => new Set(activeTabs.map((tab) => tab && tab.urlKey).filter(Boolean)),
    [activeTabs]
  );

  // One running index across every section, so the row the highlight is on is
  // the row `flatRows[selectedIndex]` names.
  let index = -1;
  const renderRow = (hit) => {
    index += 1;
    // The key carries the index as well as the id: a hit deliberately appears in
    // more than one section (its location section AND Notes, AND Open tabs), so
    // the id alone is not unique across the rendered list.
    const key = `fullSearch-${hit.id}-${index}`;
    const shared = {
      hit,
      index,
      selected: index === selectedIndex,
      onSelect: setSelectedIndex,
      onActivate: activate,
    };
    return hit.labelTitle
      ? <FullSearchLabelRow key={key} {...shared} />
      : <FullSearchRow key={key} {...shared} isOpen={openKeys.has(hit.id)} onEdit={editUrl} />;
  };

  // A scan that has started is enough to earn the chip — `progress` is set
  // before the first page comes back, so the chip appears with the section
  // rather than popping in later once a hit happens to land.
  const scanned = !!pageContents.progress;

  const chips = [
    ...FILTERS,
    ...(chromeHistoryActive ? [CHROME_HISTORY_CHIP] : []),
    ...(scanned ? [PAGE_CONTENTS_CHIP] : []),
  ];

  // Page contents is its own section, so a chip that narrows to one of the index
  // sections must hide it — and the Page contents chip must hide them.
  const showIndexSections = filter !== 'pageContents';
  const showPageContents = filter === 'all' || filter === 'pageContents';

  return (
    <div className="FullSearch">
      <PageHeader
        title="Search"
        intro="Every match, nothing capped — split by where it came from."
        onBack={back}
      />

      <FullSearchInput value={query} onChange={setQuery} inputRef={inputRef} />

      {query && (
        <FullSearchFilterChips
          chips={chips}
          counts={counts}
          active={filter}
          onSelect={setFilter}
        />
      )}

      <ChromeHistoryToggle
        checked={chromeHistoryActive}
        granted={chromeHistoryGranted}
        onToggle={toggleChromeHistory}
      />

      {!query && <FullSearchHint />}

      {query && !flatRows.length && !scanned && (
        <EmptyState message={`No matches for "${query}".`} />
      )}

      {query && showIndexSections && (
        <FullSearchResults sections={sections} renderRow={renderRow} />
      )}

      {query && (
        <PageContentsPanel
          scope={pageContents.scope}
          onScopeChange={pageContents.setScope}
          deep={pageContents.deep}
          onDeepChange={pageContents.setDeep}
          labels={pageContents.labels}
          granted={pageContents.granted}
          denied={pageContents.denied}
          scanning={pageContents.scanning}
          progress={pageContents.progress}
          onStart={pageContents.start}
          onCancel={pageContents.cancel}
        />
      )}

      {query && showPageContents && (
        <PageContentsSection
          results={pageContents.results}
          scanned={scanned}
          onActivate={activatePageContent}
        />
      )}
    </div>
  );
};

export default FullSearch;
