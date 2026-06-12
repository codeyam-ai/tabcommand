import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Url from './Url';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
// Process samples chosen to land on each load level. summarizeProcessLoad averages:
//   cpuAvg = cpu/100/samples, memAvg = privateMemory/1064000/samples
// Levels: excessive (cpu>54||mem>600), high (>36||>400), medium (>18||>200), else low.
const procFor = (cpuAvg, memAvg, samples = 10) => ({
  samples, network: 1000,
  cpu: cpuAvg * 100 * samples,
  privateMemory: Math.round(memAvg * 1064000 * samples),
  jsMemoryAllocated: 1, jsMemoryUsed: 1,
});
const excessiveProcesses = procFor(48, 720); // mem>600 -> excessive
const mediumProcesses = procFor(26, 150);    // cpu>18 -> medium
const lowProcesses = procFor(8, 130);        // below all thresholds -> low

describe('Url', () => {
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

  // renders the stored title and a favicon image
  it('renders the title and favicon for a seeded url', async () => {
    seed('url-https://react.dev/learn', { title: 'Quick Start – React', favicon: '' });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://react.dev/learn" />);

    expect(await screen.findByText('Quick Start – React')).toBeInTheDocument();
    expect(container.querySelector('.Url-title img')).toBeInTheDocument();
  });

  // with no stored title, the display falls back to the url derived from urlKey
  it('derives the display url from urlKey when there is no title', async () => {
    installChromeShim();
    render(<Url urlKey="url-https://example.com/page" />);

    expect(await screen.findByText('https://example.com/page')).toBeInTheDocument();
  });

  // process stats above the excessive thresholds render the excessive load indicator
  it('shows the excessive load indicator for heavy process stats', async () => {
    seed('url-https://mail.google.com', { title: 'Inbox', favicon: '', processes: excessiveProcesses });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://mail.google.com" showLoad={true} />);

    await screen.findByText('Inbox');
    await waitFor(() => {
      expect(container.querySelector('.Url-load-excessive')).toBeInTheDocument();
    });
  });

  // medium-range process stats render the medium load indicator
  it('shows the medium load indicator for moderate process stats', async () => {
    seed('url-https://news.ycombinator.com', { title: 'Hacker News', favicon: '', processes: mediumProcesses });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://news.ycombinator.com" showLoad={true} />);

    await screen.findByText('Hacker News');
    await waitFor(() => {
      expect(container.querySelector('.Url-load-medium')).toBeInTheDocument();
    });
  });

  // light process stats render the low load indicator
  it('shows the low load indicator for light process stats', async () => {
    seed('url-https://www.youtube.com', { title: 'YouTube', favicon: '', processes: lowProcesses });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://www.youtube.com" showLoad={true} />);

    await screen.findByText('YouTube');
    await waitFor(() => {
      expect(container.querySelector('.Url-load-low')).toBeInTheDocument();
    });
  });

  // with no process samples, the load indicator is hidden entirely
  it('hides the load indicator when there are no process samples', async () => {
    seed('url-https://example.org', { title: 'Example', favicon: '', processes: { samples: 0 } });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://example.org" showLoad={true} />);

    await screen.findByText('Example');
    expect(container.querySelector('.Url-load-hidden')).toBeInTheDocument();
    expect(container.querySelector('.Url-load-low')).not.toBeInTheDocument();
  });

  // returns an empty node when no urlKey is provided
  it('renders nothing meaningful without a urlKey', () => {
    installChromeShim();
    const { container } = render(<Url />);
    expect(container.querySelector('.Url')).not.toBeInTheDocument();
  });

  // hovering reveals the action row (edit, etc.)
  it('reveals the action row on hover', async () => {
    seed('url-https://react.dev', { title: 'React', favicon: '' });
    installChromeShim();
    const { container } = render(<Url urlKey="url-https://react.dev" />);

    await screen.findByText('React');
    expect(container.querySelector('[data-tool-tip="Edit/Annotate"]')).not.toBeInTheDocument();

    await userEvent.hover(container.querySelector('.Url'));

    expect(container.querySelector('[data-tool-tip="Edit/Annotate"]')).toBeInTheDocument();
  });
});
