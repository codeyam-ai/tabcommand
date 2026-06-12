// Maps a stored `processTotals` record onto the two values the LoadMeter gauge
// renders: `cpu` (drives the inner arc) and `memory` (the outer arc), where
// memory is the sum of private + JS-heap-used bytes. Factored out of LoadMeter's
// storage handler so the data binding is unit-testable independent of the SVG.
// Every field is optional — a partial or empty record reads as zero, never NaN.
const deriveGaugeTotals = (processTotals) => {
  const totals = processTotals || {};
  return {
    cpu: totals.cpu || 0,
    memory: (totals.privateMemory || 0) + (totals.jsMemoryUsed || 0),
  };
};

export default deriveGaugeTotals;
