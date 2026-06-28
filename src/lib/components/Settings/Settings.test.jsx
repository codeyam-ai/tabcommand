import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import Settings from './Settings';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const openPanel = async () => {
  render(<Settings />);
  // Let the loadDataSource read settle before opening so the gated rows reflect
  // the seeded source on first paint.
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByLabelText('Load settings'));
};

// Width of the popover panel, mirrored from Settings.jsx's PANEL_WIDTH — the
// anchor math centers a panel of this width on the gear.
const PANEL_WIDTH = 214;

// Open the panel with a stubbed gear rect + viewport width so the anchor math
// (which reads getBoundingClientRect / window.innerWidth, both zero in jsdom by
// default) runs against known geometry. Returns the portaled panel element.
const openPanelWithRect = async ({ left, width, top, bottom }, innerWidth = 1440) => {
  installChromeShim();
  render(<Settings />);
  await act(async () => { await Promise.resolve(); });
  const button = screen.getByLabelText('Load settings');
  button.getBoundingClientRect = () => ({
    left, width, top, bottom,
    right: left + width,
    height: bottom - top,
    x: left, y: top,
    toJSON: () => ({}),
  });
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true, writable: true });
  fireEvent.click(button);
  return document.querySelector('.Settings-panel');
};

// The gear expands a panel of sliders. "Warn at" and "Heavy tab ≥" are per-tab
// controls, so they show ONLY on the 'processes' loadDataSource (Chrome's Dev
// channel). "Auto-close after" is independent of per-tab data and always shows.
describe('Settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // Dev-channel source: all three sliders render, including the two per-tab controls.
  it('shows all three sliders on the processes source', async () => {
    seed('loadDataSource', 'processes');
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Warn at')).toBeInTheDocument();
    expect(screen.getByText('Heavy tab ≥')).toBeInTheDocument();
    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
  });

  // Stable Chrome (system source): the per-tab sliders hide; only Auto-close remains.
  it('hides the two load sliders on stable Chrome system source', async () => {
    seed('loadDataSource', 'system');
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
    expect(screen.queryByText('Warn at')).not.toBeInTheDocument();
    expect(screen.queryByText('Heavy tab ≥')).not.toBeInTheDocument();
  });

  // Unknown source (marker not yet written): treat as "no per-tab data" — hide the two load sliders.
  it('hides the two load sliders before the marker is known', async () => {
    seed('settings', { warnAt: 70, heavyThreshold: 60 });
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Auto-close after')).toBeInTheDocument();
    expect(screen.queryByText('Warn at')).not.toBeInTheDocument();
    expect(screen.queryByText('Heavy tab ≥')).not.toBeInTheDocument();
  });

  // The Day / Night / System theme control renders, independent of loadDataSource.
  it('renders the Day/Night/System theme control regardless of loadDataSource', async () => {
    seed('loadDataSource', 'system');
    installChromeShim();
    await openPanel();

    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Night' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  });

  // Defaults to System (pressed) when no preference is stored.
  it('defaults the theme control to System when no preference is stored', async () => {
    installChromeShim();
    await openPanel();

    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');
  });

  // The control reflects the currently stored preference.
  it('reflects the stored theme preference', async () => {
    seed('themePreference', 'dark');
    installChromeShim();
    await openPanel();

    expect(screen.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false');
  });

  // Selecting an option persists themePreference to storage.
  it('persists the selected theme preference to storage', async () => {
    installChromeShim();
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');

    await act(async () => { await Promise.resolve(); });
    await new Promise((resolve) =>
      chrome.storage.local.get('themePreference', ({ themePreference }) => {
        expect(themePreference).toBe('light');
        resolve();
      })
    );
  });

  // The gear sits at the top of the sidebar, so the panel opens DOWNWARD: its
  // top edge anchors 6px below the gear's bottom.
  it('anchors the panel top just below the gear', async () => {
    const panel = await openPanelWithRect({ left: 300, width: 30, top: 50, bottom: 80 });
    expect(panel.style.top).toBe('86px'); // bottom (80) + 6
  });

  // The panel is centered on the gear's horizontal midpoint: gear center is
  // left + width/2 = 315; subtracting half the panel width (107) gives 208.
  it('centers the panel on the gear horizontally', async () => {
    const panel = await openPanelWithRect({ left: 300, width: 30, top: 50, bottom: 80 });
    expect(panel.style.left).toBe('208px'); // 300 + 15 - 107
  });

  // A gear near the left edge would push a centered panel off-screen; the left
  // guard clamps the panel to a minimum of 8px from the viewport's left edge.
  it('clamps the panel to the left viewport edge', async () => {
    const panel = await openPanelWithRect({ left: 5, width: 30, top: 50, bottom: 80 });
    // 5 + 15 - 107 = -87, clamped up to 8.
    expect(panel.style.left).toBe('8px');
  });

  // A gear near the right edge would overflow; the right guard clamps the panel
  // so its right edge stays 8px inside the viewport: innerWidth - PANEL_WIDTH - 8.
  it('clamps the panel to the right viewport edge', async () => {
    const panel = await openPanelWithRect({ left: 1400, width: 30, top: 50, bottom: 80 }, 1440);
    // 1400 + 15 - 107 = 1308, clamped down to 1440 - 214 - 8 = 1218.
    expect(panel.style.left).toBe(`${1440 - PANEL_WIDTH - 8}px`);
  });

  // The panel renders through a portal to document.body so the sidebar header's
  // transform can't become its containing block (which would break fixed
  // positioning) — it must NOT be nested inside the .Settings wrapper.
  it('renders the panel in a portal outside the Settings wrapper', async () => {
    const panel = await openPanelWithRect({ left: 300, width: 30, top: 50, bottom: 80 });
    expect(panel).not.toBeNull();
    expect(panel.closest('.Settings')).toBeNull();
    expect(panel.parentElement).toBe(document.body);
  });

  // The Auto-close slider decouples raw position from the stored value: the
  // far-right notch (raw 495, one step past the 480-min max) is the Off
  // position. Dragging there persists autoCloseMinutes: 0 — the stored/disabled
  // value the Closer engine treats as off — not the raw 495.
  it('persists Off as autoCloseMinutes 0 when the slider is dragged to the far-right notch', async () => {
    seed('settings', { autoCloseMinutes: 120 });
    installChromeShim();
    await openPanel();

    const slider = document.querySelector('.Settings-autoclose input[type="range"]');
    fireEvent.change(slider, { target: { value: '495' } });

    await act(async () => { await Promise.resolve(); });
    await new Promise((resolve) =>
      chrome.storage.local.get('settings', ({ settings }) => {
        expect(settings.autoCloseMinutes).toBe(0);
        resolve();
      })
    );
  });

  // A stored Off (autoCloseMinutes 0) parks the thumb at the far-right Off notch
  // (raw position 495), so Off reads as "past the max", not at the left end.
  it('positions the thumb at the far-right Off notch when autoCloseMinutes is 0', async () => {
    seed('settings', { autoCloseMinutes: 0 });
    installChromeShim();
    await openPanel();

    const slider = document.querySelector('.Settings-autoclose input[type="range"]');
    expect(slider.value).toBe('495');
  });

  // A stored positive interval maps the thumb directly to that minute value and
  // the readout formats it (120 -> "2 hr").
  it('positions the thumb at the stored minute value when auto-close is on', async () => {
    seed('settings', { autoCloseMinutes: 120 });
    installChromeShim();
    await openPanel();

    const slider = document.querySelector('.Settings-autoclose input[type="range"]');
    expect(slider.value).toBe('120');
    expect(screen.getByText('2 hr')).toBeInTheDocument();
  });
});
