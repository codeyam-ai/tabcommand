// In-app `chrome` shim for the dev server, where there is no extension `chrome`
// object. It provides a real in-memory store, multi-key callback reads,
// `onChanged` events, `remove`, and no-op action stubs.
//
// localStorage is BOTH the seed inlet (state is written as
// `localStorage[key] = JSON.stringify(value)` before the app boots) and the
// persistence mirror. The in-memory `store` is the working copy; the JSON string
// boundary lives entirely inside this shim, so `Chrome.get` consumers always see
// parsed objects/arrays exactly as the real `chrome.storage` would hand back.
//
// The shim models BOTH storage areas, because `labels` now lives in
// `chrome.storage.sync` (see utils/storageAreas). Without a sync area here the
// dev server would exercise a different code path than the extension — the
// migration, the mixed-area reads, and the quota fallback would all be
// unreachable in the preview.

import { LOCAL, SYNC, KNOWN_KEYS, areaForKey } from '../storageAreas';

export { KNOWN_KEYS };

// A seeded localStorage key normally lands in whichever area owns it, so every
// existing scenario seeds unchanged: `labels` goes to sync, `url-*` and
// `activeTabs` go to local. These prefixes override that, which is what makes
// the cross-area states seedable at all — "sync holds groups, local is wiped"
// (the uninstall a user survives) and "local holds groups, sync is empty" (the
// state the migration converts) are the same key in different areas.
export const AREA_SEED_PREFIXES = {
  [`${SYNC}::`]: SYNC,
  [`${LOCAL}::`]: LOCAL,
};

// Split a raw localStorage key into the area that owns it and the key the app
// sees. An unprefixed key routes through the storage-areas table.
export function resolveSeedKey(rawKey) {
  for (const [prefix, area] of Object.entries(AREA_SEED_PREFIXES)) {
    if (rawKey.startsWith(prefix)) {
      return { area, key: rawKey.slice(prefix.length) };
    }
  }
  return { area: areaForKey(rawKey), key: rawKey };
}

// The localStorage key a write mirrors back to — the inverse of resolveSeedKey,
// so a value round-trips into the same area it was written to. A key in its
// natural area mirrors unprefixed (keeping the seed format stable); a key
// written to the OTHER area, like the `labels` local fallback after a sync
// quota rejection, mirrors prefixed so the next boot does not hydrate it as if
// it were the synced copy.
export function mirrorKeyFor(area, key) {
  return areaForKey(key) === area ? key : `${area}::${key}`;
}

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

// Build a fresh shim object backed by stores hydrated from `window.localStorage`.
// Exported for unit tests; production code goes through installChromeShim().
export function createChromeShim() {
  // Hydrate from EVERY localStorage entry, not just KNOWN_KEYS. Each URL object
  // lives under a dynamic `url-<url>` key that isn't in KNOWN_KEYS, so a
  // known-keys-only loop would drop the seeded per-URL data and every tab would
  // render blank. When localStorage is cleared and seeded per scenario, scanning
  // all keys is exactly the seeded set. KNOWN_KEYS remains the source for the
  // Chrome abstraction's default-hydration lists, not the shim's boot scope.
  const stores = { [LOCAL]: {}, [SYNC]: {} };
  for (let i = 0; i < window.localStorage.length; i++) {
    const rawKey = window.localStorage.key(i);
    if (rawKey == null) continue;
    const raw = window.localStorage.getItem(rawKey);
    if (raw == null) continue;
    const { area, key } = resolveSeedKey(rawKey);
    try {
      stores[area][key] = JSON.parse(raw);
    } catch {
      // Ignore malformed seed values rather than crashing the boot path.
    }
  }

  const listeners = [];
  const dispatch = (changes, areaName) => {
    // Snapshot the list so a listener that detaches mid-dispatch is safe.
    for (const fn of listeners.slice()) fn(changes, areaName);
  };

  // Both areas behave identically apart from which store they read and write and
  // which `areaName` their change events carry — exactly the real API's shape.
  const makeArea = (areaName) => {
    const store = stores[areaName];

    return {
      get: (keys, cb) => {
        let requested;
        if (keys == null) requested = Object.keys(store);
        else if (typeof keys === 'string') requested = [keys];
        else if (Array.isArray(keys)) requested = keys;
        else requested = Object.keys(keys);

        const results = {};
        for (const k of requested) {
          // Hand back a deep COPY, never the live `store[k]` reference. Real
          // chrome.storage serializes/deserializes across a process
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
          window.localStorage.setItem(mirrorKeyFor(areaName, k), JSON.stringify(newValue));
        }
        dispatch(changes, areaName);
        defer(cb);
      },

      remove: (keys, cb) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        const changes = {};
        for (const k of arr) {
          changes[k] = { oldValue: store[k], newValue: undefined };
          delete store[k];
          window.localStorage.removeItem(mirrorKeyFor(areaName, k));
        }
        dispatch(changes, areaName);
        defer(cb);
      },

      clear: (cb) => {
        const changes = {};
        for (const k of Object.keys(store)) {
          changes[k] = { oldValue: store[k], newValue: undefined };
          delete store[k];
          window.localStorage.removeItem(mirrorKeyFor(areaName, k));
        }
        dispatch(changes, areaName);
        defer(cb);
      },
    };
  };

  const local = makeArea(LOCAL);
  const sync = makeArea(SYNC);

  return {
    storage: {
      local,
      sync,
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
          const processes = stores[LOCAL].processes;
          if (typeof fn === 'function' && processes && Object.keys(processes).length > 0) {
            defer(fn, processes);
          }
        },
        removeListener: () => {},
      },
    },
    runtime: {
      getURL: (p) => p,
      // Present so the sync-write guard's `chrome.runtime.lastError` check has
      // something to read. The shim never fails a write, so it stays undefined.
      lastError: undefined,
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
