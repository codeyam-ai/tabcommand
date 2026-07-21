import { normalizeUrl } from './normalizeUrl';
import { siteKey } from './siteKey';

// The read-side bridge between the two storage forms `favoritesHidden` can hold.
//
// A Favorites row means "espn.com", not "this exact ESPN page" — `rankFavorites`
// rolls every stored page of a host onto one row. So a removal record has to mean
// the same thing, and from now on removal writes the bare SITE key. But installs
// that predate that change hold page keys (`url-https://espn.com/nfl/story`), and
// rewriting storage for them would need a migration nobody should have to run.
//
// Instead, both forms are normalized on READ: strip a leading `url-` to recover
// the raw URL, then reduce it to its site key. A legacy page entry therefore keeps
// hiding its whole site, and a bare site key passes through unchanged (`siteKey`
// can't parse a hostname on its own and returns '', so the `normalizeUrl` fallback
// hands the entry straight back). That expression — `siteKey(url) || normalizeUrl(url)`
// — is deliberately the SAME one `rankFavorites` derives its group keys with, so
// the set produced here and the group keys it is matched against agree by
// construction rather than by coincidence.
//
// Defensive: a missing or non-array input yields an empty set, so callers can pass
// unvalidated storage through without a guard.
// Normalize ONE stored entry to the site key it hides. Exported alongside the set
// builder so the write side ("un-hide this site") tests entries with exactly the
// same rule the read side groups them by — a bare site key must normalize to
// itself, which a lone `siteKey` call cannot do (a hostname is not a parseable
// URL, so it returns ''). Returns '' for anything that normalizes to nothing.
export function hiddenSiteKey(entry) {
  if (typeof entry !== 'string') return '';
  const url = entry.replace(/^url-/, '');
  return siteKey(url) || normalizeUrl(url);
}

export function hiddenSiteKeys(favoritesHidden) {
  if (!Array.isArray(favoritesHidden)) return new Set();

  const keys = new Set();
  for (const entry of favoritesHidden) {
    const key = hiddenSiteKey(entry);
    if (key.length > 0) keys.add(key);
  }
  return keys;
}

export default hiddenSiteKeys;
