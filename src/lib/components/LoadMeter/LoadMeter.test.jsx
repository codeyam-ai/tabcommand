import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LoadMeter from './LoadMeter';

// The gauge's fill math lives in gaugeFillPercent / deriveGaugeTotals (unit
// tested separately). These tests cover the component wiring: it mounts and
// renders under jsdom (where the GradientPath SVG work must no-op rather than
// throw), reads the seeded processTotals, and survives an onChanged update.
describe('LoadMeter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the gauge renders its CPU and Memory labels
  it('renders the gauge labels', () => {
    installChromeShim();
    render(<LoadMeter />);
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  // mounting with seeded processTotals reads the value without throwing under jsdom
  // (this exercises the jsdom guard around GradientPath — remove it and this fails)
  it('reads seeded processTotals on mount without throwing', () => {
    window.localStorage.setItem(
      'processTotals',
      JSON.stringify({ cpu: 75, privateMemory: 1, jsMemoryUsed: 1 })
    );
    installChromeShim();
    expect(() => render(<LoadMeter />)).not.toThrow();
  });

  // a processTotals storage change is handled without throwing and keeps rendering
  it('handles a processTotals storage change', async () => {
    installChromeShim();
    render(<LoadMeter />);

    await act(async () => {
      await new Promise((resolve) =>
        chrome.storage.local.set(
          { processTotals: { cpu: 120, privateMemory: 2, jsMemoryUsed: 2 } },
          resolve
        )
      );
    });

    expect(screen.getByText('CPU')).toBeInTheDocument();
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
