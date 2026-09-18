import { historyTimestamp } from './historyTimestamp';

// The scope keys the Page contents panel offers. `LABEL_PREFIX` namespaces the
// per-group scopes so one <select> can carry both the fixed scopes and one
// entry per group without the two kinds of value being able to collide with a
// group literally named "openTabs".
export const SCOPE_OPEN_TABS = 'openTabs';
export const SCOPE_ALL_GROUPED = 'allGrouped';
export const SCOPE_HISTORY = 'history';
export const LABEL_PREFIX = 'label:';

// How many recent pages the History scope offers. Reading a page costs a network
// fetch each, so the scope is a window onto recent browsing rather than the whole
// archive — which for a long-lived install is thousands of URLs.
export const HISTORY_LIMIT = 50;

// Turns a chosen scope into the concrete list of pages a scan will read.
//
// Building the list is kept separate from doing the scan because it is the part
// with all the product judgement in it and none of the I/O: which pages a scope
// means, in what order, and — critically — whether a page can be read from a
// live tab or has to be fetched cold. Everything downstream is mechanical.
//
// A target carries `tabId` when and only when the page is open right now. That
// single field is what selects the extraction tier later: an open tab can be read
// as the user currently sees it, with the page's own JavaScript already run,
// while a closed URL can only be fetched as the server sends it.
//
// Returns `[{ urlKey, url, title, favicon, tabId }]`, deduplicated by urlKey —
// the same page can be both open and in a group, and reading it twice would
// spend two fetches to produce two identical rows.
const pageContentTargets = (scope, { activeTabs = [], labels = {}, allUrls = [], urlRecords = {}, autoClosed = {} } = {}) => {
  // urlKey -> live tab id, so a URL that happens to be open is read from the
  // tab no matter which scope selected it.
  const openTabIds = {};
  activeTabs.forEach((tab) => {
    if (!tab || !tab.urlKey || !tab.tabKey) return;
    const tabId = parseInt(tab.tabKey.split('-')[1], 10);
    if (!Number.isNaN(tabId)) openTabIds[tab.urlKey] = tabId;
  });

  let urlKeys;

  if (scope === SCOPE_OPEN_TABS) {
    urlKeys = activeTabs.map((tab) => tab && tab.urlKey);
  } else if (scope === SCOPE_ALL_GROUPED) {
    urlKeys = Object.values(labels).flatMap((label) => (label && label.urlKeys) || []);
  } else if (scope && scope.startsWith(LABEL_PREFIX)) {
    const label = labels[scope.slice(LABEL_PREFIX.length)];
    urlKeys = (label && label.urlKeys) || [];
  } else if (scope === SCOPE_HISTORY) {
    // Newest first, then capped — the same recency signal the History page
    // dates its rows by, so "recent" means the same thing on both pages.
    // `historyTimestamp` returns null when nothing is known about a URL's
    // recency; `|| 0` sinks those to the end rather than letting null coerce
    // silently mid-comparison.
    const dated = (urlKey) => historyTimestamp(urlRecords[urlKey] || {}, autoClosed[urlKey]) || 0;
    urlKeys = [...allUrls].sort((a, b) => dated(b) - dated(a)).slice(0, HISTORY_LIMIT);
  } else {
    urlKeys = [];
  }

  const seen = new Set();
  const targets = [];

  urlKeys.forEach((urlKey) => {
    if (!urlKey || seen.has(urlKey)) return;
    seen.add(urlKey);

    const record = urlRecords[urlKey] || {};
    const url = urlKey.replace(/^url-/, '');

    // Only http(s) pages can be fetched or scripted. A chrome:// or extension
    // page would fail at the browser boundary, and counting it as a scanned page
    // that simply did not match would misreport the scan's coverage.
    if (!/^https?:\/\//.test(url)) return;

    targets.push({
      urlKey,
      url,
      title: record.title || url,
      favicon: record.favicon,
      tabId: openTabIds[urlKey],
    });
  });

  return targets;
};

export default pageContentTargets;
