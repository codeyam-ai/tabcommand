// In-app `chrome` shim for the dev server, where there is no extension `chrome`
// object. It provides a real in-memory store, multi-key callback reads,
// `onChanged` events, `remove`, and no-op action stubs.
//
// localStorage is BOTH the seed inlet (state is written as
// `localStorage[key] = JSON.stringify(value)` before the app boots) and the
// persistence mirror. The in-memory `store` is the working copy; the JSON string
// boundary lives entirely inside this shim, so `Chrome.get` consumers always see
// parsed objects/arrays exactly as the real `chrome.storage` would hand back.

// The storage keys. Shared so the Chrome abstraction's default lists and the
// shim's hydration never drift.
export const KNOWN_KEYS = [
  'labels',
  'uxSettings',
  'autoClosed',
  'activeTabs',
  'allUrls',
  'previousLabels',
];

// Resolve the callback from a stub call's arguments regardless of arity — Chrome
// action APIs put the (optional) callback last, and call sites vary in how many
// positional args they pass.
function lastCallback(args) {
  const last = args[args.length - 1];
  return typeof last === 'function' ? last : undefined;
}

// Invoke `cb` asynchronously (microtask) to match Chrome's async callback
// contract — consumers must never depend on synchronous delivery.
function defer(cb, value) {
  if (cb) Promise.resolve().then(() => cb(value));
}

// Build a fresh shim object backed by a store hydrated from `window.localStorage`.
// Exported for unit tests; production code goes through installChromeShim().
export function createChromeShim() {
  // Hydrate from EVERY localStorage entry, not just KNOWN_KEYS. Each URL object
  // lives under a dynamic `url-<url>` key that isn't in KNOWN_KEYS, so a
  // known-keys-only loop would drop the seeded per-URL data and every tab would
  // render blank. When localStorage is cleared and seeded per scenario, scanning
  // all keys is exactly the seeded set. KNOWN_KEYS remains the source for the
  // Chrome abstraction's default-hydration lists, not the shim's boot scope.
  const store = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key == null) continue;
    const raw = window.localStorage.getItem(key);
    if (raw == null) continue;
    try {
      store[key] = JSON.parse(raw);
    } catch {
      // Ignore malformed seed values rather than crashing the boot path.
    }
  }

  const listeners = [];
  const dispatch = (changes) => {
    // Snapshot the list so a listener that detaches mid-dispatch is safe.
    for (const fn of listeners.slice()) fn(changes, 'local');
  };

  const local = {
    get: (keys, cb) => {
      let requested;
      if (keys == null) requested = Object.keys(store);
      else if (typeof keys === 'string') requested = [keys];
      else if (Array.isArray(keys)) requested = keys;
      else requested = Object.keys(keys);

      const results = {};
      for (const k of requested) {
        // Hand back a deep COPY, never the live `store[k]` reference. Real
        // chrome.storage.local serializes/deserializes across a process
        // boundary, so every get yields a fresh structure that consumers can
        // freely mutate without corrupting the store. ImportExport's
        // `sortAndStuff` mutates its result (`delete label.urlKeys`), and under
        // StrictMode the effect runs twice — sharing the live reference would
        // leave the second run iterating an already-deleted `urlKeys`.
        if (Object.prototype.hasOwnProperty.call(store, k)) {
          results[k] = JSON.parse(JSON.stringify(store[k]));
        }
      }
      defer(cb, results);
    },

    set: (obj, cb) => {
      const changes = {};
      for (const [k, newValue] of Object.entries(obj)) {
        changes[k] = { oldValue: store[k], newValue };
        store[k] = newValue;
        window.localStorage.setItem(k, JSON.stringify(newValue));
      }
      dispatch(changes);
      defer(cb);
    },

    remove: (keys, cb) => {
      const arr = typeof keys === 'string' ? [keys] : keys;
      const changes = {};
      for (const k of arr) {
        changes[k] = { oldValue: store[k], newValue: undefined };
        delete store[k];
        window.localStorage.removeItem(k);
      }
      dispatch(changes);
      defer(cb);
    },

    clear: (cb) => {
      const changes = {};
      for (const k of Object.keys(store)) {
        changes[k] = { oldValue: store[k], newValue: undefined };
        delete store[k];
        window.localStorage.removeItem(k);
      }
      dispatch(changes);
      defer(cb);
    },
  };

  return {
    storage: {
      local,
      onChanged: {
        addListener: (fn) => { listeners.push(fn); },
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i > -1) listeners.splice(i, 1);
        },
      },
    },

    // Action APIs are side effects of close/drag/group interactions. There are
    // no OS tabs outside the extension, so these are callable no-ops — present
    // only so interactive scenarios don't throw `chrome.tabs is undefined`.
    tabs: {
      create: (...args) => defer(lastCallback(args), {}),
      update: (...args) => defer(lastCallback(args)),
      remove: (...args) => defer(lastCallback(args)),
      group: (...args) => defer(lastCallback(args), 0),
      ungroup: (...args) => defer(lastCallback(args)),
      query: (...args) => defer(lastCallback(args), []),
    },
    tabGroups: {
      query: (...args) => defer(lastCallback(args), []),
      update: (...args) => defer(lastCallback(args), {}),
      move: (...args) => defer(lastCallback(args), {}),
    },
    processes: {
      onUpdatedWithMemory: {
        // The real chrome.processes API streams live per-process CPU/memory
        // samples, which don't exist outside a packaged extension. On the dev
        // server we surface any seeded `processes` snapshot once, so the Load
        // page's raw per-process table can be demonstrated. With no
        // seed this stays a no-op (the table renders empty), exactly as before.
        addListener: (fn) => {
          if (typeof fn === 'function' && store.processes && Object.keys(store.processes).length > 0) {
            defer(fn, store.processes);
          }
        },
        removeListener: () => {},
      },
    },
    runtime: {
      getURL: (p) => p,
    },
  };
}

// Install the shim on `globalThis` ONLY when the real extension `chrome` is
// absent — in a packaged extension the native `chrome` wins and this is inert,
// so the shim never changes production behavior. Returns true when it installed.
export function installChromeShim() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return false;
  }
  globalThis.chrome = createChromeShim();
  return true;
}
