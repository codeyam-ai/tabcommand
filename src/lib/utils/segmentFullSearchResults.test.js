import { describe, it, expect } from 'vitest';
import segmentFullSearchResults from './segmentFullSearchResults';

const url = (id, over = {}) => ({
  id,
  urlTitle: id,
  url: `https://${id}.com`,
  match: { tab: ['urlTitle'] },
  terms: ['tab'],
  ...over,
});

const label = (title) => ({ id: `label-${title}`, labelTitle: title, color: '#1873E4' });
const tab = (urlKey) => ({ urlKey, tabKey: 'tab-1' });

describe('segmentFullSearchResults', () => {
  // a hit carrying labelTitle is a group, not a url
  it('separates label hits from url hits', () => {
    const out = segmentFullSearchResults([label('Work'), url('url-a')], []);
    expect(out.labels.map((l) => l.id)).toEqual(['label-Work']);
    expect(out.history.map((h) => h.id)).toEqual(['url-a']);
  });

  // a url belonging to a group is sub-divided by group, the way the page renders it
  it('routes grouped urls through groupSearchUrlsByLabel', () => {
    const out = segmentFullSearchResults([
      url('url-a', { urlLabelTitle: 'Work', urlLabelColor: '#1873E4' }),
      url('url-b', { urlLabelTitle: 'Work', urlLabelColor: '#1873E4' }),
      url('url-c', { urlLabelTitle: 'Reading', urlLabelColor: '#1F8E43' }),
    ], []);
    expect(out.grouped).toHaveLength(2);
    expect(out.grouped[0].title).toBe('Work');
    expect(out.grouped[0].urls.map((u) => u.id)).toEqual(['url-a', 'url-b']);
    expect(out.grouped[1].title).toBe('Reading');
  });

  // "History" is the archive: tracked urls filed into no group
  it('puts ungrouped urls in history', () => {
    const out = segmentFullSearchResults([
      url('url-a', { urlLabelTitle: 'Work' }),
      url('url-b'),
    ], []);
    expect(out.history.map((h) => h.id)).toEqual(['url-b']);
    expect(out.grouped[0].urls.map((u) => u.id)).toEqual(['url-a']);
  });

  // Notes answers "why did this match", which is a different question from where
  // the url lives — so it is keyed off the match field, not off location
  it('collects hits whose match landed in notes', () => {
    const out = segmentFullSearchResults([
      url('url-a', { match: { tab: ['notes'] } }),
      url('url-b', { match: { tab: ['urlTitle'] } }),
    ], []);
    expect(out.notes.map((n) => n.id)).toEqual(['url-a']);
  });

  // "Open tabs" is about the live window, not the index — membership comes from
  // activeTabs, so the section changes as tabs open and close
  it('collects hits that are currently open tabs', () => {
    const out = segmentFullSearchResults(
      [url('url-a'), url('url-b')],
      [tab('url-a')]
    );
    expect(out.openTabs.map((o) => o.id)).toEqual(['url-a']);
  });

  // THE OVERLAP IS THE DESIGN: one url can be in its location section AND in
  // Notes AND in Open tabs, so each filter chip answers its question completely
  it('lists one hit in every section it qualifies for', () => {
    const hit = url('url-a', { match: { tab: ['notes'] } });
    const out = segmentFullSearchResults([hit], [tab('url-a')]);
    expect(out.history.map((h) => h.id)).toEqual(['url-a']);
    expect(out.notes.map((n) => n.id)).toEqual(['url-a']);
    expect(out.openTabs.map((o) => o.id)).toEqual(['url-a']);
  });

  // overlapping index rebuilds can briefly leave a url indexed twice, which
  // would otherwise surface as two results sharing a React key
  it('dedupes repeated ids, keeping the first _highest-scoring_ hit', () => {
    const out = segmentFullSearchResults([
      url('url-a', { urlTitle: 'first' }),
      url('url-a', { urlTitle: 'second' }),
    ], []);
    expect(out.history).toHaveLength(1);
    expect(out.history[0].urlTitle).toBe('first');
  });

  // a label hit and a url hit can both match; neither may leak into the other
  it('never puts a label hit in a url section', () => {
    const out = segmentFullSearchResults([label('Work')], [tab('label-Work')]);
    expect(out.history).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.openTabs).toEqual([]);
    expect(out.grouped).toEqual([]);
  });

  // an activeTabs entry with no urlKey must not match a hit with no id
  it('ignores malformed activeTabs entries', () => {
    const out = segmentFullSearchResults([url('url-a')], [null, {}, tab(undefined)]);
    expect(out.openTabs).toEqual([]);
  });

  // the page segments once before the index has produced anything
  it('tolerates null results and null activeTabs', () => {
    const out = segmentFullSearchResults(null, null);
    expect(out).toEqual({ labels: [], grouped: [], history: [], notes: [], openTabs: [] });
  });
});
