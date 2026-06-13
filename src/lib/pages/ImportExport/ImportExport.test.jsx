import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import ImportExport from './ImportExport';

const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

// A readonly export textbox whose value contains the given needle.
const readonlyBoxContaining = (needle) =>
  screen.getAllByRole('textbox').find((b) => b.readOnly && b.value.includes(needle));

describe('ImportExport', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // the seeded labels serialize into the Current export textarea, sorted and url-resolved with notes preserved
  it('serializes the seeded labels into the Current export field', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-https://a.com'] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: ['url-https://b.com'] },
    });
    seed('url-https://a.com', { url: 'https://a.com', title: 'A site', favicon: '', notes: 'keep me' });
    seed('url-https://b.com', { url: 'https://b.com', title: 'B site', favicon: '' });
    installChromeShim();
    render(<ImportExport onComplete={() => {}} />);

    await waitFor(() => expect(readonlyBoxContaining('A site')).toBeTruthy());
    const current = readonlyBoxContaining('A site');
    // urls resolved with notes, urlKeys dropped, sorted by position (Work before Reading)
    expect(current.value).toContain('https://a.com');
    expect(current.value).toContain('keep me');
    expect(current.value).not.toContain('urlKeys');
    expect(current.value.indexOf('Work')).toBeLessThan(current.value.indexOf('Reading'));
  });

  // each previousLabels snapshot renders its own read-only Previous textarea
  it('renders a Previous textarea for each previousLabels snapshot', async () => {
    seed('labels', {});
    seed('url-https://old.com', { url: 'https://old.com', title: 'Old Page', favicon: '' });
    seed('previousLabels', [
      { Archive: { title: 'Archive', position: 0, urlKeys: ['url-https://old.com'] } },
    ]);
    installChromeShim();
    render(<ImportExport onComplete={() => {}} />);

    await waitFor(() => expect(readonlyBoxContaining('Archive')).toBeTruthy());
    expect(readonlyBoxContaining('Archive').value).toContain('https://old.com');
  });

  // pasting a valid export and clicking Import rebuilds labels + per-url objects and calls onComplete
  it('imports a valid export, writing labels and per-url objects then calling onComplete', async () => {
    const onComplete = vi.fn();
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, {
      target: {
        value: JSON.stringify([
          { title: 'Restored', backgroundColor: '#1873E4', position: 0, urls: [{ url: 'https://r.com', title: 'R', favicon: '', notes: 'n' }] },
        ]),
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Restored.urlKeys).toEqual(['url-https://r.com']);
    });
    const stored = await get('url-https://r.com');
    expect(stored['url-https://r.com']).toEqual({ url: 'https://r.com', title: 'R', favicon: '', notes: 'n' });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // a malformed-JSON import is swallowed: nothing is written, but onComplete still fires
  it('swallows a malformed-JSON import without writing, still calling onComplete', async () => {
    const onComplete = vi.fn();
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, { target: { value: '[{not valid json' } });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const { labels } = await get('labels');
    expect(labels).toEqual({});
  });
});
