import { describe, it, expect } from 'vitest';
import sortAutoClosed from './sortAutoClosed.js';
import { MaxAutoClosedTime } from '../../Constants';

const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;

describe('sortAutoClosed', () => {
  // The bug this exists for: the tab closed most recently comes first.
  it('orders url keys newest close first', () => {
    const autoClosed = {
      'url-old': NOW - 60 * MINUTE,
      'url-new': NOW - MINUTE,
      'url-mid': NOW - 10 * MINUTE,
    };

    expect(sortAutoClosed(autoClosed, NOW)).toEqual(['url-new', 'url-mid', 'url-old']);
  });

  // Closes older than the retention window are dropped, not just sorted last.
  it('drops closes older than the default retention window', () => {
    const autoClosed = {
      'url-recent': NOW - MINUTE,
      'url-expired': NOW - MaxAutoClosedTime - MINUTE,
    };

    expect(sortAutoClosed(autoClosed, NOW)).toEqual(['url-recent']);
  });

  // A stored `maxTime` overrides the default window.
  it('honors a maxTime stored on the map', () => {
    const autoClosed = {
      maxTime: 5 * MINUTE,
      'url-inside': NOW - 2 * MINUTE,
      'url-outside': NOW - 10 * MINUTE,
    };

    expect(sortAutoClosed(autoClosed, NOW)).toEqual(['url-inside']);
  });

  // Nothing stored yet is an empty list, not a crash.
  it('returns an empty list for a missing map', () => {
    expect(sortAutoClosed(undefined, NOW)).toEqual([]);
    expect(sortAutoClosed({}, NOW)).toEqual([]);
  });

  // A single close passes through unchanged.
  it('returns a lone close as-is', () => {
    expect(sortAutoClosed({ 'url-only': NOW - MINUTE }, NOW)).toEqual(['url-only']);
  });
});
