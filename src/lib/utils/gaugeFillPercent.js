// The LoadMeter gauge's fill math, factored out of the SVG-mutation effect so it
// can be unit-tested without a real DOM. Given a measured `value` (cpu load, or
// memory = privateMemory + jsMemoryUsed), the arc's `base` (the empty-gauge
// floor) and `max` (the full-gauge ceiling), returns the percent of segments
// that should stay EMPTY — i.e. `100 - filledFraction * 100`. The segment loop
// fills index `i` when `i >= percent`, so a fuller gauge returns a smaller
// number. The result is intentionally un-clamped: the segment loop's `0..100`
// index range naturally ignores out-of-range values.
const gaugeFillPercent = (value, base, max) => {
  return 100 - ((value - base) / max) * 100;
};

export default gaugeFillPercent;
