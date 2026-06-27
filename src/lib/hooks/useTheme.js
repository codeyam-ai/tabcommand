import { useEffect, useState } from 'react';
import { Chrome } from '../utils/Chrome';

// Owns the light/dark theme: keeps the active theme in state, persists the
// user's choice to the `theme` storage key, and mirrors it to the document
// element's `data-theme` attribute, which the CSS custom-property token layer
// keys off of so the whole UI re-themes from one place. Dark is the default and
// the home of the CodeYam brand. Returns `[theme, toggleTheme]`.
export const useTheme = (initial = 'dark') => {
  const [theme, setTheme] = useState(initial);

  // Hydrate from storage on mount and follow cross-surface changes (the toggle
  // may live in a different component instance).
  useEffect(() => {
    Chrome.get('useTheme1', 'theme', ({ theme }) => {
      if (theme === 'light' || theme === 'dark') setTheme(theme);
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.theme) {
        const next = changes.theme.newValue;
        if (next === 'light' || next === 'dark') setTheme(next);
      }
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      Chrome.set('useTheme2', { theme: next });
      return next;
    });
  };

  return [theme, toggleTheme];
};

export default useTheme;
