import { describe, expect, it } from 'vitest';

import { isTrackableUrl } from './isTrackableUrl';

describe('isTrackableUrl', () => {
  // A real website over http or https is the only trackable case — the core
  // positive contract the predicate exists to assert.
  it('accepts http and https websites', () => {
    expect(isTrackableUrl('https://example.com')).toBe(true);
    expect(isTrackableUrl('http://example.com/path?q=1')).toBe(true);
    expect(isTrackableUrl('https://sub.example.co.uk/a/b#frag')).toBe(true);
  });

  // about:blank is the specific junk this feature was built to stop recording,
  // so the about: scheme must be rejected.
  it('rejects about: pages including about:blank', () => {
    expect(isTrackableUrl('about:blank')).toBe(false);
    expect(isTrackableUrl('about:newtab')).toBe(false);
  });

  // Every other non-web scheme (file/chrome/data/view-source/devtools/etc.) is
  // excluded by the single http/https rule rather than a blocklist.
  it('rejects non-website schemes', () => {
    expect(isTrackableUrl('file:///Users/x/doc.html')).toBe(false);
    expect(isTrackableUrl('chrome://extensions')).toBe(false);
    expect(isTrackableUrl('chrome-extension://abc/page.html')).toBe(false);
    expect(isTrackableUrl('view-source:https://x.com')).toBe(false);
    expect(isTrackableUrl('data:text/html,hi')).toBe(false);
    expect(isTrackableUrl('devtools://devtools/bundled/x.html')).toBe(false);
  });

  // Defensive inputs (empty/whitespace/unparseable/non-string) must return false
  // rather than throwing, mirroring normalizeUrl's tolerant style.
  it('rejects empty, blank, unparseable, and non-string values', () => {
    expect(isTrackableUrl('')).toBe(false);
    expect(isTrackableUrl('   ')).toBe(false);
    expect(isTrackableUrl('not a url')).toBe(false);
    expect(isTrackableUrl(null)).toBe(false);
    expect(isTrackableUrl(undefined)).toBe(false);
    expect(isTrackableUrl(42)).toBe(false);
  });
});
