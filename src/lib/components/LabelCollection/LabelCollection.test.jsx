import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import { readByArea } from '../../utils/storageAccess';
import LabelCollection from './LabelCollection';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
// Read back through the area router rather than chrome.storage.local directly:
// `labels` lives in chrome.storage.sync now, so a hardcoded local read would
// come back empty no matter what the component wrote.
const get = (keys) => new Promise((resolve) => readByArea(keys, resolve));

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

  // Reproduction: the group row's ✕ means "un-file this page", so it must ask
  // about the GROUP and nothing else. The old flow asked a second question —
  // "Also delete … from your history entirely?" — on every single removal, and
  // one stray Enter on that dialog destroyed the page's history.
  it('does not offer to delete the url from history', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-a', 'url-b'] }
    });
    seed('url-a', { title: 'Alpha', favicon: '' });
    seed('url-b', { title: 'Beta', favicon: '' });
    seed('allUrls', ['url-a', 'url-b']);
    installChromeShim();

    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: ['url-a', 'url-b'],
      expanded: true
    });

    await screen.findByText('Alpha');
    await userEvent.click(container.querySelectorAll('[data-tool-tip="Remove"]')[0]);

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work.urlKeys).toEqual(['url-b']);
    });

    // exactly one dialog, and it is the group question
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).not.toMatch(/history/i);
    // the page itself survives — no tombstone was written
    const { allUrls, deletedUrls } = await get(['allUrls', 'deletedUrls']);
    expect(allUrls).toContain('url-a');
    expect(deletedUrls || {}).not.toHaveProperty('url-a');
  });

  // the group menu control is a real button with a large enough hit target that a
  // near-miss cannot fall through to the header's expand/collapse handler
  it('renders the group menu control as a button with a large hit area', async () => {
    installChromeShim();

    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: []
    });

    const menuButton = await screen.findByRole('button', { name: 'Group menu' });
    expect(menuButton).toBeInTheDocument();
    expect(container.querySelector('.LabelCollection-menuButton')).toBe(menuButton);
  });

  // jsdom does no layout, so visual clipping can't be observed directly — assert
  // the structural fix instead: the open menu is portalled OUT of the card, whose
  // `overflow: hidden` is what cut it off.
  it('portals the open menu out of the clipping card', async () => {
    installChromeShim();

    const { container } = renderCollection({
      title: 'Work',
      backgroundColor: '#1873E4',
      urlKeys: []
    });

    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    expect(container.querySelector('.LabelCollection-menu')).toBeNull();
    expect(document.querySelector('.LabelCollection-menu')).not.toBeNull();
  });

  // clicking the dismiss overlay closes the menu (the overlay was previously an
  // unstyled, zero-height div, so outside clicks never reached it)
  it('dismisses the open menu when the overlay is clicked', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#1873E4', urlKeys: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));
    expect(document.querySelector('.LabelCollection-menu')).not.toBeNull();

    await userEvent.click(document.querySelector('.LabelCollection-overlay'));
    expect(document.querySelector('.LabelCollection-menu')).toBeNull();
  });

  // the card's title bar, which the preview repaints
  const titleBar = () => document.querySelector('.LabelCollection-title');

  // picking a swatch in the open edit form repaints the card behind it, before
  // anything is saved — editing a group used to be blind until Save remounted it
  it('previews a picked color on the card while the edit is unsaved', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    await userEvent.click(screen.getByLabelText('Use color #7c3aed'));

    await waitFor(() => expect(titleBar().style.backgroundColor).toBe('rgb(124, 58, 237)'));
    // nothing was saved, so storage still holds the committed color
    const { labels } = await get('labels');
    expect(labels).toBeUndefined();
  });

  // the pending name shows on the card header alongside the pending color
  it('previews a retyped title on the card header', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    const input = screen.getByPlaceholderText('Group Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Deep Work');

    await waitFor(() => expect(titleBar().textContent).toContain('Deep Work'));
  });

  // clearing the name previews as the committed title rather than a blank header
  it('falls back to the committed title when the name field is emptied', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    await userEvent.clear(screen.getByPlaceholderText('Group Title'));

    await waitFor(() => expect(titleBar().textContent).toContain('Work'));
  });

  // the revert guarantee, and the half most likely to regress: Cancel drops the
  // preview so the card returns to exactly what storage committed
  it('reverts the card to its committed appearance when the edit is cancelled', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    await userEvent.click(screen.getByLabelText('Use color #7c3aed'));
    const input = screen.getByPlaceholderText('Group Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Deep Work');
    await waitFor(() => expect(titleBar().style.backgroundColor).toBe('rgb(124, 58, 237)'));

    await userEvent.click(screen.getByText('Cancel'));

    await waitFor(() => expect(titleBar().style.backgroundColor).toBe('rgb(47, 125, 225)'));
    expect(titleBar().textContent).toContain('Work');
    expect(titleBar().textContent).not.toContain('Deep Work');
  });

  // the same revert through the click-outside path rather than the Cancel button
  it('reverts the card when the edit is dismissed via the overlay', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    await userEvent.click(screen.getByLabelText('Use color #7c3aed'));
    await waitFor(() => expect(titleBar().style.backgroundColor).toBe('rgb(124, 58, 237)'));

    await userEvent.click(document.querySelector('.LabelCollection-overlay'));

    await waitFor(() => expect(titleBar().style.backgroundColor).toBe('rgb(47, 125, 225)'));
  });

  // saving promotes the previewed color into the committed one in a single
  // update, so no frame repaints the old color between the write and the reload
  it('keeps the saved color on the card without flashing the old one', async () => {
    installChromeShim();

    renderCollection({ title: 'Work', backgroundColor: '#2f7de1', urlKeys: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Group menu' }));

    await userEvent.click(screen.getByLabelText('Use color #168f8f'));
    await userEvent.click(screen.getByText('Save'));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work.backgroundColor).toBe('#168f8f');
    });
    // the menu is closed and the card never fell back to the old blue
    expect(document.querySelector('.LabelCollection-menu')).toBeNull();
    expect(titleBar().style.backgroundColor).toBe('rgb(22, 143, 143)');
  });
});
