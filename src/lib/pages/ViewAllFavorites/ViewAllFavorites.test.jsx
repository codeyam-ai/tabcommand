import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import { Pages } from '../../../Constants';
import ViewAllFavorites from './ViewAllFavorites';

const seed = (key, value) =>
  window.localStorage.setItem(key, JSON.stringify(value));

// ViewAllFavorites reads allUrls/activeTabs/favoritesHidden plus the url-*
// records, ranks them with rankFavorites (Infinity limit, hiddenKeys flagged),
// and renders one FavoriteRow each. It offers a back button that routes to Home
// via uxSettings. These cover the empty state, a populated render, and the
// `back` navigation helper.
describe('ViewAllFavorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // with nothing stored, the page shows its empty-state line
  it('shows the empty state when there are no favorites', async () => {
    installChromeShim();
    render(<ViewAllFavorites />);
    expect(await screen.findByText(/No favorites yet/i)).toBeInTheDocument();
  });

  // a genuinely-visited site qualifies and renders with its title
  it('renders a qualifying favorite with its title', async () => {
    const now = Date.now();
    const day = 1000 * 60 * 60 * 24;
    seed('allUrls', ['url-https://react.dev/learn']);
    seed('url-https://react.dev/learn', {
      title: 'Quick Start — React',
      favicon: '',
      visits: [now - 2 * day, now - 1 * day, now - 60_000],
    });
    installChromeShim();
    render(<ViewAllFavorites />);

    expect(await screen.findByText('Quick Start — React')).toBeInTheDocument();
  });

  // the back button returns to the Home page via uxSettings
  it('navigates back to Home when the back button is clicked', async () => {
    seed('uxSettings', { page: { name: Pages.FAVORITES } });
    installChromeShim();
    render(<ViewAllFavorites />);

    await userEvent.click(await screen.findByRole('button', { name: /Home/i }));

    await waitFor(() => {
      const uxSettings = JSON.parse(window.localStorage.getItem('uxSettings'));
      expect(uxSettings.page.name).toBe(Pages.HOME);
    });
  });
});
