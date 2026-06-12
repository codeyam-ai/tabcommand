import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadUrl from './LoadUrl';

describe('LoadUrl', () => {
  // the card shows the tab title linked out to the derived url in a new tab
  it('renders the title linked to the url', () => {
    render(<LoadUrl url={{ urlKey: 'url-https://news.ycombinator.com', url: 'https://news.ycombinator.com', title: 'Hacker News', favicon: 'https://news.ycombinator.com/favicon.ico' }} />);
    const link = screen.getByRole('link', { name: /Hacker News/ });
    expect(link).toHaveAttribute('href', 'https://news.ycombinator.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  // the seeded favicon is used when present
  it('uses the provided favicon', () => {
    const { container } = render(<LoadUrl url={{ urlKey: 'url-x', url: 'https://x.test', title: 'X', favicon: 'https://x.test/icon.png' }} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.test/icon.png');
  });

  // a missing favicon falls back to the bundled default image
  it('falls back to the default favicon when none is provided', () => {
    const { container } = render(<LoadUrl url={{ urlKey: 'url-y', url: 'https://y.test', title: 'Y', favicon: '' }} />);
    const src = container.querySelector('img').getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });

  // a tab with sampled process data shows its CPU/memory load readout + bar
  it('shows the per-tab load readout when processes data is present', () => {
    const { container } = render(
      <LoadUrl url={{ urlKey: 'url-z', url: 'https://z.test', title: 'Z', favicon: '', processes: { samples: 10, cpu: 48000, privateMemory: 7660800000, jsMemoryUsed: 1 } }} />
    );
    expect(screen.getByText(/CPU/)).toBeInTheDocument();
    expect(screen.getByText(/Memory/)).toBeInTheDocument();
    // heavy memory -> excessive severity class
    expect(container.querySelector('.Url-load-excessive')).toBeInTheDocument();
  });

  // a tab with no sampled data shows only the title (no load readout)
  it('omits the load readout when there is no sampled process data', () => {
    const { container } = render(
      <LoadUrl url={{ urlKey: 'url-w', url: 'https://w.test', title: 'W', favicon: '', processes: { samples: 0 } }} />
    );
    expect(container.querySelector('.Load-url-load')).toBeNull();
  });
});
