// A compact "how long ago" label for a timestamp, relative to `now` (both epoch
// ms). Used by the Favorites "View All" page's last-visited stat. Pure and
// storage/DOM-free so it is trivially unit-testable. Buckets: sub-hour → "just
// now", sub-day → "Nh ago", under two weeks → "Nd ago", else "Nw ago". A missing
// timestamp reads as "never".
const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

export function relativeTime(ts, now) {
  if (!ts) return 'never';
  const diff = Math.max(0, now - ts);
  if (diff < DAY_MS) {
    const hrs = Math.floor(diff / HOUR_MS);
    if (hrs < 1) return 'just now';
    return `${hrs}h ago`;
  }
  const days = Math.floor(diff / DAY_MS);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default relativeTime;
