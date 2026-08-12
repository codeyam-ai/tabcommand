import { describe, it, expect } from 'vitest';
import {
  SYNC_ITEM_QUOTA_BYTES,
  SYNC_ITEM_SAFE_BYTES,
  serializedByteLength,
  fitsSyncItemQuota,
} from './syncQuota';

// The measurement that decides whether a labels write goes to sync or falls back
// to local. Getting it wrong in the permissive direction means a swallowed quota
// error and a backup that only LOOKS like it works.
describe('syncQuota', () => {
  // the enforced cap must leave real headroom under Chrome's hard limit, so we
  // fall back deliberately instead of discovering the limit as a runtime error
  it('enforces a margin below Chrome per-item quota', () => {
    expect(SYNC_ITEM_QUOTA_BYTES).toBe(8192);
    expect(SYNC_ITEM_SAFE_BYTES).toBeLessThan(SYNC_ITEM_QUOTA_BYTES);
    expect(SYNC_ITEM_SAFE_BYTES).toBeGreaterThan(0);
  });

  // the quota counts the key name as well as the value
  it('counts the key name as well as the serialized value', () => {
    expect(serializedByteLength('ab', null)).toBe('ab'.length + 'null'.length);
    expect(serializedByteLength('labels', {})).toBe('labels'.length + 2);
  });

  // group titles are user-supplied and routinely non-ASCII; String.length would
  // undercount an emoji title by up to 3x and let an over-quota write through
  it('measures UTF-8 bytes rather than UTF-16 code units', () => {
    const emojiBytes = serializedByteLength('k', '🎉');
    const asciiBytes = serializedByteLength('k', 'ab');
    expect(emojiBytes).toBeGreaterThan(asciiBytes);
    // 'k' + quote + 4 UTF-8 bytes for the emoji + quote
    expect(emojiBytes).toBe(1 + 1 + 4 + 1);
  });

  // undefined has no JSON encoding; it must measure as a concrete value rather
  // than producing NaN and silently passing the comparison
  it('measures undefined as a concrete value', () => {
    expect(serializedByteLength('k', undefined)).toBe(1 + 'null'.length);
    expect(Number.isNaN(serializedByteLength('k', undefined))).toBe(false);
  });

  // an ordinary group set is nowhere near the cap and must sync
  it('accepts a realistic labels map', () => {
    const labels = {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-https://github.com'] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: ['url-https://react.dev'] },
    };
    expect(fitsSyncItemQuota('labels', labels)).toBe(true);
  });

  // the case that drives the user-visible warning: too many groups or too many
  // member URLs to back up
  it('rejects a labels map past the safe cap', () => {
    const labels = {};
    for (let i = 0; i < 200; i++) {
      labels[`Group ${i}`] = {
        title: `Group ${i}`,
        backgroundColor: '#1873E4',
        position: i,
        urlKeys: [`url-https://example.com/a/fairly/long/path/number/${i}`],
      };
    }
    expect(serializedByteLength('labels', labels)).toBeGreaterThan(SYNC_ITEM_SAFE_BYTES);
    expect(fitsSyncItemQuota('labels', labels)).toBe(false);
  });

  // an empty group set is the smallest possible write and must never be judged
  // over quota
  it('accepts an empty labels map', () => {
    expect(fitsSyncItemQuota('labels', {})).toBe(true);
  });

  // the boundary itself is inclusive — a value measuring exactly the safe cap
  // still syncs
  it('accepts a value measuring exactly the safe cap', () => {
    const padding = 'x'.repeat(SYNC_ITEM_SAFE_BYTES - 'labels'.length - 2);
    expect(serializedByteLength('labels', padding)).toBe(SYNC_ITEM_SAFE_BYTES);
    expect(fitsSyncItemQuota('labels', padding)).toBe(true);
  });
});
