import samePageKey from './samePageKey.js';

// Heal a drifted label slot in place. A Google Doc rewrites its own `?tab=t.…`
// query as the user clicks around, so a tab's live urlKey drifts away from the
// key recorded in its group's label. This locates the recorded slot for the
// SAME page as `liveUrl` — by page identity (samePageKey), which tolerates the
// drifted query and even a third `?tab=` variant — and either rewrites it to
// the live `newUrlKey` in place (preserving the doc's position in the group) or
// splices it out when `newUrlKey` already lives elsewhere in the label (so we
// never create a duplicate). It NEVER adds a new slot: the caller decides
// whether to append a genuinely-new URL based on the returned `found`.
// samePageKey is only the LOCATOR here; membership/eject stay exact-key tests.
//
// Mutates `label.urlKeys` in place. Returns:
//   found       — a same-page slot existed, so the caller must NOT append (that
//                 would duplicate the drifted doc)
//   mutated     — label.urlKeys was actually changed (rewrite or splice), so the
//                 caller should persist / log
//   previousKey — the slot's key before a rewrite/splice (for debug logging);
//                 null when nothing was mutated
//   removed     — true only on the dedup SPLICE branch (a member slot was
//                 dropped because the live key already lived elsewhere), false
//                 on the position-preserving rewrite and on the no-op returns.
//                 Lets callers distinguish a genuine member drop (audit it) from
//                 a harmless in-place rewrite.
export default function healDriftedLabelSlot(label, newUrlKey, liveUrl) {
  const idx = label.urlKeys.findIndex(
    (k) => samePageKey(k.replace(/^url-/, '')) === samePageKey(liveUrl)
  );
  if (idx === -1) return { found: false, mutated: false, previousKey: null, removed: false };
  if (label.urlKeys[idx] === newUrlKey) {
    // Already an exact match — no duplicate, no move.
    return { found: true, mutated: false, previousKey: null, removed: false };
  }
  const previousKey = label.urlKeys[idx];
  let removed = false;
  if (label.urlKeys.indexOf(newUrlKey) > -1) {
    // Live key already recorded elsewhere in the label — drop the stale slot
    // instead of duplicating it.
    label.urlKeys.splice(idx, 1);
    removed = true;
  } else {
    // Position-preserving heal: follow the live URL in place.
    label.urlKeys[idx] = newUrlKey;
  }
  return { found: true, mutated: true, previousKey, removed };
}
