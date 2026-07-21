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

  // The mirror of the sidebar's one-click removal. A removed multi-page site must
  // render dimmed here whichever of its pages is currently representative, and one
  // "Bring back" must restore the WHOLE site — including any legacy `url-` entries
  // — or the site stays half-hidden with no dimmed row left to click.
  it('restores a removed multi-page site in a single Bring back click', async () => {
    const now = Date.now();
    const day = 1000 * 60 * 60 * 24;
    const visits = [now - 2 * day, now - 1 * day, now - 60_000];
    seed('allUrls', [
      'url-https://espn.com/nfl/story',
      'url-https://espn.com/',
      'url-https://b.com',
    ]);
    seed('url-https://espn.com/nfl/story', {
      title: 'ESPN Story',
      favicon: '',
      visits,
    });
    seed('url-https://espn.com/', { title: 'ESPN', favicon: '', visits });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visits });
    // The site's two storage forms at once: the bare site key a fresh removal
    // writes, plus a legacy page entry left over from an older install.
    seed('favoritesHidden', ['espn.com', 'url-https://espn.com/']);
    installChromeShim();

    render(<ViewAllFavorites />);

    // The site is flagged hidden even though its representative page key is not
    // itself the stored entry — that only holds because flagging is site-level.
    const row = (await screen.findByText('ESPN Story')).closest('.FavoriteRow');
    expect(row).toHaveClass('FavoriteRow--hidden');
    await userEvent.click(row.querySelector('.FavoriteRow-bringback'));

    // One click clears every entry for the site, so nothing keeps it hidden.
    await waitFor(() => {
      expect(
        JSON.parse(window.localStorage.getItem('favoritesHidden'))
      ).toEqual([]);
    });
    // ...so the row is no longer dimmed and has no Bring back left to click.
    await waitFor(() =>
      expect(
        document.querySelector('.FavoriteRow-bringback')
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('ESPN Story')).toBeInTheDocument();
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

  describe('reset favorites tracking', () => {
    const day = 1000 * 60 * 60 * 24;
    const seedRich = () => {
      const now = Date.now();
      seed('allUrls', ['url-https://react.dev/learn', 'url-https://news.ycombinator.com']);
      seed('url-https://react.dev/learn', {
        title: 'Quick Start — React',
        favicon: 'react-favicon',
        visitCount: 3,
        visits: [now - 2 * day, now - 1 * day, now - 60_000],
      });
      seed('url-https://news.ycombinator.com', {
        title: 'Hacker News',
        favicon: 'hn-favicon',
        visitCount: 4,
        visits: [now - 3 * day, now - 60_000],
      });
      seed('favoritesHidden', ['url-https://news.ycombinator.com']);
    };

    // The first click only reveals the confirm buttons — nothing is written yet,
    // so the destructive action always takes a deliberate second click.
    it('reveals the confirm buttons without writing storage', async () => {
      seedRich();
      installChromeShim();
      render(<ViewAllFavorites />);

      await userEvent.click(
        await screen.findByRole('button', { name: /Reset favorites tracking/i })
      );

      expect(
        screen.getByRole('button', { name: /Yes, reset everything/i })
      ).toBeInTheDocument();
      // The visit signal and hidden list are still intact (nothing cleared).
      const react = JSON.parse(window.localStorage.getItem('url-https://react.dev/learn'));
      expect(react.visits).toHaveLength(3);
      expect(react.visitCount).toBe(3);
      expect(JSON.parse(window.localStorage.getItem('favoritesHidden'))).toEqual([
        'url-https://news.ycombinator.com',
      ]);
    });

    // Confirming zeroes visits/visitCount on every url-* record and clears
    // favoritesHidden, while preserving title/favicon so History & Search stay
    // intact.
    it('clears the visit signal and hidden list on confirm, preserving other fields', async () => {
      seedRich();
      installChromeShim();
      render(<ViewAllFavorites />);

      await userEvent.click(
        await screen.findByRole('button', { name: /Reset favorites tracking/i })
      );
      await userEvent.click(
        screen.getByRole('button', { name: /Yes, reset everything/i })
      );

      await waitFor(() => {
        const react = JSON.parse(window.localStorage.getItem('url-https://react.dev/learn'));
        expect(react.visits).toEqual([]);
        expect(react.visitCount).toBe(0);
      });
      const react = JSON.parse(window.localStorage.getItem('url-https://react.dev/learn'));
      const hn = JSON.parse(window.localStorage.getItem('url-https://news.ycombinator.com'));
      // Every record is zeroed...
      expect(hn.visits).toEqual([]);
      expect(hn.visitCount).toBe(0);
      // ...but title/favicon (shared with History & Search) are preserved.
      expect(react.title).toBe('Quick Start — React');
      expect(react.favicon).toBe('react-favicon');
      expect(hn.title).toBe('Hacker News');
      // favoritesHidden is emptied so hidden favorites "come back" on reset.
      expect(JSON.parse(window.localStorage.getItem('favoritesHidden'))).toEqual([]);
    });

    // Cancel dismisses the confirm without touching storage.
    it('dismisses the confirm on Cancel without writing', async () => {
      seedRich();
      installChromeShim();
      render(<ViewAllFavorites />);

      await userEvent.click(
        await screen.findByRole('button', { name: /Reset favorites tracking/i })
      );
      await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      // Back to the single button, and the visit signal is untouched.
      expect(
        screen.getByRole('button', { name: /Reset favorites tracking/i })
      ).toBeInTheDocument();
      const react = JSON.parse(window.localStorage.getItem('url-https://react.dev/learn'));
      expect(react.visits).toHaveLength(3);
    });
  });
});
