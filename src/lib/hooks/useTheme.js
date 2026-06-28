import { useEffect, useState } from 'react';
import { Chrome } from '../utils/Chrome';
import { ThemePreferenceDefault } from '../../Constants';

// Owns the light/dark theme. Resolves the active theme from three inputs:
//   - `preference` — the user's saved choice ('system' | 'light' | 'dark'),
//     persisted to the `themePreference` storage key. 'system' follows the OS.
//   - `systemTheme` — the live OS prefers-color-scheme ('light' | 'dark'),
//     tracked via matchMedia (falls back to 'dark', the CodeYam home, when
//     matchMedia is unavailable, e.g. the chrome shim / jsdom test env).
//   - `override` — an in-memory, non-persisted temporary flip from the sun/moon
//     toggle. It survives within the open popup and is dropped on reopen; in
//     System mode a real OS day/night transition also clears it so the display
//     snaps back to following the system.
// Only the resolved value is mirrored to the document element's `data-theme`
// attribute, which the CSS token layer keys off of so the whole UI re-themes
// from one place. Returns `[theme, toggleTheme]` (theme = the resolved value),
// preserving the original public shape.
export const useTheme = (initial = 'dark') => {
  const [preference, setPreference] = useState(ThemePreferenceDefault);
  // Default the system theme to `initial` ('dark') so the resolved theme is
  // 'dark' synchronously before matchMedia/storage hydrate — matching the prior
  // default and keeping a fallback when matchMedia is absent.
  const [systemTheme, setSystemTheme] = useState(initial);
  const [override, setOverride] = useState(null);

  const resolvedTheme =
    override ?? (preference === 'system' ? systemTheme : preference);

  // Hydrate the preference from storage on mount and follow cross-surface
  // changes (the Settings panel writes `themePreference` from a different
  // component instance).
  useEffect(() => {
    Chrome.get('useTheme1', ['themePreference', 'theme'], ({ themePreference, theme }) => {
      if (themePreference === 'system' || themePreference === 'light' || themePreference === 'dark') {
        setPreference(themePreference);
      } else if (theme === 'light') {
        // Migrate an explicit legacy light choice to a Day preference, so a user
        // who previously toggled to light keeps it instead of jumping to System.
        // A stored 'dark' is indistinguishable from the hydration default, and
        // System resolves to dark via the matchMedia fallback anyway, so we leave
        // those users on the new System default (they match their OS).
        setPreference('light');
        Chrome.set('useTheme2', { themePreference: 'light' });
      }
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.themePreference) {
        const next = changes.themePreference.newValue;
        if (next === 'system' || next === 'light' || next === 'dark') {
          setPreference(next);
          setOverride(null);
        }
      }
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Track the OS prefers-color-scheme and follow live day/night transitions.
  // Guarded like Labels.jsx for environments without matchMedia, where we keep
  // the 'dark' fallback already seeded into systemTheme.
  useEffect(() => {
    if (!window.matchMedia) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mq.matches ? 'dark' : 'light');

    const handleSystemChange = (e) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
      // A real OS transition returns control to the system: drop any temporary
      // override so System mode snaps back to following the OS.
      setOverride(null);
    };
    mq.addEventListener('change', handleSystemChange);
    return () => mq.removeEventListener('change', handleSystemChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  // The sun/moon toggle is a temporary, non-persisted override: it flips the
  // displayed theme without changing the saved preference.
  const toggleTheme = () => {
    setOverride(resolvedTheme === 'light' ? 'dark' : 'light');
  };

  return [resolvedTheme, toggleTheme];
};

export default useTheme;
