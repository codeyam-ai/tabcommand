// Day-bucketing for the History page: classifies a closed/visited tab's
// timestamp (ms epoch) into one of the human day groups, relative to `now`.
// A missing timestamp falls into "Earlier this week" so a tab with no recorded
// close time still appears. "Today" is anything since local midnight; "Yesterday"
// is the prior calendar day; everything older is "Earlier this week".
const DAY_MS = 1000 * 60 * 60 * 24;

export const HISTORY_BUCKETS = ['Today', 'Yesterday', 'Earlier this week'];

export function bucketByDay(timestamp, now) {
  if (!timestamp) return 'Earlier this week';
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfToday - DAY_MS) return 'Yesterday';
  return 'Earlier this week';
}

export default bucketByDay;
