import React from 'react';
import { createRoot } from 'react-dom/client';
import { installChromeShim } from './lib/utils/chromeShim';
import { migrateLabelsToSync } from './lib/utils/migrateLabelsToSync';
import './lib/styles/fonts.css';
import './lib/styles/theme.css';
import './index.css';
import CodeyamIsolate from 'codeyam:isolate';

// Install the in-app chrome shim before the first render. When running outside
// the extension (the dev server), there is no extension `chrome`, so the shim
// provides `chrome.storage.local` (backed by localStorage) plus no-op action
// stubs. In a packaged extension the native `chrome` wins and the shim is inert.
// Nothing touches `chrome` at module-eval time (only inside render/effects), so
// calling it here — before createRoot().render() — guarantees it is present
// when any component first reads storage.
installChromeShim();

// Resolve `labels` across the two storage areas before the first render, for the
// same reason the service worker does it on boot — except the app cannot rely on
// the worker having done it. MV3 recycles the worker constantly, so a user who
// opens this page before the worker next wakes would read `labels` straight from
// an empty sync area and see NO GROUPS, while their groups sat untouched in
// local. The migration is idempotent, so both entry points running it is safe:
// whichever gets there first does the copy, the other observes sync already
// populated and no-ops.
//
// Fire-and-forget: it never blocks the render. Components read storage in
// effects, and the shim's `onChanged` events propagate the resolved value.
migrateLabelsToSync(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CodeyamIsolate />
  </React.StrictMode>
);
