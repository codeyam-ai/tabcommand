import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import { readByArea } from '../../utils/storageAccess';
import ImportExport from './ImportExport';

// Read back through the area router rather than chrome.storage.local directly:
// `labels` lives in chrome.storage.sync now, so a hardcoded local read would
// come back empty no matter what the import wrote.
const get = (keys) => new Promise((resolve) => readByArea(keys, resolve));
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

  // The Current snapshot has its own Copy button, and it copies CURRENT — not
  // the first Previous row. The seeded Previous snapshot is deliberately
  // different content: if Current ever loses its own button again, the only
  // button reachable from the Current box would be a Previous one, and this
  // assertion is what catches that.
  it('copies the Current snapshot when its own Copy button is clicked', async () => {
    const writeText = vi.fn();
    // jsdom has no clipboard at all, so there is nothing to spy on — define it.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-https://a.com'] },
    });
    seed('url-https://a.com', { url: 'https://a.com', title: 'A site', favicon: '' });
    seed('url-https://old.com', { url: 'https://old.com', title: 'Old Page', favicon: '' });
    seed('previousLabels', [
      { Archive: { title: 'Archive', position: 0, urlKeys: ['url-https://old.com'] } },
    ]);
    installChromeShim();
    render(<ImportExport onComplete={() => {}} />);

    await waitFor(() => expect(readonlyBoxContaining('A site')).toBeTruthy());
    const current = readonlyBoxContaining('A site');

    // The Copy button that shares a SnapshotField with the Current box.
    const copy = current.parentElement.querySelector('button');
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledWith(current.value);
    expect(current.value).toContain('A site');
    expect(current.value).not.toContain('Old Page');
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

  // An unrecoverable import must SAY SO and keep the user on the page. This
  // used to log to a console the user cannot see and then call onComplete
  // anyway, so a failed import closed the page exactly as a successful one did
  // and was indistinguishable from a success that happened to do nothing.
  it('shows an error and keeps the page open when the snapshot cannot be read', async () => {
    const onComplete = vi.fn();
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, { target: { value: '{ not valid json at all ' } });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('could not be read');
    expect(onComplete).not.toHaveBeenCalled();

    const { labels } = await get('labels');
    expect(labels).toEqual({});
  });

  // The pasted text is the thing the user needs in front of them to recover, so
  // a failure must not clear it.
  it('preserves the pasted snapshot after a failed import', async () => {
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={vi.fn()} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, { target: { value: '{ mangled ' } });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(importBox.value).toBe('{ mangled ');
  });

  // THE CONFIRMED REAL-WORLD FAILURE: a snapshot hard-wrapped by whatever medium
  // it was pasted through. It is restored, and the repair is NAMED — a silent
  // repair would leave the user believing a damaged backup is healthy.
  it('repairs a hard-wrapped snapshot and reports what it fixed', async () => {
    const onComplete = vi.fn();
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, {
      target: { value: '[{"title":"Restored","position":0,"urls":[{"url":"https://r.com","title":"R\nPage","favicon":""}]}]' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('line breaks inside titles');

    const { labels } = await get('labels');
    expect(labels.Restored).toBeTruthy();
    // Stays open so the account of the repair is actually read.
    expect(onComplete).not.toHaveBeenCalled();
  });

  // A permissive parse must not become a permissive import: this reads fine and
  // is not an export, so it must be refused rather than written as a partial
  // labels map over the groups the user still has.
  it('refuses readable JSON that is not an export without writing anything', async () => {
    const onComplete = vi.fn();
    seed('labels', { Keep: { title: 'Keep', position: 0, urlKeys: [] } });
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    const importBox = screen.getAllByRole('textbox').find((b) => !b.readOnly);
    fireEvent.change(importBox, { target: { value: '[1, 2, 3]' } });
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('not a TabCommand export');
    expect(onComplete).not.toHaveBeenCalled();

    const { labels } = await get('labels');
    expect(labels.Keep).toBeTruthy();
  });

  // An empty paste is not an error. There is nothing to do and nothing to
  // destroy, so the page must stay silent rather than alarm the user.
  it('does nothing at all for an empty paste', async () => {
    const onComplete = vi.fn();
    seed('labels', {});
    installChromeShim();
    render(<ImportExport onComplete={onComplete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
