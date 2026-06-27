import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Triage from './Triage';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// A per-URL processes record whose load summarizes to a bar `width` (see
// summarizeProcessLoad): cpu/72 and mem/800, ×100. samples=10, cpu stored ×100
// and summed, privateMemory summed bytes.
const urlRecord = (cpu, memBytes) => ({
  title: 't',
  favicon: '',
  processes: { samples: 10, cpu: cpu * 100 * 10, privateMemory: memBytes, jsMemoryUsed: 1 },
});

// Triage derives the whole-browser load via `pct` (value -> clamped 0-100%) from
// the seeded processTotals, then `loadLevel` maps it onto the band that picks the
// card's title. Each case pins a processTotals.cpu that drives `pct` into a
// different band: warnAt defaults to 70, and the medium floor is 0.6 * 70 = 42%.
//
// The card also gates on the loadDataSource marker — it renders ONLY on the
// 'processes' source (per-tab data available). So every visible-state case seeds
// loadDataSource 'processes'; dedicated cases cover the hidden states.
describe('Triage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // cpu 10 / 150 ≈ 6.7% — below the 42% medium floor → "Comfortable"
  it('reads as Comfortable when load is well below warnAt', async () => {
    seed('loadDataSource', 'processes');
    seed('processTotals', { cpu: 10 });
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Comfortable')).toBeInTheDocument();
  });

  // cpu 75 / 150 = 50% — inside [42, 70) → "Getting busy"
  it('reads as Getting busy in the medium band', async () => {
    seed('loadDataSource', 'processes');
    seed('processTotals', { cpu: 75 });
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Getting busy')).toBeInTheDocument();
  });

  // cpu 120 / 150 = 80% — at/above warnAt 70, one tab over heavyThreshold → "Running hot" + CTA
  it('reads as Running hot with a CTA when a heavy tab is the culprit', async () => {
    seed('loadDataSource', 'processes');
    seed('processTotals', { cpu: 120 });
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    seed('activeTabs', [{ urlKey: 'url-a', tabKey: 't1' }]);
    seed('url-a', urlRecord(600, 8000000000)); // width well over 60 → heavy
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Running hot')).toBeInTheDocument();
    expect(await screen.findByText(/Review 1 heavy tab/)).toBeInTheDocument();
  });

  // High load on stable Chrome ('system' source) → card hidden entirely
  it('renders nothing when the source is not processes', async () => {
    seed('loadDataSource', 'system');
    seed('processTotals', { cpu: 120 });
    installChromeShim();
    const { container } = render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Running hot')).not.toBeInTheDocument();
  });

  // High load on the processes source but no tab over heavyThreshold (heavyCount
  // === 0) → suppress the "Running hot" alarm; nothing to point at
  it('suppresses Running hot when there is no culprit tab', async () => {
    seed('loadDataSource', 'processes');
    seed('processTotals', { cpu: 120 });
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    seed('activeTabs', [{ urlKey: 'url-a', tabKey: 't1' }]);
    seed('url-a', urlRecord(30, 3192000000)); // width ≈ 42 — below 60, not heavy
    installChromeShim();
    const { container } = render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Running hot')).not.toBeInTheDocument();
  });

  // No marker set (legacy state) → renders nothing, no throw
  it('renders nothing before the loadDataSource marker is known', async () => {
    seed('processTotals', { cpu: 120 });
    installChromeShim();
    const { container } = render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });
});
