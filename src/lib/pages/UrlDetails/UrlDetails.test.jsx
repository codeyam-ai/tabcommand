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
        notes: 'fresh note',
        edited: true
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

  // editing the url re-keys the record: the new url-key holds the record and the old key is gone
  it('editing the url migrates the record to the new key', async () => {
    seedUrl({ notes: '' });
    seedLabels({ Work: { title: 'Work', urlKeys: [urlKey] } });
    window.localStorage.setItem('allUrls', JSON.stringify([urlKey]));
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    const urlField = await screen.findByDisplayValue('https://github.com/codeyam/tabcommand');
    await userEvent.clear(urlField);
    await userEvent.type(urlField, 'https://github.com/codeyam/tabcommand-v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const newKey = 'url-https://github.com/codeyam/tabcommand-v2';
    await waitFor(async () => {
      const stored = await get([newKey, urlKey, 'allUrls', 'labels']);
      expect(stored[newKey]).toMatchObject({ url: 'https://github.com/codeyam/tabcommand-v2' });
      expect(stored[urlKey]).toBeUndefined();                 // old key deleted
      expect(stored.allUrls).toEqual([newKey]);               // list migrated in place
      expect(stored.labels.Work.urlKeys).toEqual([newKey]);   // group membership migrated
    });
  });

  // editing only the #fragment keeps the same key: the record updates in place, nothing is duplicated
  it('editing only the fragment updates in place', async () => {
    seedUrl({ notes: '' });
    seedLabels({});
    window.localStorage.setItem('allUrls', JSON.stringify([urlKey]));
    installChromeShim();
    render(<UrlDetails urlKey={urlKey} />);

    const urlField = await screen.findByDisplayValue('https://github.com/codeyam/tabcommand');
    await userEvent.clear(urlField);
    await userEvent.type(urlField, 'https://github.com/codeyam/tabcommand#readme');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const stored = await get([urlKey, 'allUrls']);
      expect(stored[urlKey]).toMatchObject({ url: 'https://github.com/codeyam/tabcommand#readme' });
      expect(stored.allUrls).toEqual([urlKey]);               // unchanged, no duplicate
    });
  });
});
