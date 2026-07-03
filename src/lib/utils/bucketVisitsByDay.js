// Bucket a site's visit timestamps into per-day counts over the last `days` days
// (default 7), oldest day first, relative to `now`. The Favorites "View All"
// page feeds the result to the UsageSparkline's short-range (7-day) view. Pure
// and storage/DOM-free for easy unit testing. Visits outside the window (older
// than `days`, or in the future) are ignored.
export const SPARK_DAYS = 7;

export function bucketVisitsByDay(visits, now, days = SPARK_DAYS) {
  const buckets = new Array(days).fill(0);
  if (!Array.isArray(visits)) return buckets;
  const DAY_MS = 1000 * 60 * 60 * 24;
  for (const ts of visits) {
    const dayIndex = days - 1 - Math.floor((now - ts) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) buckets[dayIndex] += 1;
  }
  return buckets;
}

export default bucketVisitsByDay;
