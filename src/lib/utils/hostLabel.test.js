import { describe, it, expect } from 'vitest';
import hostLabel from './hostLabel';

describe('hostLabel', () => {
  // the host is the secondary line on a search row — it orients without the noise
  it('returns the hostname', () => {
    expect(hostLabel('https://github.com/codeyam/tabcommand')).toBe('github.com');
  });

  // `www.` is pure noise at this size; every row would carry it
  it('strips a leading www.', () => {
    expect(hostLabel('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
  });

  // only a LEADING www. goes — a host that merely contains it keeps its shape
  it('does not strip www elsewhere in the host', () => {
    expect(hostLabel('https://wwwtest.example.com/a')).toBe('wwwtest.example.com');
  });

  // a subdomain is often the whole distinction between two results, so only the
  // `www.` noise goes — nothing else is collapsed
  it('keeps subdomains', () => {
    expect(hostLabel('https://developer.mozilla.org/en-US/docs/Web/API'))
      .toBe('developer.mozilla.org');
  });

  // an unparseable or absent href must render no host rather than throw — a
  // seeded record with a malformed key would otherwise take the whole page down
  it('returns an empty string rather than throwing on bad input', () => {
    expect(hostLabel('not a url')).toBe('');
    expect(hostLabel('')).toBe('');
    expect(hostLabel(undefined)).toBe('');
    expect(hostLabel(null)).toBe('');
  });
});
