import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// popup.js is a verbatim-ported vanilla (non-module) script: it declares
// top-level functions and wires a DOMContentLoaded listener. To exercise the
// functions without modifying the source, we read the file and evaluate it in
// a sloppy-mode Function wrapper with `chrome`/`document`/`window` injected,
// then return the top-level function declarations.
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
    storage: { local: { get: vi.fn() } },
  };
}

function loadPopup(chrome) {
  const code = fs.readFileSync(POPUP_PATH, 'utf8');
  const factory = new Function(
    'chrome',
    'document',
    'window',
    `${code}\n;return { init, loadActiveTabs, urlHTML, truncateString };`
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

  describe('truncateString', () => {
    // returns empty string for falsy input
    it('returns "" for empty/undefined input', () => {
      expect(popup.truncateString('', 10)).toBe('');
      expect(popup.truncateString(undefined, 10)).toBe('');
    });

    // leaves strings at or under the limit unchanged
    it('leaves short strings unchanged', () => {
      expect(popup.truncateString('hello', 10)).toBe('hello');
      expect(popup.truncateString('exactly10!', 10)).toBe('exactly10!');
    });

    // truncates longer strings and appends an ellipsis
    it('truncates long strings with an ellipsis', () => {
      expect(popup.truncateString('abcdefghijkl', 5)).toBe('abcde...');
    });
  });

  describe('urlHTML', () => {
    // renders the title heading and favicon, omitting stats when no samples
    it('renders title + favicon and no stats when samples is 0', () => {
      const html = popup.urlHTML({
        title: 'Example',
        favicon: 'fav.png',
        processes: { samples: 0 },
      });
      expect(html).toContain('Example');
      expect(html).toContain('fav.png');
      expect(html).not.toContain("class='stats'");
    });

    // includes an averaged stats block when there is at least one sample
    it('renders an averaged stats block when there are samples', () => {
      const html = popup.urlHTML({
        title: 'Busy Tab',
        favicon: 'f.png',
        processes: {
          samples: 2,
          network: 4,
          cpu: 10,
          privateMemory: 2128000,
          jsMemoryAllocated: 0,
          jsMemoryUsed: 0,
        },
      });
      expect(html).toContain("class='stats'");
      expect(html).toContain('CPU: 5'); // 10 / 2 samples
      expect(html).toContain('NET: 2'); // 4 / 2 samples
    });

    // truncates an over-long title inside the heading
    it('truncates long titles via truncateString', () => {
      const longTitle = 'x'.repeat(40);
      const html = popup.urlHTML({ title: longTitle, favicon: '', processes: { samples: 0 } });
      expect(html).toContain('...');
    });
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

  describe('loadActiveTabs', () => {
    // renders a row per stored active tab into the #active container
    it('renders a div per active tab', () => {
      const active = document.createElement('div');
      active.id = 'active';
      document.body.appendChild(active);

      chrome.storage.local.get
        .mockImplementationOnce((_key, cb) => cb({ activeTabs: [{ urlKey: 'url-a', tabKey: 'tab-3' }] }))
        .mockImplementationOnce((_keys, cb) =>
          cb({ 'url-a': { title: 'A', favicon: 'a.png', processes: { samples: 0 } } })
        );

      popup.loadActiveTabs();

      expect(document.getElementById('tab-3')).not.toBeNull();
      expect(active.children.length).toBe(1);
    });
  });
});
