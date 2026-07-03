// Bucket a site's visit timestamps into per-week counts over the last `weeks`
// weeks (default 7), oldest week first, relative to `now`. Each bucket spans 7
// days. The Favorites "View All" page feeds the result to the UsageSparkline's
// long-range (7-week) view, shown beside the 7-day view so a user sees both
// recent daily rhythm and longer-term weekly trend. Because weekly buckets
// aggregate multiple visits, this view varies in height even when daily usage is
// a steady one-per-day. Pure and storage/DOM-free. Visits outside the window
// (older than `weeks` weeks, or in the future) are ignored.
export const SPARK_WEEKS = 7;

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export function bucketVisitsByWeek(visits, now, weeks = SPARK_WEEKS) {
  const buckets = new Array(weeks).fill(0);
  if (!Array.isArray(visits)) return buckets;
  for (const ts of visits) {
    const weekIndex = weeks - 1 - Math.floor((now - ts) / WEEK_MS);
    if (weekIndex >= 0 && weekIndex < weeks) buckets[weekIndex] += 1;
  }
  return buckets;
}

export default bucketVisitsByWeek;
