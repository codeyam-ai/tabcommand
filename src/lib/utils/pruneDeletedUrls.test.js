import { describe, it, expect } from 'vitest';
import pruneDeletedUrls from './pruneDeletedUrls';

const NOW = new Date(2026, 6, 28, 12, 0).getTime();
const TTL = 60 * 60 * 1000;

describe('pruneDeletedUrls', () => {
  // a tombstone written moments ago is still inside its window and survives
  it('keeps a tombstone newer than the ttl', () => {
    const deletedUrls = { 'url-a': NOW - 1000 };
    expect(pruneDeletedUrls(deletedUrls, NOW, TTL)).toEqual({ 'url-a': NOW - 1000 });
  });

  // past the ttl the tombstone has outlived the onRemoved race it existed for
  it('drops a tombstone older than the ttl', () => {
    expect(pruneDeletedUrls({ 'url-a': NOW - TTL - 1 }, NOW, TTL)).toEqual({});
  });

  // the boundary is inclusive: exactly-ttl-old is still honored, not dropped
  it('keeps a tombstone exactly at the ttl boundary', () => {
    expect(pruneDeletedUrls({ 'url-a': NOW - TTL }, NOW, TTL)).toEqual({ 'url-a': NOW - TTL });
  });

  // pruning is per-entry, so a mixed map keeps only the entries still in window
  it('prunes only the expired entries from a mixed map', () => {
    const deletedUrls = {
      'url-fresh': NOW - 1000,
      'url-stale': NOW - TTL - 5000,
      'url-alsoFresh': NOW - TTL + 1,
    };
    expect(pruneDeletedUrls(deletedUrls, NOW, TTL)).toEqual({
      'url-fresh': NOW - 1000,
      'url-alsoFresh': NOW - TTL + 1,
    });
  });

  // the key has never been deleted from, so storage returns nothing for it
  it('returns an empty map for undefined or empty input', () => {
    expect(pruneDeletedUrls(undefined, NOW, TTL)).toEqual({});
    expect(pruneDeletedUrls({}, NOW, TTL)).toEqual({});
  });

  // a corrupt/legacy entry must not pin a key out of history forever
  it('drops entries whose timestamp is missing or not a number', () => {
    const deletedUrls = { 'url-bad': null, 'url-worse': 'yesterday', 'url-ok': NOW };
    expect(pruneDeletedUrls(deletedUrls, NOW, TTL)).toEqual({ 'url-ok': NOW });
  });

  // pure: the caller's stored map is never mutated in place
  it('does not mutate the input map', () => {
    const deletedUrls = { 'url-stale': NOW - TTL - 1 };
    pruneDeletedUrls(deletedUrls, NOW, TTL);
    expect(deletedUrls).toEqual({ 'url-stale': NOW - TTL - 1 });
  });
});
