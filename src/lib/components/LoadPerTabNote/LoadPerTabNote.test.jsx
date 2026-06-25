import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LoadPerTabNote from './LoadPerTabNote';

const NOTE = /Per-tab CPU & memory needs Chrome/;

// The note explains that per-tab data is unavailable off Chrome's Dev channel.
// It branches on the loadDataSource marker: shown for 'system'/'none', hidden
// for 'processes' and before the marker is known.
describe('LoadPerTabNote', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // stable-Chrome 'system' source → the explanatory note is shown
  it('shows the note when the source is system', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('system'));
    installChromeShim();
    render(<LoadPerTabNote />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  // 'none' source → still unavailable, so the note is shown
  it('shows the note when the source is none', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('none'));
    installChromeShim();
    render(<LoadPerTabNote />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  // full-fidelity 'processes' source → per-tab data exists, so no note
  it('hides the note on the processes source', async () => {
    window.localStorage.setItem('loadDataSource', JSON.stringify('processes'));
    installChromeShim();
    const { container } = render(<LoadPerTabNote />);

    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  // no marker set (legacy state) → renders nothing, no throw
  it('renders nothing when no loadDataSource is set', async () => {
    installChromeShim();
    const { container } = render(<LoadPerTabNote />);

    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });
});
