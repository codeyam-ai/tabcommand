// In-app `chrome` shim for the codeyam preview and the plain-browser dev server,
// where there is no extension `chrome` object. It is a purpose-built replacement
// for the reference App.jsx's `global.chrome = sinon-chrome` hack: a real
// in-memory store, multi-key callback reads, `onChanged` events, `remove`, and
// no-op action stubs.
//
// localStorage is BOTH the seed inlet (codeyam's localStorage adapter writes
// `localStorage[key] = JSON.stringify(value)` before the app boots) and the
// persistence mirror. The in-memory `store` is the working copy; the JSON string
// boundary lives entirely inside this shim, so `Chrome.get` consumers always see
// parsed objects/arrays exactly as the real `chrome.storage` would hand back.

// The TabCommand storage keys. Shared so the Chrome abstraction's default lists
// and the shim's hydration never drift.
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
  const store = {};
  for (const key of KNOWN_KEYS) {
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
        if (Object.prototype.hasOwnProperty.call(store, k)) results[k] = store[k];
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
    // no OS tabs in the preview, so these are callable no-ops — present only so
    // interactive scenarios don't throw `chrome.tabs is undefined`.
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
        addListener: () => {},
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
