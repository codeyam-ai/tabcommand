import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
