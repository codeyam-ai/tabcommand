import React from 'react';
import { createRoot } from 'react-dom/client';
import { installChromeShim } from './lib/utils/chromeShim';
import './index.css';
import CodeyamIsolate from './__codeyam_isolate';

// Install the in-app chrome shim before the first render. When running outside
// the extension (the dev server), there is no extension `chrome`, so the shim
// provides `chrome.storage.local` (backed by localStorage) plus no-op action
// stubs. In a packaged extension the native `chrome` wins and the shim is inert.
// Nothing touches `chrome` at module-eval time (only inside render/effects), so
// calling it here — before createRoot().render() — guarantees it is present
// when any component first reads storage.
installChromeShim();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CodeyamIsolate />
  </React.StrictMode>
);
