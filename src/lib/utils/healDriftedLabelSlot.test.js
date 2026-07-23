import { describe, it, expect } from 'vitest';
import healDriftedLabelSlot from './healDriftedLabelSlot.js';

describe('healDriftedLabelSlot', () => {
  // A drifted Google Doc (same page, different ?tab= query) is rewritten in
  // place so it keeps its recorded position instead of being dropped/re-added.
  it('rewrites a drifted same-page slot in place, preserving its index', () => {
    const label = {
      urlKeys: [
        'url-https://docs.google.com/document/d/ABC/edit?tab=t.0',
        'url-https://other.com',
      ],
    };
    const result = healDriftedLabelSlot(
      label,
      'url-https://docs.google.com/document/d/ABC/edit?tab=t.9',
      'https://docs.google.com/document/d/ABC/edit?tab=t.9'
    );
    expect(result).toEqual({
      found: true,
      mutated: true,
      previousKey: 'url-https://docs.google.com/document/d/ABC/edit?tab=t.0',
      removed: false,
    });
    // A position-preserving rewrite is NOT a member drop.
    expect(result.removed).toBe(false);
    expect(label.urlKeys).toEqual([
      'url-https://docs.google.com/document/d/ABC/edit?tab=t.9',
      'url-https://other.com',
    ]);
  });

  // When the live key already lives elsewhere in the label, the stale slot is
  // spliced out rather than producing a duplicate entry.
  it('splices out the stale slot when the live key already exists elsewhere', () => {
    const label = {
      urlKeys: [
        'url-https://docs.google.com/document/d/ABC/edit?tab=t.0',
        'url-https://docs.google.com/document/d/ABC/edit?tab=t.9',
      ],
    };
    const result = healDriftedLabelSlot(
      label,
      'url-https://docs.google.com/document/d/ABC/edit?tab=t.9',
      'https://docs.google.com/document/d/ABC/edit?tab=t.9'
    );
    expect(result.found).toBe(true);
    expect(result.mutated).toBe(true);
    // A dedup splice IS a member drop — the audit trail relies on this flag.
    expect(result.removed).toBe(true);
    expect(result.previousKey).toBe(
      'url-https://docs.google.com/document/d/ABC/edit?tab=t.0'
    );
    expect(label.urlKeys).toEqual([
      'url-https://docs.google.com/document/d/ABC/edit?tab=t.9',
    ]);
  });

  // An exact match is already correct: report found so the caller does not
  // append, but leave the array untouched and mutated=false.
  it('reports found without mutating when the slot already matches exactly', () => {
    const label = { urlKeys: ['url-https://a.com/p?tab=t.0', 'url-https://b.com'] };
    const result = healDriftedLabelSlot(
      label,
      'url-https://a.com/p?tab=t.0',
      'https://a.com/p?tab=t.0'
    );
    expect(result).toEqual({ found: true, mutated: false, previousKey: null, removed: false });
    expect(label.urlKeys).toEqual(['url-https://a.com/p?tab=t.0', 'url-https://b.com']);
  });

  // A genuinely new page (no same-page slot) is left for the caller to append:
  // found=false, mutated=false, nothing changed.
  it('reports not-found for a genuinely new page and does not mutate', () => {
    const label = { urlKeys: ['url-https://a.com', 'url-https://b.com'] };
    const result = healDriftedLabelSlot(
      label,
      'url-https://c.com',
      'https://c.com'
    );
    expect(result).toEqual({ found: false, mutated: false, previousKey: null, removed: false });
    expect(label.urlKeys).toEqual(['url-https://a.com', 'url-https://b.com']);
  });

  // An empty label has no slot to heal, so it is a not-found no-op.
  it('is a not-found no-op on an empty label', () => {
    const label = { urlKeys: [] };
    const result = healDriftedLabelSlot(label, 'url-https://a.com', 'https://a.com');
    expect(result).toEqual({ found: false, mutated: false, previousKey: null, removed: false });
    expect(label.urlKeys).toEqual([]);
  });

  // Page identity ignores the hash fragment too, so a fragment-only drift on the
  // same page/query is treated as an exact match and left untouched.
  it('treats a fragment-only change on the same page as an exact match', () => {
    const label = { urlKeys: ['url-https://a.com/p'] };
    // getUrlKey strips fragments, so the live key carries no #frag; the recorded
    // key already equals it -> exact match, no mutation.
    const result = healDriftedLabelSlot(
      label,
      'url-https://a.com/p',
      'https://a.com/p#section'
    );
    expect(result).toEqual({ found: true, mutated: false, previousKey: null, removed: false });
    expect(label.urlKeys).toEqual(['url-https://a.com/p']);
  });
});
