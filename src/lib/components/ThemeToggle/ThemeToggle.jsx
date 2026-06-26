import './ThemeToggle.css';

import React from 'react';
import PropTypes from 'prop-types';

// Sun / moon glyphs for the theme toggle (Ant's icon set has no sun/moon). Kept
// as plain JSX render-constants rather than sub-components — they are static,
// propless glyphs, not a reusable component surface.
const moonGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const sunGlyph = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

// Light/dark toggle button. Shows the moon in light mode (click → dark) and the
// sun in dark mode (click → light). The current theme + toggle handler are owned
// by the parent (see `useTheme`).
const ThemeToggle = ({ theme, onToggle }) => (
  <button
    className="App-themeToggle"
    onClick={onToggle}
    title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    aria-label="Toggle light or dark mode"
  >
    {theme === 'light' ? moonGlyph : sunGlyph}
  </button>
);

ThemeToggle.propTypes = {
  theme: PropTypes.string,
  onToggle: PropTypes.func
};

export default ThemeToggle;
