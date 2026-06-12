// Summarizes a stored per-URL `processes` record into the load readout the
// app shows for a tab: average CPU and private-memory, a severity level, and a
// bar width. Factored out of the Url component (it inlined the same math) so
// both Url and the Load page's LoadUrl cards share one tested definition.
//
// `processes` is the aggregate sampled over `samples` readings:
//   { samples, cpu, privateMemory, ... }
// CPU is stored ×100 and summed across samples; privateMemory is summed bytes.
// The 1064000 divisor and the 72 / 800 / threshold constants mirror the
// reference extension's tuning. Returns null when there is no sampled data, so
// callers render nothing rather than a divide-by-zero NaN.
export function summarizeProcessLoad(processes) {
  const samples = (processes && processes.samples) || 0;
  if (samples <= 0) return null;

  const cpu = processes.cpu / 100 / samples;
  const mem = processes.privateMemory / 1064000 / samples;
  const width = Math.max(cpu / 72, mem / 800) * 100;

  let level = 'low';
  if (cpu > 54 || mem > 600) {
    level = 'excessive';
  } else if (cpu > 36 || mem > 400) {
    level = 'high';
  } else if (cpu > 18 || mem > 200) {
    level = 'medium';
  }

  return { cpu, mem, level, width };
}
