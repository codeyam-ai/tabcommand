import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Settings from './Settings';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const openPanel = async () => {
  render(<Settings />);
  // Let the loadDataSource read settle before opening so the gated rows reflect
  // the seeded source on first paint.
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByLabelText('Load settings'));
};

// The gear expands a panel of sliders. "Warn at" and "Heavy tab ≥" are per-tab
// controls, so they show ONLY on the 'processes' loadDataSource (Chrome's Dev
// channel). "Auto-close after" is independent of per-tab data and always shows.
describe('Settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // Dev-channel source: all three sliders render, including the two per-tab controls.
  it('shows all three sliders on the processes source', async () => {
    seed('loadDataSource', 'processes');
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Warn at')).toBeInTheDocument();
    expect(screen.getByText('Heavy tab ≥')).toBeInTheDocument();
    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
  });

  // Stable Chrome (system source): the per-tab sliders hide; only Auto-close remains.
  it('hides the two load sliders on stable Chrome system source', async () => {
    seed('loadDataSource', 'system');
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
    expect(screen.queryByText('Warn at')).not.toBeInTheDocument();
    expect(screen.queryByText('Heavy tab ≥')).not.toBeInTheDocument();
  });

  // Unknown source (marker not yet written): treat as "no per-tab data" — hide the two load sliders.
  it('hides the two load sliders before the marker is known', async () => {
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
    expect(screen.queryByText('Warn at')).not.toBeInTheDocument();
    expect(screen.queryByText('Heavy tab ≥')).not.toBeInTheDocument();
  });
});
