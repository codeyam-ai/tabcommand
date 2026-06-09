/**
 * CodeYam Seed Adapter for localStorage.
 *
 * For chrome extensions and web apps that use localStorage instead of a database.
 * Transforms structured seed data into localStorage key-value pairs that the
 * CodeYam binary can inject via Playwright's page.evaluate().
 *
 * Usage: npx tsx .codeyam/seed-adapter.ts <path-to-seed-data.json>
 *
 * The JSON file has the format:
 * {
 *   "type": "application",
 *   "seed": {
 *     "todos": [{ "id": 1, "text": "Buy milk" }, ...],
 *     "settings": { "theme": "dark", "lang": "en" }
 *   }
 * }
 *
 * Output (to stdout as JSON):
 * {
 *   "localStorage": {
 *     "todos": "[{\"id\":1,\"text\":\"Buy milk\"}]",
 *     "settings": "{\"theme\":\"dark\",\"lang\":\"en\"}"
 *   }
 * }
 *
 * The binary reads this stdout JSON and injects each key-value pair into
 * the browser's localStorage via page.evaluate() before screenshot capture.
 *
 * Export mode is not supported — localStorage is ephemeral and browser-only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// codeyam-adapter-version: 4

/**
 * Load `.env*` files into `process.env` in canonical precedence order,
 * matching Next.js conventions:
 *
 *   .env.local > .env.development.local > .env.development > .env
 *
 * Later wins. Files that don't exist are silently skipped.
 * `process.env` keys that are already set are NEVER overwritten — manually-
 * set env vars (CI, shell, the editor's `PORT` injection) always win.
 *
 * Roots searched (in order, deduped):
 *   1. `cwd` argument (defaults to `process.cwd()`)
 *   2. The adapter script's parent directory (`<project>/` when the
 *      adapter is deployed at `.codeyam/seed-adapter.ts`)
 *   3. The adapter script's directory itself (`.codeyam/`)
 *
 * The multi-root search exists because `npx tsx` can be spawned with a
 * cwd that isn't the project root, in which case the bare `process.cwd()`
 * lookup would miss the project's `.env*` files entirely.
 *
 * Inlined per adapter rather than imported from a shared module because
 * adapters are copied verbatim into `.codeyam/seed-adapter.ts` and run
 * standalone.
 */
export function loadDotEnvFiles(cwd: string = process.cwd()): void {
  const preExisting = new Set(Object.keys(process.env));
  const filesInOrder = [
    '.env',
    '.env.development',
    '.env.development.local',
    '.env.local',
  ];

  let scriptDir: string | null = null;
  try {
    scriptDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // import.meta.url unavailable — fall back to the explicit cwd.
  }
  const roots = Array.from(
    new Set(
      [cwd, scriptDir ? path.resolve(scriptDir, '..') : null, scriptDir].filter(
        (r): r is string => typeof r === 'string' && r.length > 0,
      ),
    ),
  );

  const seenFiles = new Set<string>();
  for (const name of filesInOrder) {
    for (const root of roots) {
      const filePath = path.join(root, name);
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!preExisting.has(key)) {
          process.env[key] = value;
        }
      }
    }
  }
}

/**
 * Pure transform: take the parsed seed object and return the
 * `{ localStorage: { ... } }` shape that Playwright's page.evaluate() consumes.
 *
 * Each seed key becomes a localStorage entry whose value is a JSON-stringified
 * version of the original value. Objects, arrays, and primitives all round-trip
 * through JSON.stringify(); an empty seed produces an empty localStorage map.
 */
export function transformSeed(
  seed: Record<string, unknown>,
): { localStorage: Record<string, string> } {
  const localStorage: Record<string, string> = {};
  for (const [key, value] of Object.entries(seed)) {
    localStorage[key] = JSON.stringify(value);
  }
  return { localStorage };
}

/**
 * Adapter entry point: load env files, parse the seed JSON, and write
 * the resulting localStorage payload to the output path so the editor
 * can inject it into the browser.
 */
export function main() {
  loadDotEnvFiles();
  const seedDataPath = process.argv[2];
  if (!seedDataPath) {
    console.error('Usage: npx tsx .codeyam/seed-adapter.ts <seed-data.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(seedDataPath, 'utf-8');
  const data = JSON.parse(raw);
  // Canonical envelope unwrap: tables live under `seed`. Fall through
  // to the flat shape for back-compat with hand-written adapters.
  const seed: Record<string, unknown> =
    data && typeof data === 'object' && data.seed && typeof data.seed === 'object'
      ? data.seed
      : data;
  // Skip the `_auth` meta-field if it leaked in via the flat back-compat
  // shape — localStorage never had auth, so this is purely defensive.
  if (Object.prototype.hasOwnProperty.call(seed, '_auth')) {
    delete (seed as Record<string, unknown>)._auth;
  }

  const expectedKeys = Object.keys(seed);
  const expectedRows = expectedKeys.length;

  // Output the localStorage map as JSON to stdout
  // The binary will parse this and inject via page.evaluate()
  const out = transformSeed(seed);
  console.log(JSON.stringify(out, null, 2));

  // Structured per-"table" emit lets the editor count what the adapter
  // produced. For localStorage, each input key becomes one localStorage
  // entry — emit one `inserted 1 rows into <key>` line per entry so the
  // row-count banner has a number to display.
  let actualRows = 0;
  for (const key of expectedKeys) {
    console.error(`[codeyam-seed] inserted 1 rows into ${key}`);
    actualRows += 1;
  }

  if (expectedRows > 0 && actualRows === 0) {
    console.error(
      `[codeyam-seed] FATAL: input declared ${expectedRows} localStorage entries ` +
        `but adapter emitted 0. Likely a contract mismatch. Inspect the ` +
        `snapshot at .codeyam/tmp/seed-input-snapshot-*.json to see what ` +
        `the editor sent.`,
    );
    process.exit(1);
  }
}

// Only run main() when the script is invoked directly (not when imported by tests).
// `process.argv[1]` is the script path; if it ends with this file's basename, run.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /seed-adapter\.(ts|js|cjs|mjs)$/.test(process.argv[1]);

if (invokedDirectly) {
  if (process.argv[2] === '--export') {
    console.error('Export mode is not supported for localStorage adapter.');
    console.error('localStorage is ephemeral and browser-only.');
    process.exit(1);
  } else {
    main();
  }
}
