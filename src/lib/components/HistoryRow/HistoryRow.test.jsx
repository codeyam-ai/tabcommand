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
});
