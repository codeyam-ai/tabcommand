import { describe, it, expect } from 'vitest';
import { samePageKey } from './samePageKey';

// samePageKey reduces a URL to its origin + pathname so the grouping eject path
// can tell an in-page URL rewrite (query/hash change — keep grouped) from a real
// navigation (different origin/path — eject). These tests pin that contract; the
// query-only and fragment-only cases are the regression guards for the reported
// Google Docs `?tab=` bug.
describe('samePageKey', () => {
  // A query-string-only change keeps the same page identity, so a tab that
  // rewrites only `?…` is treated as in-page and stays in its group.
  it('treats a query-string-only change as the same page', () => {
    expect(samePageKey('https://x.com/doc?id=1')).toBe(
      samePageKey('https://x.com/doc?id=2')
    );
  });

  // The exact reported case: Google Docs churning `?tab=t.A` -> `?tab=t.B` on a
  // deep document path must compare equal (in-page, not a navigation).
  it('treats the Google Docs tab-query churn as the same page', () => {
    const base = 'https://docs.google.com/document/d/1GMK/edit';
    expect(samePageKey(`${base}?tab=t.whli3qfeqr1i`)).toBe(
      samePageKey(`${base}?tab=t.other`)
    );
  });

  // A fragment-only change (SPA anchor navigation) keeps the same page identity.
  it('treats a fragment-only change as the same page', () => {
    expect(samePageKey('https://x.com/page#a')).toBe(
      samePageKey('https://x.com/page#b')
    );
  });

  // A different pathname is a genuine navigation and must NOT compare equal.
  it('treats a different path as a different page', () => {
    expect(samePageKey('https://x.com/a')).not.toBe(
      samePageKey('https://x.com/b')
    );
  });

  // A different origin (host) is a genuine navigation and must NOT compare equal.
  it('treats a different origin as a different page', () => {
    expect(samePageKey('https://x.com/page')).not.toBe(
      samePageKey('https://other.com/page')
    );
  });

  // Same scheme+host+path resolves to a stable origin+pathname identity.
  it('returns the origin and pathname with query and fragment stripped', () => {
    expect(samePageKey('https://x.com/a/b?q=1#frag')).toBe('https://x.com/a/b');
  });

  // An unparseable value (e.g. chrome://newtab is parseable but exercises the
  // non-http path; a bare token is not) falls back to identity comparison: two
  // such values compare equal only when literally identical, never throwing.
  it('falls back to identity comparison for unparseable inputs', () => {
    expect(samePageKey('not a url')).toBe('not a url');
    expect(samePageKey('not a url')).toBe(samePageKey('not a url'));
    expect(samePageKey('one thing')).not.toBe(samePageKey('another thing'));
    expect(samePageKey('')).toBe('');
  });

  // A non-string input is returned unchanged rather than throwing.
  it('returns a non-string input unchanged without throwing', () => {
    expect(samePageKey(null)).toBe(null);
    expect(samePageKey(undefined)).toBe(undefined);
  });
});
