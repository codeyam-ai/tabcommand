import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
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

    expect(screen.getByLabelText('TabCommand')).toBeInTheDocument();
    expect(await screen.findByText('Active Tabs')).toBeInTheDocument();
    expect(screen.getByText('Automatically Closed')).toBeInTheDocument();
  });

  // Regression: `labels` is in chrome.storage.sync and the areas fire SEPARATE
  // onChanged events, so the blanket `areaName !== 'local'` guard this listener
  // used to open with dropped every labels change and froze the footer's group
  // count — it kept claiming the deleted group until a full reload.
  it('updates the footer group count on a sync-area labels change', async () => {
    window.localStorage.setItem(
      'labels',
      JSON.stringify({
        Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
        Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
      })
    );
    installChromeShim();
    const { container } = render(<App />);

    await waitFor(() =>
      expect(container.querySelector('.App-sidebar-counts')).toHaveTextContent('2 groups')
    );

    await act(async () => {
      globalThis.chrome.storage.sync.set({
        labels: {
          Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
        }
      });
    });

    await waitFor(() =>
      expect(container.querySelector('.App-sidebar-counts')).toHaveTextContent('1 group')
    );
  });

  // uxSettings.page selects which page renders — a non-HOME page shows its own content
  it('renders the page named by uxSettings.page', async () => {
    window.localStorage.setItem(
      'uxSettings',
      JSON.stringify({ page: { name: 'ImportExport' } })
    );
    installChromeShim();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Import / Export' })).toBeInTheDocument();
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

  // with no loadDataSource marker the gauge self-hides, so its wrapper (and its divider hairline) must not render either
  it('does not render the gauge wrapper when per-tab load data is unavailable', async () => {
    installChromeShim();
    const { container } = render(<App />);

    expect(await screen.findByText('Import/Export')).toBeInTheDocument();
    expect(container.querySelector('.App-gauge')).toBeNull();
  });

  // the counterpart: on the 'processes' source the wrapper IS rendered, so the gate is pinned in both directions
  it('renders the gauge wrapper when per-tab load data is available', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('processes'));
    installChromeShim();
    const { container } = render(<App />);

    expect(await screen.findByText('Import/Export')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.App-gauge')).not.toBeNull());
  });
});
