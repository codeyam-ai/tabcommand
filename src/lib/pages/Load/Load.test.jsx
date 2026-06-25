import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Load from './Load';

const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

describe('Load', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the URL list renders one card per active tab, titled from the seeded url object
  it('renders the active-tab URL list from storage', async () => {
    window.localStorage.setItem(
      'activeTabs',
      JSON.stringify([{ urlKey: 'url-https://news.ycombinator.com', tabKey: 'tab-1' }])
    );
    window.localStorage.setItem(
      'url-https://news.ycombinator.com',
      JSON.stringify({ title: 'Hacker News', favicon: '' })
    );
    installChromeShim();
    render(<Load />);

    const link = await screen.findByRole('link', { name: /Hacker News/ });
    // the href is derived from the storage key, stripping the `url-` prefix
    expect(link).toHaveAttribute('href', 'https://news.ycombinator.com');
  });

  // the Home link writes uxSettings.page back to Home through Chrome.set
  it('navigates home when the Home link is clicked', async () => {
    installChromeShim();
    render(<Load />);

    await userEvent.click(await screen.findByText('Home'));

    await waitFor(async () => {
      const { uxSettings } = await get('uxSettings');
      expect(uxSettings.page).toEqual({ name: 'Home' });
    });
  });

  // an empty activeTabs list renders the page heading with no URL cards (no throw)
  it('renders with no URL cards when there are no active tabs', async () => {
    installChromeShim();
    const { container } = render(<Load />);

    expect(await screen.findByRole('heading', { name: 'Load' })).toBeInTheDocument();
    expect(container.querySelectorAll('.Load-url').length).toBe(0);
  });

  // on a stable-Chrome ('system') source, the page explains that per-tab load is
  // unavailable so the empty per-tab area reads as intentional, not broken
  it('shows the per-tab-unavailable note when the source is not processes', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('system'));
    installChromeShim();
    render(<Load />);

    expect(
      await screen.findByText(/Per-tab CPU & memory needs Chrome/)
    ).toBeInTheDocument();
  });

  // on the full-fidelity processes source, no explanatory note is shown
  it('hides the per-tab note when per-tab data is available on processes', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('processes'));
    installChromeShim();
    render(<Load />);

    expect(await screen.findByRole('heading', { name: 'Load' })).toBeInTheDocument();
    expect(screen.queryByText(/Per-tab CPU & memory needs Chrome/)).not.toBeInTheDocument();
  });
});
