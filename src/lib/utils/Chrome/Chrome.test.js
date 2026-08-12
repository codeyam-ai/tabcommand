import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import chrome from 'sinon-chrome';
import { Chrome } from './index';

// Drives the abstraction against sinon-chrome as the underlying `chrome`
// (mirroring the reference's storage tests). `callsFake` lets each test control
// exactly what the raw storage returns so we can assert the default-hydration
// layer the abstraction adds on top.
//
// Since `labels` moved to `chrome.storage.sync` (see utils/storageAreas), a read
// or write touching labels is expected on the SYNC stub and everything else on
// the LOCAL stub. Tests that used to assert plain `storage.local` delegation now
// assert the fan-out — that is the contract change, not a regression.
describe('Chrome', () => {
  beforeEach(() => {
    globalThis.chrome = chrome;
    chrome.flush();
    // Default both areas to empty so a test only has to state the area it cares
    // about; an un-stubbed area would never invoke its callback and the
    // cross-area read would never complete.
    chrome.storage.local.get.callsFake((keys, cb) => cb({}));
    chrome.storage.sync.get.callsFake((keys, cb) => cb({}));
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  // hash-typed keys hydrate to {} when storage has no value
  it('hydrates labels/uxSettings/autoClosed to {} when absent', () => {
    let out;
    Chrome.get('t', ['labels', 'uxSettings', 'autoClosed'], (r) => { out = r; });
    expect(out.labels).toEqual({});
    expect(out.uxSettings).toEqual({});
    expect(out.autoClosed).toEqual({});
  });

  // array-typed keys hydrate to [] when storage has no value
  it('hydrates activeTabs/allUrls/previousLabels to [] when absent', () => {
    let out;
    Chrome.get('t', ['activeTabs', 'allUrls', 'previousLabels'], (r) => { out = r; });
    expect(out.activeTabs).toEqual([]);
    expect(out.allUrls).toEqual([]);
    expect(out.previousLabels).toEqual([]);
  });

  // the single-string key form is supported and still hydrates its default
  it('supports a single string key', () => {
    let out;
    Chrome.get('t', 'labels', (r) => { out = r; });
    expect(out.labels).toEqual({});
  });

  // present values are passed through untouched (no default applied)
  it('passes through requested keys that are present', () => {
    chrome.storage.sync.get.callsFake((keys, cb) => cb({ labels: { a: 1 } }));
    chrome.storage.local.get.callsFake((keys, cb) => cb({ activeTabs: [1, 2] }));
    let out;
    Chrome.get('t', ['labels', 'activeTabs'], (r) => { out = r; });
    expect(out.labels).toEqual({ a: 1 });
    expect(out.activeTabs).toEqual([1, 2]);
  });

  // previousLabels drops falsy entries and strips each entry's timestamp
  it('strips timestamp and drops falsy previousLabels entries', () => {
    chrome.storage.local.get.callsFake((keys, cb) =>
      cb({ previousLabels: [{ name: 'x', timestamp: 123 }, null, { name: 'y', timestamp: 456 }] })
    );
    let out;
    Chrome.get('t', 'previousLabels', (r) => { out = r; });
    expect(out.previousLabels).toEqual([{ name: 'x' }, { name: 'y' }]);
  });

  // labels is routed to the sync area so groups survive an uninstall
  it('set routes labels to chrome.storage.sync', () => {
    Chrome.set('t', { labels: { a: 1 } });
    expect(chrome.storage.sync.set.calledOnce).toBe(true);
    expect(chrome.storage.sync.set.firstCall.args[0]).toEqual({ labels: { a: 1 } });
  });

  // everything other than labels still goes to the local area
  it('set routes non-labels keys to chrome.storage.local', () => {
    Chrome.set('t', { activeTabs: [1] });
    expect(chrome.storage.local.set.calledOnceWith({ activeTabs: [1] })).toBe(true);
    expect(chrome.storage.sync.set.called).toBe(false);
  });

  // the import path writes url-* records and labels from ONE map; a naive
  // per-area switch would drop half of it
  it('set splits a mixed updates map across both areas', () => {
    Chrome.set('t', { 'url-https://a.com': { url: 'https://a.com' }, labels: { a: 1 } });
    expect(chrome.storage.local.set.calledOnceWith({ 'url-https://a.com': { url: 'https://a.com' } })).toBe(true);
    expect(chrome.storage.sync.set.firstCall.args[0]).toEqual({ labels: { a: 1 } });
  });

  // the Import / Export page reads across the area boundary in one call and is
  // written against a single-callback contract
  it('get merges a cross-area read into one callback', () => {
    chrome.storage.sync.get.callsFake((keys, cb) => cb({ labels: { a: 1 } }));
    chrome.storage.local.get.callsFake((keys, cb) => cb({ previousLabels: [{ b: 2 }] }));
    let calls = 0;
    let out;
    Chrome.get('t', ['labels', 'previousLabels'], (r) => { calls += 1; out = r; });
    expect(calls).toBe(1);
    expect(out.labels).toEqual({ a: 1 });
    expect(out.previousLabels).toEqual([{ b: 2 }]);
  });

  // remove routes by area the same way get and set do
  it('remove routes labels to chrome.storage.sync', () => {
    Chrome.remove('t', 'labels');
    expect(chrome.storage.sync.remove.calledOnceWith(['labels'])).toBe(true);
    expect(chrome.storage.local.remove.called).toBe(false);
  });
});
