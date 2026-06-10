import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import LabelFormContainer from './LabelFormContainer';

describe('LabelFormContainer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    installChromeShim();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // collapsed by default: the Add Group affordance shows but the form does not
  it('shows the Add Group affordance and hides the form when collapsed', () => {
    render(<LabelFormContainer />);

    expect(screen.getByText('Add Group')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Group Title')).not.toBeInTheDocument();
  });

  // clicking the affordance expands the wrapper and reveals the LabelForm
  it('expands to reveal the LabelForm when clicked', async () => {
    render(<LabelFormContainer />);

    await userEvent.click(screen.getByText('Add Group'));

    expect(screen.getByPlaceholderText('Group Title')).toBeInTheDocument();
  });

  // the expand prop renders the form open on mount
  it('renders expanded when the expand prop is set', () => {
    render(<LabelFormContainer expand={true} />);

    expect(screen.getByPlaceholderText('Group Title')).toBeInTheDocument();
  });
});
