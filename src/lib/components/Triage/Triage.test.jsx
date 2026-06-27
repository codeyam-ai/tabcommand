import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Triage from './Triage';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// Triage derives the whole-browser load via `pct` (value -> clamped 0-100%) from
// the seeded processTotals, then `loadLevel` maps it onto the band that picks the
// card's title. Each case pins a processTotals.cpu that drives `pct` into a
// different band: warnAt defaults to 70, and the medium floor is 0.6 * 70 = 42%.
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
    seed('processTotals', { cpu: 10 });
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Comfortable')).toBeInTheDocument();
  });

  // cpu 75 / 150 = 50% — inside [42, 70) → "Getting busy"
  it('reads as Getting busy in the medium band', async () => {
    seed('processTotals', { cpu: 75 });
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Getting busy')).toBeInTheDocument();
  });

  // cpu 120 / 150 = 80% — at/above warnAt 70 → "Running hot"
  it('reads as Running hot at or above warnAt', async () => {
    seed('processTotals', { cpu: 120 });
    installChromeShim();
    render(<Triage reviewMode={false} onToggleReview={() => {}} />);
    expect(await screen.findByText('Running hot')).toBeInTheDocument();
  });
});
