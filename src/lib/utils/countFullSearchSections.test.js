import { describe, it, expect } from 'vitest';
import countFullSearchSections from './countFullSearchSections';

const url = (id, over = {}) => ({ id, urlTitle: id, ...over });

const results = (over = {}) => ({
  labels: [],
  grouped: [],
  history: [],
  notes: [],
  openTabs: [],
  ...over,
});

describe('countFullSearchSections', () => {
  // each chip answers its own question, so each count is its own section's size
  it('counts each section independently', () => {
    const counts = countFullSearchSections(results({
      labels: [{ id: 'label-Work', labelTitle: 'Work' }],
      grouped: [{ title: 'Work', color: '#1873E4', urls: [url('url-a'), url('url-b')] }],
      history: [url('url-c')],
      notes: [url('url-c')],
      openTabs: [url('url-a')],
    }), []);

    expect(counts.labels).toBe(1);
    expect(counts.grouped).toBe(2);
    expect(counts.history).toBe(1);
    expect(counts.notes).toBe(1);
    expect(counts.openTabs).toBe(1);
  });

  // `grouped` arrives as per-group sub-sections, so its count is the flattened
  // total — not the number of groups
  it('counts grouped urls across every group, not the number of groups', () => {
    const counts = countFullSearchSections(results({
      grouped: [
        { title: 'Work', color: '#1873E4', urls: [url('url-a'), url('url-b')] },
        { title: 'Reading', color: '#1F8E43', urls: [url('url-c')] },
      ],
    }), []);
    expect(counts.grouped).toBe(3);
  });

  // THE POINT OF "All": the location sections partition the results, while Notes
  // and Open tabs re-list hits that already appear in one of them. Summing every
  // section would double-count, so All dedupes by id across the location
  // sections and Chrome history.
  it('dedupes All across sections that deliberately overlap', () => {
    const shared = url('url-c');
    const counts = countFullSearchSections(results({
      history: [shared],
      notes: [shared],
      openTabs: [shared],
    }), []);
    expect(counts.all).toBe(1);
  });

  // All spans the location sections plus the opt-in outside source — the four
  // places a distinct result can actually come from
  it('counts All across labels, grouped, history and chrome history', () => {
    const counts = countFullSearchSections(results({
      labels: [{ id: 'label-Work', labelTitle: 'Work' }],
      grouped: [{ title: 'Work', color: '#1873E4', urls: [url('url-a')] }],
      history: [url('url-b')],
    }), [url('chrome-history-https://x.com')]);
    expect(counts.all).toBe(4);
  });

  // a Chrome-history hit for an already-tracked url is deduped upstream by
  // searchChromeHistory, but an id collision must not inflate All either
  it('does not double-count a chrome hit sharing an id with a tracked hit', () => {
    const counts = countFullSearchSections(results({
      history: [url('url-a')],
    }), [url('url-a')]);
    expect(counts.all).toBe(1);
  });

  // the Chrome history chip only appears when the feature is on, so its count
  // has to survive independently of the rest
  it('reports the chrome history count separately', () => {
    const counts = countFullSearchSections(results(), [url('c1'), url('c2')]);
    expect(counts.chromeHistory).toBe(2);
  });

  // a no-match query still renders every chip, dimmed, showing a real 0 — the
  // count is how the user learns the section is empty rather than hidden
  it('returns zeroes for an empty result set', () => {
    const counts = countFullSearchSections(results(), []);
    expect(counts).toEqual({
      all: 0, labels: 0, grouped: 0, history: 0, notes: 0, openTabs: 0, chromeHistory: 0,
    });
  });

  // the chips render on the first paint, before the index has produced anything
  it('tolerates missing arguments', () => {
    expect(countFullSearchSections(null, null).all).toBe(0);
  });
});
