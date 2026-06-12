import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import UrlDetails from './UrlDetails';

const urlKey = 'url-https://github.com/codeyam/tabcommand';
const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const seedUrl = (extra = {}) =>
  window.localStorage.setItem(
    urlKey,
    JSON.stringify({ title: 'GitHub', favicon: 'https://gh/icon.svg', notes: 'a note', processes: { samples: 0 }, ...extra })
  );
const seedLabels = (labels) => window.localStorage.setItem('labels', JSON.stringify(labels));

describe('UrlDetails', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the seeded title/url/favicon/notes hydrate the form fields
  it('renders the stored url fields into the form', async () => {
    seedUrl();
    seedLabels({});
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    expect(await screen.findByDisplayValue('GitHub')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://github.com/codeyam/tabcommand')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://gh/icon.svg')).toBeInTheDocument();
    expect(screen.getByDisplayValue('a note')).toBeInTheDocument();
  });

  // a Groups chip renders for every label that contains this urlKey, and only those
  it('renders a chip per label that contains the url', async () => {
    seedUrl();
    seedLabels({
      Work: { title: 'Work', urlKeys: [urlKey] },
      Starred: { title: 'Starred', urlKeys: [urlKey] },
      Other: { title: 'Other', urlKeys: ['url-other'] }
    });
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    // the chips live inside the "Groups" <label>, so query them by visible text
    expect(await screen.findByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Starred')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  // an unlabeled url renders no Groups chips
  it('renders no chips when the url belongs to no label', async () => {
    seedUrl();
    seedLabels({ Work: { title: 'Work', urlKeys: ['url-other'] } });
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    expect(await screen.findByDisplayValue('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
  });

  // editing notes and saving persists the four form fields and navigates home
  it('saves the edited url and returns home', async () => {
    seedUrl({ notes: '' });
    seedLabels({});
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    const notes = await screen.findByPlaceholderText('Notes');
    await userEvent.type(notes, 'fresh note');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const stored = await get(urlKey);
      expect(stored[urlKey]).toEqual({
        title: 'GitHub',
        url: 'https://github.com/codeyam/tabcommand',
        favicon: 'https://gh/icon.svg',
        notes: 'fresh note'
      });
    });

    const { uxSettings } = await get('uxSettings');
    expect(uxSettings.page.name).toBe('Home');
    expect(uxSettings.urlKey).toBeUndefined();
  });

  // saving with the notes field left empty omits the notes key entirely
  it('omits notes when the field is left empty', async () => {
    seedUrl({ notes: '' });
    seedLabels({});
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const stored = await get(urlKey);
      expect(stored[urlKey]).toBeTruthy();
      expect('notes' in stored[urlKey]).toBe(false);
    });
  });
});
