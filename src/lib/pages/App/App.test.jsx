import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    delete globalThis.chrome;
    window.localStorage.clear();
  });

  // renders the logo and the temporary diagnostic's empty-state counts
  it('renders the logo and zero seed counts when storage is empty', async () => {
    installChromeShim();
    render(<App />);

    expect(screen.getByAltText('TabCommand')).toBeInTheDocument();
    expect(
      await screen.findByText(/seeded: 0 labels · 0 active tabs · 0 urls/i)
    ).toBeInTheDocument();
  });

  // reflects seeded storage counts read through the shim + Chrome.get path
  it('shows non-zero counts when storage is seeded', async () => {
    window.localStorage.setItem('labels', JSON.stringify({ work: {}, personal: {} }));
    window.localStorage.setItem('activeTabs', JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]));
    window.localStorage.setItem('allUrls', JSON.stringify(['https://a.com', 'https://b.com']));
    installChromeShim();
    render(<App />);

    expect(
      await screen.findByText(/seeded: 2 labels · 3 active tabs · 2 urls/i)
    ).toBeInTheDocument();
  });
});
