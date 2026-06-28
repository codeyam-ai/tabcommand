import './LoadMeter.css';

import React, { useState, useEffect } from 'react';
import { Chrome } from '../../utils/Chrome';
import deriveGaugeTotals from '../../utils/deriveGaugeTotals';
import { loadLevel } from '../../utils/loadLevel';
import { LoadMeterCaption } from '../LoadMeterCaption';
import { WarnAtDefault } from '../../../Constants';

// The signature sidebar gauge: two concentric SVG rings in a 200×200 box, the
// group rotated -90deg so both start at 12 o'clock. The OUTER ring is CPU, the
// INNER ring is Memory; each ring's filled fraction reflects the live
// `processTotals` storage key (written by the service worker in a packaged
// extension, or seeded directly in-app to drive the gauge to a level).
//
// Rendering is plain SVG: a track <circle> plus a progress <circle> whose
// `stroke-dashoffset` is `circumference × (1 − value)`. No gradient-path / no SVG
// path geometry, so it renders identically under jsdom (the unit tests assert the
// data binding: processTotals → the rendered load % / legend).
//
// Visibility gate: the gauge only renders when per-tab resource data is available
// (`loadDataSource === 'processes'`) — the same gate `Triage` (Triage.jsx:86) and
// `LoadMeterCaption` follow. On stable Chrome ('system') or no-data ('none') there
// is no tab-by-tab breakdown, so the whole gauge + legend + caption self-hides.
//
// Gauge ceilings — shared with Triage so "% of capacity" reads the same scale.
const MAX = { cpu: 150, memory: 5 * 1024 * 1024 * 1024 };
const MEM_FLOOR = 500 * 1024 * 1024;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Outer CPU ring r=84, inner Memory ring r=66; both stroke-width 9, round caps.
const R_CPU = 84;
const R_MEM = 66;
const CIRC_CPU = 2 * Math.PI * R_CPU;
const CIRC_MEM = 2 * Math.PI * R_MEM;

const LoadMeter = () => {
  const [{ cpu, memory, hasData }, setState] = useState({
    cpu: 0,
    memory: 0,
    hasData: false,
  });
  const [warnAt, setWarnAt] = useState(WarnAtDefault);
  const [source, setSource] = useState(null);

  useEffect(() => {
    const update = (processTotals, loaded) =>
      setState({ ...deriveGaugeTotals(processTotals), hasData: loaded });

    Chrome.get('LoadMeter1', 'processTotals', (result) => {
      update(result.processTotals || {}, !!result.processTotals);
    });

    Chrome.get('LoadMeter2', 'settings', (result) => {
      setWarnAt(result.settings?.warnAt ?? WarnAtDefault);
    });

    Chrome.get('LoadMeter3', 'loadDataSource', (result) => {
      setSource(result.loadDataSource || null);
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.processTotals) {
        update(changes.processTotals.newValue || {}, true);
      }
      if (changes.settings) {
        setWarnAt(changes.settings.newValue?.warnAt ?? WarnAtDefault);
      }
      if (changes.loadDataSource) {
        setSource(changes.loadDataSource.newValue || null);
      }
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Hide the gauge entirely without per-tab data (stable Chrome / unknown source).
  if (source !== 'processes') return null;

  // 0..1 ring values, on the same ceilings the old gauge used.
  const cpuValue = clamp01(cpu / MAX.cpu);
  const memValue = clamp01((memory - MEM_FLOOR) / MAX.memory);

  const cpuPct = Math.round(cpuValue * 100);
  const memPct = Math.round(memValue * 100);
  const loadPct = Math.max(cpuPct, memPct);

  // Color a percent by its shared load level (vs the warnAt setting). Returns a
  // token reference so the theme drives the hue.
  const LEVEL_COLOR = {
    high: 'var(--c-load-high)',
    medium: 'var(--c-load-med)',
    low: 'var(--c-load-light)',
  };
  const colorFor = (p) => LEVEL_COLOR[loadLevel(p, warnAt)];

  const cpuColor = colorFor(cpuPct);
  const loadColor = colorFor(loadPct);
  const memColor = 'var(--c-mem)';

  return (
    <div className="LoadMeter">
      <svg
        className="LoadMeter-svg"
        xmlns="http://www.w3.org/2000/svg"
        width="200"
        height="200"
        viewBox="0 0 200 200"
      >
        <g transform="rotate(-90 100 100)">
          {/* Outer — CPU */}
          <circle
            className="LoadMeter-track"
            cx="100"
            cy="100"
            r={R_CPU}
            strokeWidth="9"
            fill="none"
          />
          <circle
            className="LoadMeter-progress"
            cx="100"
            cy="100"
            r={R_CPU}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
            style={{
              stroke: cpuColor,
              strokeDasharray: CIRC_CPU,
              strokeDashoffset: CIRC_CPU * (1 - cpuValue),
            }}
          />
          {/* Inner — Memory */}
          <circle
            className="LoadMeter-track"
            cx="100"
            cy="100"
            r={R_MEM}
            strokeWidth="9"
            fill="none"
          />
          <circle
            className="LoadMeter-progress"
            cx="100"
            cy="100"
            r={R_MEM}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
            style={{
              stroke: memColor,
              strokeDasharray: CIRC_MEM,
              strokeDashoffset: CIRC_MEM * (1 - memValue),
            }}
          />
        </g>

        <text className="LoadMeter-eyebrow" x="100" y="92" textAnchor="middle">
          Browser Load
        </text>
        <text
          className="LoadMeter-value"
          x="100"
          y="120"
          textAnchor="middle"
          style={{ fill: hasData ? loadColor : undefined }}
        >
          {hasData ? `${loadPct}%` : 'Idle'}
        </text>
      </svg>

      <div className="LoadMeter-legend">
        <span className="LoadMeter-legend-item">
          <span className="LoadMeter-swatch" style={{ background: cpuColor }} />
          <span className="LoadMeter-legend-label">CPU</span>
          <span className="LoadMeter-legend-value">{cpuPct}%</span>
        </span>
        <span className="LoadMeter-legend-item">
          <span className="LoadMeter-swatch" style={{ background: memColor }} />
          <span className="LoadMeter-legend-label">Mem</span>
          <span className="LoadMeter-legend-value">{memPct}%</span>
        </span>
      </div>

      <LoadMeterCaption />
    </div>
  );
};

export default LoadMeter;
