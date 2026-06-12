import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Search from './Search';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const seedLabelsAndUrls = () => {
  seed('labels', {
    Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-https://github.com/x'] },
    Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: ['url-https://react.dev/learn'] },
  });
  seed('url-https://github.com/x', { title: 'GitHub Repo', url: 'https://github.com/x', favicon: '', notes: '' });
  seed('url-https://react.dev/learn', { title: 'Quick Start React', url: 'https://react.dev/learn', favicon: '', notes: '' });
};

// Let the shim's async storage reads and minisearch's async url indexing settle
// before querying — the index is built off microtask callbacks in an effect.
const flushIndex = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

const type = (value) => fireEvent.change(document.getElementById('Search-Input'), { target: { value } });

describe('Search', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the resting search box renders its input
  it('renders the search input', () => {
    installChromeShim();
    render(<Search />);
    expect(document.getElementById('Search-Input')).toBeTruthy();
  });

  // a label-matching query surfaces the label under Groups
  it('shows a matching label in the results', async () => {
    seedLabelsAndUrls();
    installChromeShim();
    render(<Search />);
    await flushIndex();

    type('Read');
    expect(await screen.findByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  // a url-matching query surfaces the labeled url under Grouped URLs
  it('shows a matching labeled url in the results', async () => {
    seedLabelsAndUrls();
    installChromeShim();
    render(<Search />);
    await flushIndex();

    type('quick');
    expect(await screen.findByText('Grouped URLs')).toBeInTheDocument();
    expect(screen.getByText('Quick Start React')).toBeInTheDocument();
  });

  // a query with no matches still opens the overlay in its No Results state
  it('shows No Results for an unmatched query', async () => {
    seedLabelsAndUrls();
    installChromeShim();
    render(<Search />);
    await flushIndex();

    type('zzzznotthere');
    expect(await screen.findByText('No Results')).toBeInTheDocument();
  });

  // clearing the query closes the overlay
  it('hides the overlay when the query is cleared', async () => {
    seedLabelsAndUrls();
    installChromeShim();
    render(<Search />);
    await flushIndex();

    type('Read');
    await screen.findByText('Groups');
    type('');
    expect(screen.queryByText('Groups')).not.toBeInTheDocument();
  });

  // re-indexes when the labels storage key changes, surfacing the new label
  it('re-indexes when labels change', async () => {
    seedLabelsAndUrls();
    installChromeShim();
    render(<Search />);
    await flushIndex();

    await act(async () => {
      globalThis.chrome.storage.local.set({
        labels: {
          Travel: { title: 'Travel', backgroundColor: '#9334E2', position: 0, urlKeys: [] },
        },
      });
      await new Promise((r) => setTimeout(r, 30));
    });

    type('Trav');
    expect(await screen.findByText('Travel')).toBeInTheDocument();
  });
});
