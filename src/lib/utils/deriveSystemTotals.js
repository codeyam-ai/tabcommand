// Stable-Chrome fallback math for the LoadMeter gauge. The gauge normally fills
// from `processTotals`, which the service worker only writes from the Dev/Canary-
// only `chrome.processes` API. On stable Chrome that API is absent, so the worker
// instead samples `chrome.system.cpu` + `chrome.system.memory` and feeds them
// through this pure (unit-testable) function to produce a `processTotals`-shaped
// record NORMALIZED to the gauge's existing 0→max scale — keeping
// `deriveGaugeTotals` / `gaugeFillPercent` / LoadMeter unchanged.
//
// `chrome.system.cpu.getInfo()` returns cumulative per-core counters, so CPU
// utilization is the delta between two polls; the first poll (no previous sample)
// contributes 0 until the second. Memory is a single-sample pressure ratio.
//
// `gauge` mirrors LoadMeter's own `{ max, base }` so the produced values map back
// to a utilization fraction: with cpu read as `(cpu - base.cpu) / max.cpu` and
// memory as `(privateMemory + jsMemoryUsed - base.memory) / max.memory`, the base
// cancels and the gauge fills to exactly the measured 0→1 utilization.

// Average per-core busy fraction = Δ(kernel+user) / Δtotal across processors.
// Returns 0 (never NaN) for missing/empty/single-sample input.
const cpuUtilization = (previousCpu, currentCpu) => {
  if (!previousCpu || !currentCpu) return 0;
  const prev = previousCpu.processors || [];
  const cur = currentCpu.processors || [];
  const count = Math.min(prev.length, cur.length);
  if (count === 0) return 0;

  let sum = 0;
  let counted = 0;
  for (let i = 0; i < count; ++i) {
    const p = (prev[i] || {}).usage || {};
    const c = (cur[i] || {}).usage || {};
    const deltaTotal = (c.total || 0) - (p.total || 0);
    if (deltaTotal <= 0) continue;
    const deltaBusy =
      ((c.kernel || 0) + (c.user || 0)) - ((p.kernel || 0) + (p.user || 0));
    sum += Math.max(0, Math.min(1, deltaBusy / deltaTotal));
    counted += 1;
  }
  return counted === 0 ? 0 : sum / counted;
};

// System memory pressure = (capacity - availableCapacity) / capacity, clamped to
// 0→1. Returns 0 (never NaN) when the info object or capacity is missing.
const memoryUtilization = (memoryInfo) => {
  if (!memoryInfo) return 0;
  const capacity = memoryInfo.capacity || 0;
  if (capacity <= 0) return 0;
  const available = memoryInfo.availableCapacity || 0;
  return Math.max(0, Math.min(1, (capacity - available) / capacity));
};

const deriveSystemTotals = (previousCpu, currentCpu, memoryInfo, gauge) => {
  const max = (gauge && gauge.max) || {};
  const base = (gauge && gauge.base) || {};
  const maxCpu = max.cpu || 0;
  const maxMemory = max.memory || 0;
  const baseCpu = base.cpu || 0;
  const baseMemory = base.memory || 0;

  const cpuUtil = cpuUtilization(previousCpu, currentCpu);
  const memUtil = memoryUtilization(memoryInfo);

  return {
    cpu: cpuUtil > 0 ? baseCpu + cpuUtil * maxCpu : 0,
    network: 0,
    // memory rides in privateMemory (deriveGaugeTotals sums private + jsUsed);
    // baseMemory cancels against the gauge's base so fill == memUtil exactly.
    privateMemory: memUtil > 0 ? baseMemory + memUtil * maxMemory : 0,
    jsMemoryAllocated: 0,
    jsMemoryUsed: 0,
  };
};

export default deriveSystemTotals;
