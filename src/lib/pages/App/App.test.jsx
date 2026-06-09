import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  // renders the empty shell with the TabCommand logo and the placeholder content
  it('renders the logo and the rebuild placeholder', () => {
    render(<App />);

    expect(screen.getByAltText('TabCommand')).toBeInTheDocument();
    expect(
      screen.getByText(/modern rebuild in progress/i)
    ).toBeInTheDocument();
  });
});
