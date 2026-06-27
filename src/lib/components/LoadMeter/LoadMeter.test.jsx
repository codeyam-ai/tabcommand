import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LoadMeter from './LoadMeter';

// The gauge's fill math lives in gaugeFillPercent / deriveGaugeTotals (unit
// tested separately). These tests cover the component wiring: it mounts and
// renders the two SVG rings under jsdom (plain stroke-dashoffset, no SVG path
// geometry), reads the seeded processTotals, and drives the rendered load %.
describe('LoadMeter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the gauge renders its CPU and Mem legend labels
  it('renders the gauge legend labels', async () => {
    installChromeShim();
    render(<LoadMeter />);
    expect(await screen.findByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Mem')).toBeInTheDocument();
  });

  // with no stored processTotals the gauge reads as Idle (rings on track)
  it('reads as Idle on first run', async () => {
    installChromeShim();
    render(<LoadMeter />);
    expect(
      await screen.findByText('Idle', { selector: '.LoadMeter-value' })
    ).toBeInTheDocument();
  });

  // seeded processTotals drive the rendered load %: cpu 75 / 150 = 50%
  it('reflects seeded processTotals in the rendered load %', async () => {
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

  // the source-aware caption (no-data / whole-browser) is its own component,
  // LoadMeterCaption — the gauge just composes it. The gauge still mounts and
  // renders the caption slot without throwing when a loadDataSource is present.
  it('mounts with a loadDataSource present without throwing', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('system'));
    window.localStorage.setItem(
      'processTotals',
      JSON.stringify({ cpu: 90, privateMemory: 3000000000, jsMemoryUsed: 0 })
    );
    installChromeShim();
    expect(() => render(<LoadMeter />)).not.toThrow();
    expect(await screen.findByText('Whole-browser load')).toBeInTheDocument();
  });
});
