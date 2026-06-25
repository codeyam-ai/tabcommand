import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LoadMeterCaption from './LoadMeterCaption';

// The source-aware caption is the honest label under the gauge. These tests
// cover its branching on the loadDataSource storage marker the service worker
// writes: none → no-data indicator, system → whole-browser label, processes /
// unknown → nothing.
describe('LoadMeterCaption', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // loadDataSource 'none' → explicit no-data indicator (the stable-Chrome bug
  // state, made legible instead of a silently-empty circle)
  it('renders the no-data indicator when loadDataSource is none', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('none'));
    installChromeShim();
    render(<LoadMeterCaption />);

    expect(await screen.findByText('No load data')).toBeInTheDocument();
  });

  // loadDataSource 'system' → whole-browser-load label (gauge, not per-tab)
  it('renders the whole-browser label when loadDataSource is system', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('system'));
    installChromeShim();
    render(<LoadMeterCaption />);

    expect(await screen.findByText('Whole-browser load')).toBeInTheDocument();
    expect(screen.queryByText('No load data')).not.toBeInTheDocument();
  });

  // loadDataSource 'processes' → no caption (full-fidelity path needs no label)
  it('renders nothing on the full-fidelity processes source', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('processes'));
    installChromeShim();
    const { container } = render(<LoadMeterCaption />);

    // give the async read a tick to resolve, then assert nothing rendered
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Whole-browser load')).not.toBeInTheDocument();
    expect(screen.queryByText('No load data')).not.toBeInTheDocument();
  });

  // no marker at all (legacy state) → nothing rendered, no throw
  it('renders nothing when no loadDataSource is set', async () => {
    installChromeShim();
    const { container } = render(<LoadMeterCaption />);

    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });

  // reacts to a live loadDataSource change (worker switches source mid-session)
  it('updates when loadDataSource changes from none to system', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('none'));
    installChromeShim();
    render(<LoadMeterCaption />);
    expect(await screen.findByText('No load data')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) =>
        chrome.storage.local.set({ loadDataSource: 'system' }, resolve)
      );
    });

    expect(await screen.findByText('Whole-browser load')).toBeInTheDocument();
    expect(screen.queryByText('No load data')).not.toBeInTheDocument();
  });
});
