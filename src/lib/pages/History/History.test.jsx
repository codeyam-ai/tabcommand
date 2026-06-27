import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import { Pages } from '../../../Constants';
import History from './History';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// History reads allUrls/autoClosed/labels, buckets each closed tab by day, and
// offers a back button that routes to Home via uxSettings. These cover the page
// render (empty + grouped) and the `back` navigation helper.
describe('History', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // with nothing stored, the page shows its empty-state line
  it('shows the empty state when there is no history', async () => {
    installChromeShim();
    render(<History />);
    expect(await screen.findByText('No history yet.')).toBeInTheDocument();
  });

  // a tab closed just now renders under the "Today" group with its title
  it('groups a recently closed tab under Today', async () => {
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    seed('autoClosed', { 'url-https://react.dev': { time: Date.now() } });
    installChromeShim();
    render(<History />);

    expect(await screen.findByText('React')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  // the back button returns to the Home page via uxSettings
  it('navigates back to Home when the back button is clicked', async () => {
    seed('uxSettings', { page: { name: Pages.HISTORY } });
    installChromeShim();
    render(<History />);

    await userEvent.click(await screen.findByRole('button', { name: /Home/i }));

    await waitFor(() => {
      const uxSettings = JSON.parse(window.localStorage.getItem('uxSettings'));
      expect(uxSettings.page.name).toBe(Pages.HOME);
    });
  });
});
