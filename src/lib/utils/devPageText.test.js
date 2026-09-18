import { describe, it, expect, afterEach } from 'vitest';
import devPageText from './devPageText';

describe('devPageText', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  // null means "this is the real extension — go and fetch it for real". It is
  // the branch that keeps the dev seam out of a packaged build entirely.
  it('returns null when the real chrome is present', () => {
    globalThis.chrome = { storage: { local: {} } };
    expect(devPageText('https://a.com')).toBeNull();
  });

  // a packaged extension always has `chrome`; its total absence means a unit
  // test or a non-browser context, where there is no dev corpus to serve either
  it('returns null when there is no chrome at all', () => {
    expect(devPageText('https://a.com')).toBeNull();
  });

  // on the dev server the seeded corpus stands in for the network
  it('serves seeded text for a seeded URL', () => {
    globalThis.chrome = {
      __shim: true,
      __pageTexts: () => ({ 'url-https://a.com': 'the quota is fixed' }),
    };
    expect(devPageText('https://a.com')).toBe('the quota is fixed');
  });

  // a page the scenario did not seed is a page with no text — the same thing a
  // real blank page gives, so "scanned but did not match" stays demonstrable
  it('returns an empty string for an unseeded URL on the shim', () => {
    globalThis.chrome = { __shim: true, __pageTexts: () => ({}) };
    expect(devPageText('https://unseeded.com')).toBe('');
  });

  // a scenario can seed '' deliberately to demonstrate the empty-shell case
  it('preserves a deliberately empty seeded value', () => {
    globalThis.chrome = {
      __shim: true,
      __pageTexts: () => ({ 'url-https://spa.com': '' }),
    };
    expect(devPageText('https://spa.com')).toBe('');
  });
});
