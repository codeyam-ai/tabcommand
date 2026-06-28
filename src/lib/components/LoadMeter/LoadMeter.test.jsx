import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LoadMeter from './LoadMeter';

// The gauge's fill math lives in gaugeFillPercent / deriveGaugeTotals (unit
// tested separately). These tests cover the component wiring: it mounts and
// renders the two SVG rings under jsdom (plain stroke-dashoffset, no SVG path
// geometry), reads the seeded processTotals, and drives the rendered load %.
//
// The gauge now self-hides unless per-tab data is available
// (loadDataSource === 'processes'), so the rendering tests seed that source.
describe('LoadMeter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  const seedProcessesSource = () =>
    window.localStorage.setItem('loadDataSource', JSON.stringify('processes'));

  // the gauge renders its CPU and Mem legend labels
  it('renders the gauge legend labels', async () => {
    seedProcessesSource();
    installChromeShim();
    render(<LoadMeter />);
    expect(await screen.findByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Mem')).toBeInTheDocument();
  });

  // with no stored processTotals the gauge reads as Idle (rings on track)
  it('reads as Idle on first run', async () => {
    seedProcessesSource();
    installChromeShim();
    render(<LoadMeter />);
    expect(
      await screen.findByText('Idle', { selector: '.LoadMeter-value' })
    ).toBeInTheDocument();
  });

  // seeded processTotals drive the rendered load %: cpu 75 / 150 = 50%
  it('reflects seeded processTotals in the rendered load %', async () => {
    seedProcessesSource();
    window.localStorage.setItem(
      'processTotals',
      JSON.stringify({ cpu: 75, privateMemory: 1, jsMemoryUsed: 1 })
    );
    installChromeShim();
    render(<LoadMeter />);
    expect(await screen.findByText('50%', { selector: '.LoadMeter-value' })).toBeInTheDocument();
  });

  // a processTotals storage change updates the gauge: cpu 120 / 150 = 80%
  it('handles a processTotals storage change', async () => {
    seedProcessesSource();
    installChromeShim();
    render(<LoadMeter />);
    // Let the initial (deferred) read settle to Idle before the change arrives.
    await screen.findByText('Idle', { selector: '.LoadMeter-value' });

    await act(async () => {
      await new Promise((resolve) =>
        chrome.storage.local.set(
          { processTotals: { cpu: 120, privateMemory: 2, jsMemoryUsed: 2 } },
          resolve
        )
      );
    });

    expect(await screen.findByText('80%', { selector: '.LoadMeter-value' })).toBeInTheDocument();
  });

  // Self-hide gate: without per-tab data (stable Chrome 'system' / 'none' / no
  // marker) the whole gauge renders nothing, so it can be relocated to the footer
  // and simply disappear there when load data isn't tab-by-tab.
  it('renders nothing when loadDataSource is system without per-tab data', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('system'));
    window.localStorage.setItem(
      'processTotals',
      JSON.stringify({ cpu: 90, privateMemory: 3000000000, jsMemoryUsed: 0 })
    );
    installChromeShim();
    const { container } = render(<LoadMeter />);

    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
    expect(screen.queryByText('Whole-browser load')).not.toBeInTheDocument();
  });

  // No marker at all (legacy / pre-source state) also hides the gauge.
  it('renders nothing when no loadDataSource is set', async () => {
    installChromeShim();
    const { container } = render(<LoadMeter />);

    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });
});
