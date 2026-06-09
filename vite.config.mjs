import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
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
    // Bind IPv4 loopback — the codeyam editor proxy probes 127.0.0.1, and
    // Vite would otherwise listen on IPv6 only.
    host: '127.0.0.1',
    // Honor the PORT injected by the codeyam editor's reverse proxy (it runs
    // the app on the injected port and proxies the configured app port to it).
    // Falls back to 3000 for a plain `npm run dev`.
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
  },
});
