import { describe, it, expect } from 'vitest';
import navigatedAwayFromRecordedSlot from './navigatedAwayFromRecordedSlot.js';

const label = (urlKeys) => ({ title: 'CodeYam', urlKeys });

describe('navigatedAwayFromRecordedSlot', () => {
  // The reported bug: the tab was filed under /apps and is now sitting on a
  // deeper path of the same site. That is a navigation, not a new member.
  it('is true when the stamped tab is on a different url than its recorded slot', () => {
    expect(
      navigatedAwayFromRecordedSlot(
        label(['url-https://appstoreconnect.apple.com/apps']),
        'CodeYam',
        {
          urlKey: 'url-https://appstoreconnect.apple.com/apps/123/distribution',
          labelTitle: 'CodeYam',
          labelUrlKey: 'url-https://appstoreconnect.apple.com/apps',
        }
      )
    ).toBe(true);
  });

  // An unstamped tab has no recorded slot to have navigated away FROM, so its
  // url is a genuine new member — this is what keeps ordinary appends working.
  it('is false for a tab carrying no stamp', () => {
    expect(
      navigatedAwayFromRecordedSlot(label(['url-https://a.com']), 'CodeYam', {
        urlKey: 'url-https://b.com',
      })
    ).toBe(false);
  });

  // The guard is per-label: a tab stamped for a different group is not the tab
  // THIS label recorded, so its url still appends here.
  it('is false when the stamp names a different label', () => {
    expect(
      navigatedAwayFromRecordedSlot(label(['url-https://a.com']), 'CodeYam', {
        urlKey: 'url-https://b.com',
        labelTitle: 'Work',
        labelUrlKey: 'url-https://a.com',
      })
    ).toBe(false);
  });

  // The tab is still on the very url it was filed under — nothing moved, so
  // there is nothing to suppress.
  it('is false when the live url still equals the recorded slot', () => {
    expect(
      navigatedAwayFromRecordedSlot(label(['url-https://a.com']), 'CodeYam', {
        urlKey: 'url-https://a.com',
        labelTitle: 'CodeYam',
        labelUrlKey: 'url-https://a.com',
      })
    ).toBe(false);
  });

  // A stale stamp must not suppress appends forever: once the user removes the
  // recorded slot by hand it is no longer a member, and the guard stands down.
  it('is false when the recorded slot is no longer a member of the label', () => {
    expect(
      navigatedAwayFromRecordedSlot(label(['url-https://other.com']), 'CodeYam', {
        urlKey: 'url-https://appstoreconnect.apple.com/apps/123/distribution',
        labelTitle: 'CodeYam',
        labelUrlKey: 'url-https://appstoreconnect.apple.com/apps',
      })
    ).toBe(false);
  });

  // A half-written stamp (label but no key) carries no slot to compare against.
  it('is false when the stamp has a label but no recorded urlKey', () => {
    expect(
      navigatedAwayFromRecordedSlot(label(['url-https://a.com']), 'CodeYam', {
        urlKey: 'url-https://b.com',
        labelTitle: 'CodeYam',
      })
    ).toBe(false);
  });

  // An empty label has no members, so no stamp can point at a live slot.
  it('is false for a label with no members', () => {
    expect(
      navigatedAwayFromRecordedSlot(label([]), 'CodeYam', {
        urlKey: 'url-https://b.com',
        labelTitle: 'CodeYam',
        labelUrlKey: 'url-https://a.com',
      })
    ).toBe(false);
  });

  // Returns a real boolean, never a truthy string — callers branch on it
  // directly and the worker logs it.
  it('returns a boolean rather than a truthy value', () => {
    const result = navigatedAwayFromRecordedSlot(label(['url-https://a.com']), 'CodeYam', {
      urlKey: 'url-https://b.com',
      labelTitle: 'CodeYam',
      labelUrlKey: 'url-https://a.com',
    });
    expect(typeof result).toBe('boolean');
  });
});
