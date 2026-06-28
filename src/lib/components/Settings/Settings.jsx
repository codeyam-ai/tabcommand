import './Settings.css';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chrome } from '../../utils/Chrome';
import { Icon } from '../Icon';
import SettingsSegment from './SettingsSegment';
import { WarnAtDefault, HeavyThresholdDefault, AutoCloseMinutes, ColumnsDefault, ThemePreferenceDefault } from '../../../Constants';
import formatAutoClose from '../../utils/formatAutoClose';

// A compact sidebar settings affordance: a gear button that expands sliders
// persisted to the `settings` storage key. `warnAt` drives the gauge/triage red
// state; `heavyThreshold` drives the Heaviest-Tabs filter + the triage "N heavy
// tabs" count. Both feed live off storage, so changing a slider re-colors the
// gauge and re-counts heavy tabs across the app.
//
// The "Warn at" and "Heavy tab ≥" sliders are per-tab-load controls, so they
// only make sense when we actually have per-tab data
// (`loadDataSource === 'processes'`, Chrome's Dev channel). On stable Chrome the
// source is 'system'/'none' and those two sliders do nothing useful, so they are
// hidden — the gear opens to just "Auto-close after", which is independent of
// per-tab data and always shows. Same loadDataSource gate that LoadPerTabNote /
// LoadMeterCaption / Triage follow.
const PANEL_WIDTH = 214;

const Settings = () => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [settings, setSettings] = useState({
    warnAt: WarnAtDefault,
    heavyThreshold: HeavyThresholdDefault,
    autoCloseMinutes: AutoCloseMinutes,
    columns: ColumnsDefault,
  });
  const [source, setSource] = useState(null);
  // The theme preference lives in its own `themePreference` storage key (owned by
  // useTheme), read/written directly here and kept in sync via onChanged.
  const [themePreference, setThemePreference] = useState(ThemePreferenceDefault);
  const buttonRef = useRef();

  useEffect(() => {
    Chrome.get('Settings1', ['settings', 'loadDataSource', 'themePreference'], ({ settings, loadDataSource, themePreference }) => {
      if (settings) setSettings((s) => ({ ...s, ...settings }));
      setSource(loadDataSource || null);
      if (themePreference === 'system' || themePreference === 'light' || themePreference === 'dark') {
        setThemePreference(themePreference);
      }
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.loadDataSource) setSource(changes.loadDataSource.newValue || null);
      if (changes.themePreference) {
        const next = changes.themePreference.newValue;
        if (next === 'system' || next === 'light' || next === 'dark') setThemePreference(next);
      }
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Anchor the panel to the gear via fixed positioning so the sidebar's
  // overflow (a scroll container) can't clip it. These are viewport coordinates
  // (from getBoundingClientRect), so the panel is rendered through a portal to
  // document.body (see render) — escaping the sidebar header's translateY
  // transform, which would otherwise become the containing block for the fixed
  // panel and apply these coords relative to the header instead of the viewport.
  // The gear lives at the very top of the sidebar header, so the panel opens
  // downward (the only direction with room) and is centered on the button's
  // horizontal midpoint, then clamped into the viewport so it never overflows
  // the left or right edge.
  const toggleOpen = () => {
    setOpen((o) => {
      if (!o && buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect();
        const left = r.left + r.width / 2 - PANEL_WIDTH / 2;
        setCoords({
          top: r.bottom + 6,
          left: Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8)),
        });
      }
      return !o;
    });
  };

  const update = (key, value) => {
    const next = { ...settings, [key]: Number(value) };
    setSettings(next);
    Chrome.set('Settings2', { settings: next });
  };

  // The theme preference is a string in its own storage key, separate from the
  // numeric `settings` bundle that `update` coerces with Number(...).
  const updateThemePreference = (value) => {
    setThemePreference(value);
    Chrome.set('Settings3', { themePreference: value });
  };

  return (
    <div className={`Settings ${open ? 'Settings-open' : ''}`}>
      <button
        ref={buttonRef}
        className="Settings-toggle"
        onClick={toggleOpen}
        aria-label="Load settings"
        title="Load settings"
      >
        <Icon name="settings" size={15} />
      </button>

      {open && createPortal(
        <div
          className="Settings-panel"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="Settings-row">
            <span className="Settings-label">Theme</span>
            <SettingsSegment
              ariaLabel="Theme"
              full
              value={themePreference}
              onChange={updateThemePreference}
              options={[
                { value: 'light', label: 'Day' },
                { value: 'dark', label: 'Night' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>
          {source === 'processes' && (
            <>
              <label className="Settings-row">
                <span className="Settings-label">Warn at</span>
                <span className="Settings-value">{settings.warnAt}%</span>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={settings.warnAt}
                  onChange={(e) => update('warnAt', e.target.value)}
                />
              </label>
              <label className="Settings-row">
                <span className="Settings-label">Heavy tab ≥</span>
                <span className="Settings-value">{settings.heavyThreshold}%</span>
                <input
                  type="range"
                  min="40"
                  max="90"
                  step="5"
                  value={settings.heavyThreshold}
                  onChange={(e) => update('heavyThreshold', e.target.value)}
                />
              </label>
            </>
          )}
          <label className="Settings-row">
            <span className="Settings-label">Auto-close after</span>
            <span className="Settings-value">{formatAutoClose(settings.autoCloseMinutes)}</span>
            <input
              type="range"
              min="0"
              max="480"
              step="15"
              value={settings.autoCloseMinutes}
              onChange={(e) => update('autoCloseMinutes', e.target.value)}
            />
          </label>
          <div className="Settings-row">
            <span className="Settings-label">Group columns</span>
            <SettingsSegment
              ariaLabel="Group columns"
              value={settings.columns || ColumnsDefault}
              onChange={(n) => update('columns', n)}
              options={[2, 3, 4].map((n) => ({ value: n, label: n }))}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Settings;
