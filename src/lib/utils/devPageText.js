// The dev server's stand-in for fetching a page over the network.
//
// A packaged extension fetches a closed URL from its own origin, holding the
// `<all_urls>` host permission the user granted, and gets the real page back.
// The dev server has neither: a `fetch('https://www.notion.so/...')` from a
// localhost page is refused by CORS before it leaves the browser. So every scope
// that reads CLOSED urls — a group, all grouped urls, recent history — would
// return zero hits in the preview, and the feature's whole closed-URL half would
// be undemonstrable.
//
// So when the chromeShim is installed (and ONLY then — in a packaged extension
// the real `chrome` wins and this returns null on the first line), a scenario's
// seeded `pageTexts` map stands in for the network. It is the same seam the shim
// already uses for `chrome.history`: model the capability with seeded data
// rather than mock the code path that consumes it.
//
// Returns the seeded text, '' for a page the scenario deliberately left blank,
// or null meaning "this is not the dev server — go and fetch it for real".
const devPageText = (url) => {
  if (typeof chrome === 'undefined' || !chrome.__shim || !chrome.__pageTexts) return null;

  const texts = chrome.__pageTexts() || {};
  const key = `url-${url}`;

  return Object.prototype.hasOwnProperty.call(texts, key) ? texts[key] : '';
};

export default devPageText;
