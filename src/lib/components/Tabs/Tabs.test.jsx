import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import { setDragActive } from '../../utils/dragHoverStore';
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
    // The drag store is a module-level singleton; a test that leaves a drag
    // "in flight" would make the next test's updates silently buffer.
    setDragActive(false);
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

  // Regression: `labels` is in chrome.storage.sync and the areas fire SEPARATE
  // onChanged events, so the blanket `areaName !== 'local'` guard this listener
  // used to open with dropped every labels change — the sidebar kept a deleted
  // group's heading until a full reload.
  it('drops a deleted group heading on a sync-area labels change', async () => {
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

    await screen.findByText('Work');

    await act(async () => {
      globalThis.chrome.storage.sync.set({ labels: {} });
    });

    await waitFor(() => expect(screen.queryByText('Work')).not.toBeInTheDocument());
    // its tab is not lost — it falls back into the Ungrouped remainder
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  // in Active Tabs, grouped label headings render before the Ungrouped remainder
  it('renders grouped labels before the Ungrouped block in Active Tabs', async () => {
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
    const { container } = renderTabs();

    await screen.findByText('Work');
    // Scope to the Active Tabs section so the Automatically Closed section's
    // own Ungrouped block can't confuse the ordering assertion.
    const activeSection = container.querySelector('.Tabs-active');
    const headings = Array.from(
      activeSection.querySelectorAll('.Tabs-section-labelTitle')
    ).map((h) => h.textContent);

    expect(headings).toEqual(['Work', 'Ungrouped']);
    expect(headings.indexOf('Work')).toBeLessThan(headings.indexOf('Ungrouped'));
  });

  // a background storage write must not remount the sidebar's draggable rows —
  // a remount mid-drag is what cancels the drag and strands the dragged row.
  // The newly-rendered second row is the settle signal: once it exists the
  // re-render has definitively happened, so the identity check below is not
  // racing it.
  it('keeps the sidebar row mounted across a background storage update', async () => {
    seed('activeTabs', [{ urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false }]);
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    seed('url-https://vitest.dev', { title: 'Vitest', favicon: '' });
    installChromeShim();
    renderTabs();

    const rowBefore = (await screen.findByText('React')).closest('.Url');

    await new Promise((resolve) =>
      chrome.storage.local.set(
        {
          activeTabs: [
            { urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false },
            { urlKey: 'url-https://vitest.dev', tabKey: 'tab-2', pinned: false },
          ],
        },
        resolve
      )
    );

    // The re-render has landed...
    await screen.findByText('Vitest');

    // ...and it reconciled rather than tearing the existing row down. Declared
    // inside Tabs' body, this component was a new type per render, so React
    // replaced this node instead of keeping it.
    expect(screen.getByText('React').closest('.Url')).toBe(rowBefore);
  });

  // while a drag is in flight the rail must not re-order under the library:
  // an activeTabs write is buffered, then applied once the drag ends
  it('buffers an activeTabs update until the drag ends', async () => {
    seed('activeTabs', [{ urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false }]);
    seed('allUrls', ['url-https://react.dev']);
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    seed('url-https://vitest.dev', { title: 'Vitest', favicon: '' });
    installChromeShim();
    renderTabs();

    await screen.findByText('React');

    setDragActive(true);
    await new Promise((resolve) =>
      chrome.storage.local.set(
        {
          activeTabs: [
            { urlKey: 'url-https://react.dev', tabKey: 'tab-1', pinned: false },
            { urlKey: 'url-https://vitest.dev', tabKey: 'tab-2', pinned: false },
          ],
        },
        resolve
      )
    );

    // Give the write every chance to render: the shim's callbacks are
    // microtasks and Tabs re-reads storage, so a macrotask turn is well past
    // when an unbuffered update would have painted. Without the freeze the row
    // is on screen by now.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Still frozen: the rail has not re-ordered under the in-flight drag.
    expect(screen.queryByText('Vitest')).not.toBeInTheDocument();

    setDragActive(false);

    // Drag over — the buffered update lands.
    expect(await screen.findByText('Vitest')).toBeInTheDocument();
  });

  // the footer History button navigates to the History page via uxSettings
  it('navigates to the History page when the footer button is clicked', async () => {
    seed('uxSettings', { page: { name: 'Home' } });
    installChromeShim();
    renderTabs();

    const history = await screen.findByRole('button', { name: 'History' });
    await userEvent.click(history);

    await waitFor(() => {
      const uxSettings = JSON.parse(window.localStorage.getItem('uxSettings'));
      expect(uxSettings.page).toEqual({ name: 'History' });
    });
  });
});
