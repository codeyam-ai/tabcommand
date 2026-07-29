// Is this tab the one already filed under a slot in `label`, now sitting on a
// DIFFERENT url? That is a navigation, not a new member.
//
// The grouping sync appends any in-group tab whose url is not already recorded,
// which is right for a genuinely new page and wrong for a tab that simply moved
// within a site: `appstoreconnect.apple.com/apps` → `/apps/123/distribution` is
// a path change, so the same-page drift heal (`healDriftedLabelSlot`) finds no
// slot and the live url lands as a SECOND permanent member. Each navigation the
// eject path missed — MV3 worker teardown, ungroup races — added another, which
// is how one filed page became several identical-looking rows.
//
// The test is deliberately per-tab and exact-key, NOT per-title or per-host: a
// group legitimately holds several pages of one site, so collapsing rows by
// title or host would be wrong. The precise signal is that *this tab* already
// occupies a slot in *this label* and its url moved. The tab carries that slot
// as a stamp (`labelTitle`/`labelUrlKey`) written when it was recorded.
//
// The recorded slot must still be a live member: once the user removes it by
// hand the stamp is stale, and a stale stamp must not keep suppressing genuine
// appends forever.
export default function navigatedAwayFromRecordedSlot(label, groupTitle, activeTab) {
  return !!(
    activeTab.labelTitle === groupTitle &&
    activeTab.labelUrlKey &&
    activeTab.labelUrlKey !== activeTab.urlKey &&
    label.urlKeys.indexOf(activeTab.labelUrlKey) > -1
  );
}
