import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import App from './App';

const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    // Leave globalThis.chrome in place: React flushes the effect-cleanup
    // (chrome.storage.onChanged.removeListener) on unmount during teardown.
    // beforeEach deletes + reinstalls a fresh shim for the next test.
    window.localStorage.clear();
  });

  // the sidebar logo always renders and the Home page (Tabs sections) shows by default
  it('renders the sidebar and the Home page by default', async () => {
    installChromeShim();
    render(<App />);

    expect(screen.getByAltText('TabCommand')).toBeInTheDocument();
    expect(await screen.findByText('Active Tabs')).toBeInTheDocument();
    expect(screen.getByText('Automatically Closed')).toBeInTheDocument();
  });

  // uxSettings.page selects which page renders — a non-HOME page shows its placeholder
  it('renders the page named by uxSettings.page', async () => {
    window.localStorage.setItem(
      'uxSettings',
      JSON.stringify({ page: { name: 'ImportExport' } })
    );
    installChromeShim();
    render(<App />);

    expect(await screen.findByText('Import / Export')).toBeInTheDocument();
    expect(screen.queryByText('Active Tabs')).not.toBeInTheDocument();
  });

  // clicking a sidebar destination writes uxSettings.page through Chrome.set
  it('changePage writes uxSettings.page when a sidebar link is clicked', async () => {
    installChromeShim();
    render(<App />);

    await userEvent.click(await screen.findByText('Import/Export'));

    await waitFor(async () => {
      const { uxSettings } = await get('uxSettings');
      expect(uxSettings.page).toEqual({ name: 'ImportExport' });
    });
  });

  // an external uxSettings change navigates the page (onChanged listener)
  it('navigates when uxSettings changes in storage', async () => {
    installChromeShim();
    render(<App />);
    expect(await screen.findByText('Active Tabs')).toBeInTheDocument();

    await new Promise((resolve) =>
      chrome.storage.local.set({ uxSettings: { page: { name: 'Load' } } }, resolve)
    );

    // The sidebar LoadMeter gauge also renders an SVG "Load" label, so target
    // the Load page's heading specifically rather than the ambiguous text.
    expect(await screen.findByRole('heading', { name: 'Load' })).toBeInTheDocument();
    expect(screen.queryByText('Active Tabs')).not.toBeInTheDocument();
  });
});
