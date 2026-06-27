import './Settings.css';

import React, { useEffect, useRef, useState } from 'react';
import { Chrome } from '../../utils/Chrome';
import { Icon } from '../Icon';
import { WarnAtDefault, HeavyThresholdDefault, AutoCloseMinutes } from '../../../Constants';
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
  });
  const [source, setSource] = useState(null);
  const buttonRef = useRef();

  useEffect(() => {
    Chrome.get('Settings1', ['settings', 'loadDataSource'], ({ settings, loadDataSource }) => {
      if (settings) setSettings((s) => ({ ...s, ...settings }));
      setSource(loadDataSource || null);
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.loadDataSource) setSource(changes.loadDataSource.newValue || null);
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Anchor the panel to the gear via fixed positioning so the sidebar's
  // overflow (a scroll container) can't clip it. Right-align to the gear, then
  // clamp into the viewport.
  const toggleOpen = () => {
    setOpen((o) => {
      if (!o && buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: r.bottom + 6,
          left: Math.max(8, r.right - PANEL_WIDTH),
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

      {open && (
        <div
          className="Settings-panel"
          style={{ top: coords.top, left: coords.left }}
        >
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
        </div>
      )}
    </div>
  );
};

export default Settings;
