import { bucketVisitsByDay } from './bucketVisitsByDay';
import { bucketVisitsByWeek } from './bucketVisitsByWeek';

// The largest single-bucket visit count across every favorite's daily AND weekly
// usage buckets, floored at 1. The Favorites "View All" page passes this as a
// common maximum to every row's UsageSparkline so bar heights are comparable
// ACROSS rows — a site with 10 visits in a busy bucket reads visibly taller than
// one with 2 — instead of each chart self-scaling to its own busiest bucket
// (which made a quiet site and a busy site look identical). Pure and
// storage/DOM-free for easy unit testing.
export function usageMax(favorites, now) {
  let max = 1;
  for (const favorite of favorites || []) {
    const visits = favorite && favorite.recentVisits;
    for (const count of bucketVisitsByDay(visits, now)) {
      if (count > max) max = count;
    }
    for (const count of bucketVisitsByWeek(visits, now)) {
      if (count > max) max = count;
    }
  }
  return max;
}

export default usageMax;
