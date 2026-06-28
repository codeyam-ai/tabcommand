import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import LabelCollection from './LabelCollection';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

// LabelCollection renders Droppable/Draggable, which require a DragDropContext.
const renderCollection = (props) =>
  render(
    <DragDropContext onDragEnd={() => {}}>
      <LabelCollection draggable={false} index={0} {...props} />
    </DragDropContext>
  );

describe('LabelCollection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // the group renders its title bar and a row for each member url
  it('renders the group title and its member urls', async () => {
    seed('url-a', { title: 'Alpha', favicon: '' });
    seed('url-b', { title: 'Beta', favicon: '' });
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#1873E4', urlKeys: ['url-a', 'url-b'] });

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(await screen.findByText('Beta')).toBeInTheDocument();
  });

  // members split into active (have an open tab) above inactive (saved only)
  it('splits members into active and inactive sections', async () => {
    seed('activeTabs', [{ urlKey: 'url-open', tabKey: 'tab-1', pinned: false }]);
    seed('url-open', { title: 'OpenTab', favicon: '' });
    seed('url-saved', { title: 'SavedOnly', favicon: '' });
    installChromeShim();

    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: ['url-saved', 'url-open']
    });

    await screen.findByText('OpenTab');

    const active = container.querySelector('.LabelCollection-urls-active');
    const inactive = container.querySelector('.LabelCollection-urls-inactive');
    expect(active).toHaveTextContent('OpenTab');
    expect(active).not.toHaveTextContent('SavedOnly');
    expect(inactive).toHaveTextContent('SavedOnly');
    expect(inactive).not.toHaveTextContent('OpenTab');
  });

  // tabs sharing a title get a url subtitle; uniquely-titled tabs stay clean
  it('shows url subtitles only for tabs whose title collides with a sibling', async () => {
    seed('url-https://codeyam.com', { title: 'CodeYam', favicon: '' });
    seed('url-https://app.codeyam.com', { title: 'CodeYam', favicon: '' });
    seed('url-https://example.com', { title: 'Example', favicon: '' });
    installChromeShim();

    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: ['url-https://codeyam.com', 'url-https://app.codeyam.com', 'url-https://example.com']
    });

    await screen.findByText('Example');

    await waitFor(() => {
      const subtitles = [...container.querySelectorAll('.Url-subtitle')].map((el) => el.textContent);
      expect(subtitles.sort()).toEqual(['app.codeyam.com', 'codeyam.com']);
    });
    // the uniquely-titled row has no subtitle
    expect(container.querySelectorAll('.Url-subtitle')).toHaveLength(2);
  });

  // removing a url drops it from the group's urlKeys in storage
  it('removeUrl removes the url from the group urlKeys', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-a', 'url-b'] }
    });
    seed('url-a', { title: 'Alpha', favicon: '' });
    seed('url-b', { title: 'Beta', favicon: '' });
    installChromeShim();

    // expanded forces the per-url action icons (incl. the persistent ✕) to render
    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: ['url-a', 'url-b'],
      expanded: true
    });

    await screen.findByText('Alpha');

    const removeButtons = container.querySelectorAll('[data-tool-tip="Remove"]');
    // urlKeys are rendered in order → first remove button targets url-a
    await userEvent.click(removeButtons[0]);

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work.urlKeys).toEqual(['url-b']);
    });
  });
});
