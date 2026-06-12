import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import UrlLabel from './UrlLabel';

describe('UrlLabel', () => {
  // renders the group title in a button whose value carries the title
  it('renders the label title', () => {
    render(<UrlLabel title="Work" onRemove={() => {}} />);
    const button = screen.getByRole('button', { name: /Work/ });
    expect(button).toHaveValue('Work');
  });

  // clicking the chip calls onRemove so the page can remove the url from the group
  it('calls onRemove when clicked', async () => {
    const onRemove = vi.fn();
    render(<UrlLabel title="Reading" onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: /Reading/ }));
    expect(onRemove).toHaveBeenCalled();
  });

  // the close icon is rendered alongside the title
  it('renders a remove icon', () => {
    const { container } = render(<UrlLabel title="Starred" onRemove={() => {}} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
