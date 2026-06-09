import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import chrome from 'sinon-chrome';
import { Chrome } from './index';

// Drives the abstraction against sinon-chrome as the underlying `chrome`
// (mirroring the reference's storage tests). `callsFake` lets each test control
// exactly what the raw storage returns so we can assert the default-hydration
// layer the abstraction adds on top.
describe('Chrome', () => {
  beforeEach(() => {
    globalThis.chrome = chrome;
    chrome.flush();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  // hash-typed keys hydrate to {} when storage has no value
  it('hydrates labels/uxSettings/autoClosed to {} when absent', () => {
    chrome.storage.local.get.callsFake((keys, cb) => cb({}));
    let out;
    Chrome.get('t', ['labels', 'uxSettings', 'autoClosed'], (r) => { out = r; });
    expect(out.labels).toEqual({});
    expect(out.uxSettings).toEqual({});
    expect(out.autoClosed).toEqual({});
  });

  // array-typed keys hydrate to [] when storage has no value
  it('hydrates activeTabs/allUrls/previousLabels to [] when absent', () => {
    chrome.storage.local.get.callsFake((keys, cb) => cb({}));
    let out;
    Chrome.get('t', ['activeTabs', 'allUrls', 'previousLabels'], (r) => { out = r; });
    expect(out.activeTabs).toEqual([]);
    expect(out.allUrls).toEqual([]);
    expect(out.previousLabels).toEqual([]);
  });

  // the single-string key form is supported and still hydrates its default
  it('supports a single string key', () => {
    chrome.storage.local.get.callsFake((keys, cb) => cb({}));
    let out;
    Chrome.get('t', 'labels', (r) => { out = r; });
    expect(out.labels).toEqual({});
  });

  // present values are passed through untouched (no default applied)
  it('passes through requested keys that are present', () => {
    chrome.storage.local.get.callsFake((keys, cb) => cb({ labels: { a: 1 }, activeTabs: [1, 2] }));
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

  // set delegates straight to chrome.storage.local.set
  it('set delegates to chrome.storage.local.set', () => {
    Chrome.set('t', { labels: { a: 1 } });
    expect(chrome.storage.local.set.calledOnceWith({ labels: { a: 1 } })).toBe(true);
  });

  // remove delegates straight to chrome.storage.local.remove
  it('remove delegates to chrome.storage.local.remove', () => {
    Chrome.remove('t', 'labels');
    expect(chrome.storage.local.remove.calledOnceWith('labels')).toBe(true);
  });
});
