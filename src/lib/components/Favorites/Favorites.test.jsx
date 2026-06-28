import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Favorites from './Favorites';

// Favorites reads allUrls + the matching url-* records from storage and renders
// the recency-leaning ranked list (scoring lives in rankFavorites, unit-tested
// separately). These tests cover the seeded-render path and the empty state.
describe('Favorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  const seed = (key, value) =>
    window.localStorage.setItem(key, JSON.stringify(value));

  // Seeded allUrls + url-* records render the Favorites header and ranked titles.
  it('renders the header and the ranked site titles', async () => {
    // newest-first recency order; equal visit counts so recency drives order.
    seed('allUrls', ['url-https://a.com', 'url-https://b.com', 'url-https://c.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 1 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 1 });
    seed('url-https://c.com', { title: 'Charlie', favicon: '', visitCount: 1 });
    installChromeShim();

    render(<Favorites />);

    expect(await screen.findByText('Favorites')).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  // The recency-leaning blend lets a heavily-visited older site outrank a barely-newer one.
  it('lets a frequently-visited older site climb above a barely-newer one', async () => {
    // Adjacent deep in a long recency list (tiny recency gap) but a large visit
    // gap, so the popular older site climbs above the barely-newer one.
    const filler = Array.from({ length: 80 }, (_, i) => `url-pad-${i}`);
    const allUrls = [...filler.slice(0, 30), 'url-https://fresh.com', 'url-https://popular.com', ...filler.slice(30)];
    seed('allUrls', allUrls);
    seed('url-https://fresh.com', { title: 'Fresh', favicon: '', visitCount: 0 });
    seed('url-https://popular.com', { title: 'Popular', favicon: '', visitCount: 40 });
    installChromeShim();

    render(<Favorites />);

    const items = await screen.findAllByText(/Fresh|Popular/);
    expect(items[0]).toHaveTextContent('Popular');
  });

  // A site open in a Chrome-pinned tab is excluded from Favorites (pinned tabs
  // are already always-available, so they shouldn't take a Favorites slot).
  it('excludes a site open in a Chrome-pinned tab', async () => {
    seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 1 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 1 });
    // Bravo is open in a pinned tab; Alpha in an unpinned one.
    seed('activeTabs', [
      { tabKey: 'tab-1', urlKey: 'url-https://a.com', pinned: false },
      { tabKey: 'tab-2', urlKey: 'url-https://b.com', pinned: true },
    ]);
    installChromeShim();

    render(<Favorites />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
  });

  // A urlKey listed in favoritesHidden (user-removed) is excluded from Favorites.
  it('excludes a site present in favoritesHidden', async () => {
    seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 1 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 1 });
    seed('favoritesHidden', ['url-https://a.com']);
    installChromeShim();

    render(<Favorites />);

    expect(await screen.findByText('Bravo')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  // Clicking the hover × writes the urlKey into favoritesHidden and the row
  // disappears, while a plain row click still opens/focuses the tab.
  it('removes a favorite via the × and still opens a tab on a plain row click', async () => {
    seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 1 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 1 });
    installChromeShim();
    const createSpy = vi.spyOn(globalThis.chrome.tabs, 'create');

    render(<Favorites />);

    // Plain click on the Alpha row opens a tab (no activeTabs entry → create).
    const alpha = await screen.findByText('Alpha');
    fireEvent.click(alpha);
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    // ...and a plain row click does NOT hide the favorite.
    expect(
      JSON.parse(window.localStorage.getItem('favoritesHidden') || 'null')
    ).toBeNull();

    // Clicking Bravo's × hides it: it lands in favoritesHidden and the row drops.
    const removeButtons = screen.getAllByLabelText('Remove from favorites');
    // Rows render in ranked order [Alpha, Bravo]; remove the second (Bravo).
    fireEvent.click(removeButtons[1]);

    await waitFor(() =>
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
    );
    expect(
      JSON.parse(window.localStorage.getItem('favoritesHidden'))
    ).toContain('url-https://b.com');
    // Alpha remains.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  // An empty allUrls renders nothing (no header), keeping a fresh install clean.
  it('renders nothing when there are no favorites', async () => {
    seed('allUrls', []);
    installChromeShim();

    const { container } = render(<Favorites />);
    await act(async () => { await Promise.resolve(); });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
  });
});
