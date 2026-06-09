import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import Tabs from './Tabs';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// Tabs renders Droppable/Draggable, which require a DragDropContext ancestor.
const renderTabs = () =>
  render(
    <DragDropContext onDragEnd={() => {}}>
      <Tabs />
    </DragDropContext>
  );

describe('Tabs', () => {
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

  // with no tabs, the Active Tabs section shows its explainer copy
  it('shows the empty-state explainer when there are no active tabs', async () => {
    installChromeShim();
    renderTabs();

    expect(
      await screen.findByText(/Active tabs that are not pinned in your browser will display here/i)
    ).toBeInTheDocument();
  });

  // seeded active tabs render as rows with their titles
  it('renders a row for each seeded active tab', async () => {
    seed('activeTabs', [{ urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false }]);
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    installChromeShim();
    renderTabs();

    expect(await screen.findByText('React')).toBeInTheDocument();
  });

  // browser-pinned tabs are filtered out of the active list
  it('excludes browser-pinned tabs from the active list', async () => {
    seed('activeTabs', [
      { urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false },
      { urlKey: 'url-https://pinned.com', tabKey: 'tab-2', pinned: true },
    ]);
    // Only the unpinned tab is in allUrls; the pinned tab is excluded from the
    // active list and (here) absent from History too, so it never renders.
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    seed('url-https://pinned.com', { title: 'Pinned Site', favicon: '' });
    installChromeShim();
    renderTabs();

    expect(await screen.findByText('React')).toBeInTheDocument();
    expect(screen.queryByText('Pinned Site')).not.toBeInTheDocument();
  });

  // labels split tabs into grouped headings vs an ungrouped remainder
  it('groups labeled tabs under headings and leaves the rest ungrouped', async () => {
    seed('activeTabs', [
      { urlKey: 'url-https://gh.com', tabKey: 'tab-1', pinned: false },
      { urlKey: 'url-https://hn.com', tabKey: 'tab-2', pinned: false },
    ]);
    seed('allUrls', ['url-https://gh.com', 'url-https://hn.com']);
    seed('url-https://gh.com', { title: 'GitHub', favicon: '' });
    seed('url-https://hn.com', { title: 'Hacker News', favicon: '' });
    seed('labels', {
      Work: { title: 'Work', color: '#1873E4', position: 0, urlKeys: ['url-https://gh.com'] },
    });
    installChromeShim();
    renderTabs();

    expect(await screen.findByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
  });

  // the History section is collapsed by default and expands when its title is clicked
  it('toggles the History section open when its title is clicked', async () => {
    installChromeShim();
    const { container } = renderTabs();

    const history = await screen.findByText('History');
    expect(container.querySelector('.Tabs-history.Tabs-section-collapsed')).toBeInTheDocument();

    await userEvent.click(history);

    await waitFor(() => {
      expect(container.querySelector('.Tabs-history.Tabs-section-collapsed')).not.toBeInTheDocument();
    });
  });
});
