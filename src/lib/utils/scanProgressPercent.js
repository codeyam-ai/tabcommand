// How full the Page contents progress bar should be, as a percent.
//
// Its whole job is the two edges an inline `scanned / total * 100` gets wrong.
// A scope that resolved to no scannable pages reports 0 / 0, and `0 / 0` is NaN
// — which reaches the style attribute as `width: NaN%`, is ignored, and leaves
// the bar frozen at whatever the previous scan left. And a count that overshoots
// its total would render a fill wider than its own track.
//
// Not `gaugeFillPercent`: that one takes (value, base, max) and returns the
// percent of the gauge to leave EMPTY, which is the opposite of what a progress
// fill wants.
const scanProgressPercent = (scanned, total) => {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, ((scanned || 0) / total) * 100));
};

export default scanProgressPercent;
