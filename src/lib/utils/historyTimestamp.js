// The timestamp a History row displays and buckets by: "the most recent thing
// that happened to this URL".
//
// History used to read this from `autoClosed[urlKey]` alone, which is wrong
// because the service worker writes `autoClosed` ONLY when the inactivity sweep
// auto-closes a tab, deletes the entry when the user returns to that tab, and
// prunes entries past MAX_AUTO_CLOSED_TIME. So a page you opened today and
// closed by hand — or simply left open — had no entry, its ts read as null, and
// bucketByDay(null) dropped it into the catch-all "Earlier this week". The real
// recency signal lives on the url-* record itself: `visits` (appended on every
// visit by newUrl) and `lastVisit` (stamped on every visit, including search
// engines, whose `visits` array is deliberately left empty so they don't accrue
// Favorites ranking weight).
//
// Taking the MAX of all three candidates makes both directions correct without
// branching on which store won: a tab the sweep closed an hour after its last
// visit reads as an hour ago, and a tab revisited after being auto-closed reads
// as the revisit. Pure — no storage, no Date.now() — so it unit-tests with
// fixed inputs.

// Coerce one candidate to a finite epoch-ms number, or null. Mirrors the
// Number.isFinite guarding pruneVisits uses, so strings, NaN and undefined all
// fall out rather than poisoning the Math.max.
const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// `autoClosed[urlKey]` is a bare numeric epoch in the current service-worker
// format; older entries are `{ time, backgroundColor }`. Read both shapes —
// History.jsx handled this inline before the helper existed.
const autoClosedTime = (entry) => {
  if (entry && typeof entry === 'object') return finite(entry.time);
  return finite(entry);
};

// The newest finite timestamp among `visits`, or null for an absent, empty or
// all-garbage array.
const latestVisit = (visits) => {
  if (!Array.isArray(visits)) return null;
  const times = visits.map(finite).filter((ts) => ts !== null);
  return times.length ? Math.max(...times) : null;
};

// record: a url-* record ({ lastVisit, visits, ... }); autoClosedEntry: that
// key's `autoClosed` value, in either stored shape. Returns epoch ms, or null
// when nothing at all is known about when this URL was last touched — in which
// case bucketByDay's "Earlier this week" fallback remains the honest answer.
export function historyTimestamp(record, autoClosedEntry) {
  const candidates = [
    finite(record && record.lastVisit),
    latestVisit(record && record.visits),
    autoClosedTime(autoClosedEntry),
  ].filter((ts) => ts !== null);

  return candidates.length ? Math.max(...candidates) : null;
}

export default historyTimestamp;
