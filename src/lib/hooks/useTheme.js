import { useEffect, useState } from 'react';

// Owns the light/dark theme: keeps the active theme in state and mirrors it to
// the document element's `data-theme` attribute, which the CSS custom-property
// token layer keys off of so the whole UI re-themes from one place.
// Returns `[theme, toggleTheme]`.
export const useTheme = (initial = 'light') => {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return [theme, toggleTheme];
};

export default useTheme;
