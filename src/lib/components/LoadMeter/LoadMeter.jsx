import './LoadMeter.css';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { GradientPath } from 'gradient-path';
import { Chrome } from '../../utils/Chrome';
import gaugeFillPercent from '../../utils/gaugeFillPercent';
import deriveGaugeTotals from '../../utils/deriveGaugeTotals';

// The distinctive sidebar gauge: two concentric SVG arcs (cpu inner, memory
// outer) whose filled fraction reflects the live `processTotals` storage key.
// The service worker writes `processTotals` in a packaged extension; in the
// codeyam preview each scenario seeds it directly to drive the gauge to a level.
//
// The arc fill is done with `gradient-path`, which mutates per-segment SVG
// `fill`/`stroke` attributes — real-DOM/SVG work jsdom can't render. So the
// GradientPath calls are wrapped to no-op under jsdom (its SVG geometry methods
// throw "Not implemented"), and the unit tests assert the data binding
// (reads `processTotals`, computes the fill percent) while the visual is
// verified by the codeyam screenshot.
const LoadMeter = () => {
  const max = {
    cpu: 150,
    memory: 5 * 1024 * 1024 * 1024
  }

  const base = {
    cpu: 0,
    memory: 500 * 1024 * 1024
  }

  const [state, setState] = useState({
    cpu: 0,
    memory: 0
  });

  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      }
    })
  }

  // Pristine per-arc gradient colors, captured the first time each arc's
  // segments are built and reused when we recolor — so the gradient base never
  // drifts as we toggle segments to the default (empty) color.
  const baseColors = useRef({});

  useEffect(() => {
    const updateProcessTotals = (processTotals) => {
      setPartialState(deriveGaugeTotals(processTotals));
    };

    Chrome.get('LoadMeter1', 'processTotals', (result) => {
      updateProcessTotals(result.processTotals || {});
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes.processTotals) {
        updateProcessTotals(changes.processTotals.newValue || {});
      }
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Build the gradient arcs and apply the fill in ONE pass that re-runs whenever
  // cpu/memory change. GradientPath replaces the original <path> with a <g> of
  // path-segments; a React re-render (e.g. when processTotals loads
  // asynchronously) can restore the <path> and drop those segments, so we
  // rebuild whenever they're missing rather than relying on segments surviving
  // across renders. `gaugeFillPercent` returns the percent of segments that stay
  // EMPTY (default color); segments at index >= percent show the gradient.
  useLayoutEffect(() => {
    const gradientColors = [
      { color: '#E30B66', pos: 0 },
      { color: '#E16B28', pos: 0.25 },
      { color: '#C6B146', pos: 0.5 },
      { color: '#81DE7D', pos: 0.75 },
      { color: '#00D1C5', pos: 1 }
    ];
    const defaultColor = '#243156';

    ["memory", "cpu"].forEach((id) => {
      const svg = document.getElementById(id);
      if (!svg) return;

      // jsdom doesn't implement SVG path geometry (getTotalLength /
      // getPointAtLength), so GradientPath throws there. No-op under jsdom — the
      // visual is covered by the codeyam screenshot, not unit tests.
      try {
        let segments = svg.getElementsByClassName('path-segment');
        if (segments.length === 0) {
          const pathElement = svg.querySelector('path');
          if (!pathElement) return;
          const path = new GradientPath({
            path: pathElement,
            segments: 100,
            samples: 3,
            precision: 2 // Optional
          });
          path.render({
            type: 'path',
            fill: gradientColors,
            stroke: gradientColors,
            width: 5,
            strokeWidth: 0.5
          });
          segments = svg.getElementsByClassName('path-segment');
          baseColors.current[id] = Array.from(segments, (s) => s.attributes.fill.value);
        }

        const colors = baseColors.current[id] || Array.from(segments, (s) => s.attributes.fill.value);
        const percent = gaugeFillPercent(state[id], base[id], max[id]);
        for (let i = 0; i < segments.length; ++i) {
          const color = i >= percent ? colors[i] : defaultColor;
          segments[i].attributes.fill.value = color;
          segments[i].attributes.stroke.value = color;
        }
      } catch {
        // jsdom / no-SVG-geometry environment — no-op; visual verified by capture.
      }
    });
  }, [state.cpu, state.memory]);

  return (
    <div className='LoadMeter'>
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <text
          x="100"
          y="90"
          textAnchor="middle"
          fill="#858CA1"
          style={{ fontSize: '15px', fontFamily: 'roboto' }}
        >Browser</text>
        <text
          x="100"
          y="105"
          textAnchor="middle"
          fill="#858CA1"
          style={{ fontSize: '15px', fontFamily: 'roboto' }}
        >Load</text>
        <text
          x="100"
          y="150"
          textAnchor="middle"
          fill="#858CA1"
          style={{ fontSize: '10px', fontFamily: 'roboto' }}
        >CPU</text>
        <text
          x="100"
          y="189"
          textAnchor="middle"
          fill="#858CA1"
          style={{ fontSize: '10px', fontFamily: 'roboto' }}
        >Memory</text>
        <svg id="memory" className='load-element'>
          <path
            fill="none"
            d="M 101.30893048279627 174.98857713672936 A 75 75 0 1 0 100 175"
          ></path>
        </svg>
        <svg id="cpu" className='load-element'>
          <path
            fill="none"
            d="M 101.04714438623702 159.99086170938347 A 60 60 0 1 0 100 160"
          ></path>
        </svg>
      </svg>
    </div>
  )
}

export default LoadMeter;
