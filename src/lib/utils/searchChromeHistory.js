// Queries Chrome's own browser history for the Full Search page's opt-in
// "Include Chrome history" section.
//
// This is the only search source TabCommand does not own. Everything else on the
// page comes out of the extension's own index; these hits come from
// `chrome.history`, which is gated behind an OPTIONAL permission the user grants
// at runtime. So the function is defensive by construction: with no permission
// (or outside a packaged extension, where `chrome.history` does not exist at
// all) it resolves to an empty list rather than throwing, and the section simply
// does not render.
//
// `indexedUrls` is the set of URL KEYS TabCommand already tracks (`url-<url>`,
// the form `allUrls` holds). A Chrome-history hit for a URL already in the index
// is dropped rather than shown twice: the tracked record is strictly richer —
// it carries the group, the notes, and the open-tab state that a raw history
// entry has none of.
//
// Hits are shaped like URL search results so the page renders them through the
// same row as everything else. Their ids are namespaced `chrome-history-<url>`
// so they can never collide with a tracked `url-<url>` id.
const searchChromeHistory = (text, indexedUrls) => new Promise((resolve) => {
  if (!text || typeof chrome === 'undefined' || !chrome.history || !chrome.history.search) {
    resolve([]);
    return;
  }

  const indexed = new Set(indexedUrls || []);

  chrome.history.search({ text, startTime: 0, maxResults: 200 }, (items) => {
    const hits = (items || [])
      .filter((item) => item && item.url && !indexed.has(`url-${item.url}`))
      .map((item) => ({
        id: `chrome-history-${item.url}`,
        urlTitle: item.title || item.url,
        url: item.url,
        lastVisitTime: item.lastVisitTime,
      }));
    resolve(hits);
  });
});

export default searchChromeHistory;
