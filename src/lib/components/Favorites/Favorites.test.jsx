import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Favorites from './Favorites';

// Favorites reads allUrls + the matching url-* records from storage and renders
// the frequency-first ranked list (scoring lives in rankFavorites, unit-tested
// separately). Seeded counts clear MIN_VISITS (2) so rows actually render. These
// tests cover the seeded-render path, exclusion/discount, removal, dedup, and the
// empty state.
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
    // newest-first recency order; equal visit counts so recency is the tiebreak.
    seed('allUrls', ['url-https://a.com', 'url-https://b.com', 'url-https://c.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 3 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 3 });
    seed('url-https://c.com', { title: 'Charlie', favicon: '', visitCount: 3 });
    installChromeShim();

    render(<Favorites />);

    expect(await screen.findByText('Favorites')).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  // Frequency-first: a heavily-visited older site outranks a barely-newer,
  // less-visited one.
  it('ranks a frequently-visited older site above a barely-newer one', async () => {
    seed('allUrls', ['url-https://fresh.com', 'url-https://popular.com']);
    seed('url-https://fresh.com', { title: 'Fresh', favicon: '', visitCount: 2 });
    seed('url-https://popular.com', { title: 'Popular', favicon: '', visitCount: 40 });
    installChromeShim();

    render(<Favorites />);

    const items = await screen.findAllByText(/Fresh|Popular/);
    expect(items[0]).toHaveTextContent('Popular');
  });

  // Two storage keys that normalize to the same site (trailing-slash variant)
  // render as a SINGLE collapsed row.
  it('collapses cosmetic URL duplicates into one row', async () => {
    seed('allUrls', ['url-https://dup.com/', 'url-https://dup.com']);
    seed('url-https://dup.com/', { title: 'Dup', favicon: '', visitCount: 1 });
    seed('url-https://dup.com', { title: 'Dup', favicon: '', visitCount: 1 });
    installChromeShim();

    render(<Favorites />);

    // Summed effective visits (1+1=2) clears MIN_VISITS; only one row renders.
    await waitFor(() => expect(screen.getAllByText('Dup')).toHaveLength(1));
  });

  // A site open in a Chrome-pinned tab is excluded entirely (pinned tabs are
  // already always-available, so they shouldn't take a Favorites slot).
  it('excludes a site open in a Chrome-pinned tab', async () => {
    seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 3 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 3 });
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

  // A site open in a NON-pinned tab has its in-progress visit discounted: visited
  // twice but open once → effective 1 < MIN_VISITS, so it drops out. A pinned tab
  // remains fully excluded (as above), and an unaffected site still renders.
  it('discounts a site open in a non-pinned tab below the threshold', async () => {
    seed('allUrls', ['url-https://open.com', 'url-https://closed.com']);
    seed('url-https://open.com', { title: 'OpenSite', favicon: '', visitCount: 2 });
    seed('url-https://closed.com', { title: 'ClosedSite', favicon: '', visitCount: 2 });
    seed('activeTabs', [
      { tabKey: 'tab-1', urlKey: 'url-https://open.com', pinned: false },
    ]);
    installChromeShim();

    render(<Favorites />);

    expect(await screen.findByText('ClosedSite')).toBeInTheDocument();
    expect(screen.queryByText('OpenSite')).not.toBeInTheDocument();
  });

  // A urlKey listed in favoritesHidden (user-removed) is excluded from Favorites.
  it('excludes a site present in favoritesHidden', async () => {
    seed('allUrls', ['url-https://a.com', 'url-https://b.com']);
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 3 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 3 });
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
    seed('url-https://a.com', { title: 'Alpha', favicon: '', visitCount: 3 });
    seed('url-https://b.com', { title: 'Bravo', favicon: '', visitCount: 3 });
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

  // A favorite open in a non-pinned tab (and still clearing the threshold after
  // the open-tab discount) renders with the Favorites-item--open cue class; a
  // closed favorite does not.
  it('marks an open favorite with the Favorites-item--open class', async () => {
    seed('allUrls', ['url-https://open.com', 'url-https://closed.com']);
    // 3 visits - 1 open discount = 2, still clears MIN_VISITS, so it renders.
    seed('url-https://open.com', { title: 'OpenSite', favicon: '', visitCount: 3 });
    seed('url-https://closed.com', { title: 'ClosedSite', favicon: '', visitCount: 3 });
    seed('activeTabs', [
      { tabKey: 'tab-1', urlKey: 'url-https://open.com', pinned: false },
    ]);
    installChromeShim();

    render(<Favorites />);

    const openRow = (await screen.findByText('OpenSite')).closest(
      '.Favorites-item'
    );
    const closedRow = screen.getByText('ClosedSite').closest('.Favorites-item');
    expect(openRow).toHaveClass('Favorites-item--open');
    expect(closedRow).not.toHaveClass('Favorites-item--open');
  });

  // The section fills up to 10 rows when that many sites qualify ("10 if
  // justified" — the limit was raised from 5).
  it('renders up to ten favorites when that many qualify', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `url-https://s${i}.com`);
    seed('allUrls', keys);
    keys.forEach((key, i) =>
      seed(key, { title: `Site ${i}`, favicon: '', visitCount: 5 })
    );
    installChromeShim();

    render(<Favorites />);

    await waitFor(() =>
      expect(screen.getAllByLabelText('Remove from favorites')).toHaveLength(10)
    );
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
