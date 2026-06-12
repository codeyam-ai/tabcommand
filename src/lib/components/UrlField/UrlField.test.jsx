import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import UrlField from './UrlField';

describe('UrlField', () => {
  // renders the label text and the value inside a text input by default
  it('renders a labeled text input carrying the value', () => {
    render(<UrlField label="Title" name="title" value="Hello" onChange={() => {}} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    const input = screen.getByDisplayValue('Hello');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveClass('UrlDetails-form-title');
  });

  // multiline renders a textarea instead of an input, with the name-derived class
  it('renders a textarea when multiline is set', () => {
    render(<UrlField label="Notes" name="notes" value="a note" onChange={() => {}} multiline />);
    const field = screen.getByDisplayValue('a note');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveClass('UrlDetails-form-notes');
  });

  // typing into the field forwards each keystroke to onChange
  it('calls onChange as the user types', async () => {
    const onChange = vi.fn();
    render(<UrlField label="Url" name="url" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenCalled();
  });
});
