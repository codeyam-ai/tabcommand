import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// popup.js is a vanilla (non-module) script: it declares a top-level `init`
// function and wires a DOMContentLoaded listener. To exercise `init` without
// modifying the source, we read the file and evaluate it in a sloppy-mode
// Function wrapper with `chrome`/`document`/`window` injected, then return the
// top-level function declaration.
const POPUP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'popup.js');

function makeChrome() {
  return {
    tabs: {
      WindowType: { NORMAL: 'normal' },
      query: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    runtime: { getURL: vi.fn((p) => `chrome-extension://abc/${p}`) },
  };
}

function loadPopup(chrome) {
  const code = fs.readFileSync(POPUP_PATH, 'utf8');
  const factory = new Function(
    'chrome',
    'document',
    'window',
    `${code}\n;return { init };`
  );
  return factory(chrome, window.document, window);
}

describe('popup.js', () => {
  let chrome;
  let popup;

  beforeEach(() => {
    document.body.innerHTML = '';
    chrome = makeChrome();
    popup = loadPopup(chrome);
  });

  describe('init', () => {
    // focuses the existing TabCommand tab when one is already open
    it('activates an existing TabCommand tab', () => {
      const url = 'chrome-extension://abc/index.html';
      chrome.runtime.getURL.mockReturnValue(url);
      chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 7, url }]));
      window.close = vi.fn();

      popup.init();

      expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true }, expect.any(Function));
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    // opens a new pinned TabCommand tab when none exists
    it('creates a pinned tab when none exists', () => {
      const url = 'chrome-extension://abc/index.html';
      chrome.runtime.getURL.mockReturnValue(url);
      chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'https://other.com' }]));
      window.close = vi.fn();

      popup.init();

      expect(chrome.tabs.create).toHaveBeenCalledWith({ url, index: 0, pinned: true });
    });
  });
});
