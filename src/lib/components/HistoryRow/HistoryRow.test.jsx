import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HistoryRow } from './index';

const baseRow = {
  urlKey: 'url-https://news.ycombinator.com',
  title: 'Hacker News',
  favicon: '',
  color: '#1e9e57',
  ts: new Date(2026, 5, 27, 9, 30).getTime(),
};

describe('HistoryRow', () => {
  // the row shows the tab title and a Reopen affordance
  it('renders the title and a Reopen button', () => {
    render(<HistoryRow row={baseRow} onReopen={() => {}} />);
    expect(screen.getByTitle('Hacker News')).toHaveTextContent('Hacker News');
    expect(screen.getByText(/Reopen/)).toBeInTheDocument();
  });

  // clicking Reopen calls back with the row's urlKey
  it('calls onReopen with the urlKey when Reopen is clicked', async () => {
    const onReopen = vi.fn();
    render(<HistoryRow row={baseRow} onReopen={onReopen} />);
    await userEvent.click(screen.getByText(/Reopen/));
    expect(onReopen).toHaveBeenCalledWith('url-https://news.ycombinator.com');
  });

  // clicking anywhere on the row (e.g. the title) reopens the tab
  it('calls onReopen when the row body is clicked', async () => {
    const onReopen = vi.fn();
    render(<HistoryRow row={baseRow} onReopen={onReopen} />);
    await userEvent.click(screen.getByTitle('Hacker News'));
    expect(onReopen).toHaveBeenCalledWith('url-https://news.ycombinator.com');
  });

  // the Reopen button stops propagation so the row handler does not double-fire
  it('reopens exactly once when the Reopen button is clicked', async () => {
    const onReopen = vi.fn();
    render(<HistoryRow row={baseRow} onReopen={onReopen} />);
    await userEvent.click(screen.getByText(/Reopen/));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  // the row is keyboard-reachable — Enter reopens the tab
  it('reopens the tab when Enter is pressed on the focused row', async () => {
    const onReopen = vi.fn();
    const { container } = render(<HistoryRow row={baseRow} onReopen={onReopen} />);
    container.querySelector('.HistoryRow').focus();
    await userEvent.keyboard('{Enter}');
    expect(onReopen).toHaveBeenCalledWith('url-https://news.ycombinator.com');
  });

  // Space also reopens the tab without scrolling the page
  it('reopens the tab when Space is pressed on the focused row', async () => {
    const onReopen = vi.fn();
    const { container } = render(<HistoryRow row={baseRow} onReopen={onReopen} />);
    container.querySelector('.HistoryRow').focus();
    await userEvent.keyboard('{ }');
    expect(onReopen).toHaveBeenCalledWith('url-https://news.ycombinator.com');
  });

  // a row without a timestamp simply omits the time, still rendering
  it('omits the timestamp when none is present', () => {
    const { container } = render(<HistoryRow row={{ ...baseRow, ts: null }} onReopen={() => {}} />);
    expect(container.querySelector('.HistoryRow-time')).toBeNull();
  });

  // no favicon falls back to a colored monogram tile (no broken image)
  it('falls back to a monogram tile when the site has no favicon', () => {
    const { container } = render(<HistoryRow row={baseRow} onReopen={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.Url-favFallback')).toBeInTheDocument();
  });

  // the delete affordance is opt-in, so every existing render site is unchanged
  it('renders no delete affordance when onDelete is not supplied', () => {
    const { container } = render(<HistoryRow row={baseRow} onReopen={() => {}} />);
    expect(container.querySelector('.HistoryRowActions-delete')).toBeNull();
  });

  // supplying onDelete adds the delete control beside Reopen
  it('renders a delete affordance when onDelete is supplied', () => {
    const { container } = render(
      <HistoryRow row={baseRow} onReopen={() => {}} onDelete={() => {}} />
    );
    expect(container.querySelector('.HistoryRowActions-delete')).toBeInTheDocument();
  });

  // deleting takes a deliberate SECOND click: the first only arms the confirm
  it('does not delete on the first click, only arming the confirm', async () => {
    const onDelete = vi.fn();
    const { container } = render(
      <HistoryRow row={baseRow} onReopen={() => {}} onDelete={onDelete} />
    );
    await userEvent.click(container.querySelector('.HistoryRowActions-delete'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector('.HistoryRowActions-confirmDelete')).toBeInTheDocument();
  });

  // confirming calls back with the row's urlKey — the actual delete
  it('calls onDelete with the urlKey once the confirm is clicked', async () => {
    const onDelete = vi.fn();
    const { container } = render(
      <HistoryRow row={baseRow} onReopen={() => {}} onDelete={onDelete} />
    );
    await userEvent.click(container.querySelector('.HistoryRowActions-delete'));
    await userEvent.click(container.querySelector('.HistoryRowActions-confirmDelete'));
    expect(onDelete).toHaveBeenCalledWith('url-https://news.ycombinator.com');
  });

  // cancelling backs out entirely: nothing deleted, row back to its resting state
  it('deletes nothing and restores Reopen when the confirm is cancelled', async () => {
    const onDelete = vi.fn();
    const { container } = render(
      <HistoryRow row={baseRow} onReopen={() => {}} onDelete={onDelete} />
    );
    await userEvent.click(container.querySelector('.HistoryRowActions-delete'));
    await userEvent.click(container.querySelector('.HistoryRowActions-cancel'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector('.HistoryRowActions-reopen')).toBeInTheDocument();
    expect(container.querySelector('.HistoryRowActions-confirmDelete')).toBeNull();
  });

  // the whole row reopens on click, so the delete controls MUST stop propagation
  // or arming/confirming a delete would also reopen the tab being deleted
  it('does not reopen the tab while arming or confirming a delete', async () => {
    const onReopen = vi.fn();
    const { container } = render(
      <HistoryRow row={baseRow} onReopen={onReopen} onDelete={() => {}} />
    );
    await userEvent.click(container.querySelector('.HistoryRowActions-delete'));
    await userEvent.click(container.querySelector('.HistoryRowActions-confirmDelete'));
    expect(onReopen).not.toHaveBeenCalled();
  });
});
