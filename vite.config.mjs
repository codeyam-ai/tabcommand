import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { codeyamPlugin } from './codeyam/vite-plugin-codeyam.mjs';

// `codeyamPlugin()` exposes the codeyam-generated component manifest and
// scenario-props map as virtual modules (`codeyam:components`,
// `codeyam:component-scenarios`) plus the isolation harness (`codeyam:isolate`)
// backed by `.codeyam/`, so those derived/harness files stay out of `src/`. It
// is a no-op for ordinary use until the App tab's isolation is exercised.
export default defineConfig({
  plugins: [codeyamPlugin(), react(), crx({ manifest })],
  build: {
    // Build into a SCRATCH directory, never into the directory Chrome has
    // loaded as an unpacked extension. `emptyOutDir` deletes and recreates
    // outDir on every build, so pointing it at the loaded directory means every
    // `npm run build` removes the extension out from under Chrome — and if
    // Chrome reads it mid-rewrite it treats the extension as UNINSTALLED and
    // destroys its `chrome.storage.local` with it. That is the proximate cause
    // of the incident this feature exists to prevent.
    //
    // `npm run build` syncs this scratch output into `dist-extension/`, which is
    // created once and never deleted wholesale (see the build script in
    // package.json). Load `dist-extension/` in chrome://extensions — it always
    // exists and always contains a valid manifest.json.
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      // The full-page app (index.html) is opened dynamically by the popup
      // launcher via chrome.runtime.getURL("index.html"), so it is not
      // declared in the manifest. Register it as an explicit entry so crxjs
      // builds and emits it into build/.
      input: {
        index: 'index.html',
      },
    },
  },
  server: {
    // Bind IPv4 loopback — some dev proxies probe 127.0.0.1, and Vite would
    // otherwise listen on IPv6 only.
    host: '127.0.0.1',
    // Honor a PORT injected by an enclosing dev proxy, falling back to 3000
    // for a plain `npm run dev`.
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
  },
});
