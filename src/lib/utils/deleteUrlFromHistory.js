import { Chrome } from './Chrome';

// The single place a page is deleted from History. Every caller — the History
// page's row ✕, the group card's "also delete from history" path, and Url's
// remove action — routes through here so there is exactly one read-modify-write
// over the history stores instead of a copy per call site.
//
// Deleting is a THREE-store operation, and the order matters:
//
//   1. splice the key out of `allUrls` (the recency list History renders from),
//   2. drop its `autoClosed` entry so a stale auto-close time can't re-date it,
//   3. write a `deletedUrls[urlKey]` tombstone,
//
// all in ONE `Chrome.set`, and only THEN delete the `url-*` record itself.
//
// The tombstone exists because deleting usually accompanies a tab close, and
// `chrome.tabs.onRemoved` -> `closeUrl` runs in the extension SERVICE WORKER —
// a different process, on the browser's schedule. That handler had already read
// a pre-delete `allUrls` snapshot, so its move-to-front wrote the key straight
// back at index 0 and the row reappeared at the top of History. No amount of
// sequencing on this side closes that window; `closeUrl` consulting the
// tombstone does, regardless of which process writes last.
//
// The `Chrome.remove` is deliberately LAST for the same reason: removing the
// `url-*` record while the key was still listed in `allUrls` is what made the
// resurrected row render as a bare URL with no title.
export const deleteUrlFromHistory = (urlKey, callback) => {
  Chrome.get('DeleteUrlFromHistory1', ['allUrls', 'autoClosed', 'deletedUrls'], (result) => {
    const allUrls = result.allUrls || [];
    const autoClosed = result.autoClosed || {};
    const deletedUrls = result.deletedUrls || {};

    // `splice(-1, 1)` removes the LAST element, so an untracked key would
    // silently evict someone else's history. Same guard `closeUrl` carries.
    const index = allUrls.indexOf(urlKey);
    if (index > -1) allUrls.splice(index, 1);

    delete autoClosed[urlKey];
    deletedUrls[urlKey] = Date.now();

    Chrome.set('DeleteUrlFromHistory1', { allUrls, autoClosed, deletedUrls });
    Chrome.remove('DeleteUrlFromHistory1', urlKey);

    if (callback) callback();
  });
};

export default deleteUrlFromHistory;
