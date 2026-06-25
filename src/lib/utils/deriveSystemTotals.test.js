import { describe, it, expect } from 'vitest';
import deriveSystemTotals from './deriveSystemTotals';

// Mirrors the LoadMeter gauge scale the service worker passes in.
const GAUGE = {
  max: { cpu: 150, memory: 5 * 1024 * 1024 * 1024 },
  base: { cpu: 0, memory: 500 * 1024 * 1024 }
};

// A cpu sample with two processors, each carrying cumulative kernel/user/total
// counters. Utilization is the delta between two such samples.
const cpuSample = (a, b) => ({
  processors: [
    { usage: { kernel: a.kernel, user: a.user, idle: a.idle, total: a.total } },
    { usage: { kernel: b.kernel, user: b.user, idle: b.idle, total: b.total } }
  ]
});

describe('deriveSystemTotals', () => {
  // two cpu samples → average per-core busy fraction scaled to the gauge max
  it('computes cpu utilization from the delta between two samples', () => {
    const prev = cpuSample(
      { kernel: 100, user: 100, idle: 800, total: 1000 },
      { kernel: 100, user: 100, idle: 800, total: 1000 }
    );
    // core 0: +50 busy / +100 total = 0.5; core 1: +25 busy / +100 = 0.25 → avg 0.375
    const cur = cpuSample(
      { kernel: 130, user: 120, idle: 850, total: 1100 },
      { kernel: 115, user: 110, idle: 875, total: 1100 }
    );
    const out = deriveSystemTotals(prev, cur, { capacity: 100, availableCapacity: 100 }, GAUGE);
    expect(out.cpu).toBeCloseTo(0.375 * 150, 5);
  });

  // memory pressure → (capacity - available)/capacity scaled to the gauge max,
  // ridden in privateMemory with the base offset so the gauge fill == the ratio
  it('normalizes memory pressure into privateMemory against the gauge scale', () => {
    const memoryInfo = { capacity: 1000, availableCapacity: 400 }; // 60% used
    const out = deriveSystemTotals(null, null, memoryInfo, GAUGE);
    expect(out.privateMemory).toBeCloseTo(GAUGE.base.memory + 0.6 * GAUGE.max.memory, 0);
    expect(out.jsMemoryUsed).toBe(0);
    // gauge memory fill = (private + jsUsed - base) / max == the 0.6 pressure ratio
    const fill = (out.privateMemory + out.jsMemoryUsed - GAUGE.base.memory) / GAUGE.max.memory;
    expect(fill).toBeCloseTo(0.6, 5);
  });

  // first poll has no previous sample → cpu contributes 0 (memory still reads)
  it('reads zero cpu on the first single sample but still reports memory', () => {
    const out = deriveSystemTotals(
      null,
      cpuSample({ kernel: 1, user: 1, idle: 1, total: 3 }, { kernel: 1, user: 1, idle: 1, total: 3 }),
      { capacity: 1000, availableCapacity: 500 },
      GAUGE
    );
    expect(out.cpu).toBe(0);
    expect(out.privateMemory).toBeGreaterThan(0);
  });

  // empty / partial / missing inputs are guarded → zero, never NaN
  it('returns zeros and never NaN for empty or partial inputs', () => {
    const out = deriveSystemTotals(undefined, undefined, undefined, GAUGE);
    expect(out.cpu).toBe(0);
    expect(out.privateMemory).toBe(0);
    expect(out.jsMemoryUsed).toBe(0);
    expect(Number.isNaN(out.cpu)).toBe(false);
    expect(Number.isNaN(out.privateMemory)).toBe(false);

    // capacity 0 must not divide-by-zero into NaN
    const zeroCap = deriveSystemTotals(null, null, { capacity: 0, availableCapacity: 0 }, GAUGE);
    expect(zeroCap.privateMemory).toBe(0);
    expect(Number.isNaN(zeroCap.privateMemory)).toBe(false);
  });

  // a non-advancing cpu counter (Δtotal <= 0) contributes 0 rather than NaN/negative
  it('treats a non-advancing cpu counter as zero utilization', () => {
    const sample = cpuSample(
      { kernel: 10, user: 10, idle: 80, total: 100 },
      { kernel: 10, user: 10, idle: 80, total: 100 }
    );
    const out = deriveSystemTotals(sample, sample, { capacity: 100, availableCapacity: 100 }, GAUGE);
    expect(out.cpu).toBe(0);
  });

  // high memory pressure fills proportionally without pegging past the max
  it('clamps memory pressure to the gauge ceiling at full saturation', () => {
    const out = deriveSystemTotals(null, null, { capacity: 1000, availableCapacity: 0 }, GAUGE);
    const fill = (out.privateMemory - GAUGE.base.memory) / GAUGE.max.memory;
    expect(fill).toBeCloseTo(1, 5);
  });
});
