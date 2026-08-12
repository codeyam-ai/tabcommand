// Mirror the Vite build output into a STABLE extension directory.
//
// Vite builds with `emptyOutDir: true`, which deletes and recreates `build/` on
// every run. That is fine for a scratch directory and fatal for the directory
// Chrome has loaded as an unpacked extension: if Chrome reads the directory
// while it is missing — or sees it without a `manifest.json` — it treats the
// extension as UNINSTALLED and destroys its `chrome.storage.local` with it.
// That is what wiped a real user's groups.
//
// So `build/` stays the scratch target and this script mirrors it into
// `dist/extension/`, which is created once and never removed wholesale. Load
// `dist/extension/` in chrome://extensions.
//
// It lives under `dist/` deliberately: every tool in this repo — eslint, the
// test runner's source globs, and codeyam's entity analyzer — already excludes
// `dist/`, so the mirrored bundle does not get linted, scanned for tests, or
// enrolled in the glossary as thousands of one-letter minified identifiers.
//
// Two ordering rules keep the mirror safe to read at any instant:
//   1. Every other file is written BEFORE `manifest.json`, so the directory
//      never advertises an extension whose assets have not landed yet.
//   2. Stale files are pruned LAST, and the directory itself is never removed.

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(projectRoot, 'build');
const TARGET_DIR = path.join(projectRoot, 'dist', 'extension');
export const MANIFEST = 'manifest.json';

// ── The two safety rules, as pure functions ──────────────────────────────────
// Both are what actually keep the loaded directory readable at every instant, so
// both are unit-tested rather than left implicit inside the filesystem walk.

// The copy ORDER: every asset first, `manifest.json` last. Chrome treats a
// directory with a manifest as an installed extension, so writing the manifest
// before its assets would briefly advertise an extension whose code is not there
// yet. Returns the source list reordered, never adding or dropping an entry.
export function orderedSyncPlan(sourceFiles) {
  const assets = sourceFiles.filter((f) => f !== MANIFEST);
  return sourceFiles.includes(MANIFEST) ? [...assets, MANIFEST] : assets;
}

// Which target files the new build no longer produces. A plain set difference,
// but it is the one place a bug would DELETE something the extension still
// needs, so it is pinned by tests rather than inlined into the removal loop.
export function staleFiles(sourceFiles, targetFiles) {
  const keep = new Set(sourceFiles);
  return targetFiles.filter((relative) => !keep.has(relative));
}

// Every file under `dir`, as paths relative to it.
async function listFiles(dir, prefix = '') {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  const files = [];
  for (const entry of entries) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(dir, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

async function copyFile(relative) {
  const from = path.join(SOURCE_DIR, relative);
  const to = path.join(TARGET_DIR, relative);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

// Remove empty subdirectories left behind by pruning. `dir` itself is never a
// removal candidate — only its descendants — so TARGET_DIR always survives.
async function pruneEmptyDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    await pruneEmptyDirs(child);
    if ((await fs.readdir(child)).length === 0) await fs.rmdir(child);
  }
}

// Delete the files `staleFiles` identified, then tidy up empty directories.
async function pruneStale(sourceFiles) {
  const targetFiles = await listFiles(TARGET_DIR);
  for (const relative of staleFiles(sourceFiles, targetFiles)) {
    await fs.rm(path.join(TARGET_DIR, relative), { force: true });
  }
  await pruneEmptyDirs(TARGET_DIR);
}

async function main() {
  const sourceFiles = await listFiles(SOURCE_DIR);
  if (sourceFiles.length === 0) {
    console.error(`[sync-extension-dir] nothing to sync — ${SOURCE_DIR} is empty or missing.`);
    process.exit(1);
  }

  await fs.mkdir(TARGET_DIR, { recursive: true });

  for (const relative of orderedSyncPlan(sourceFiles)) {
    await copyFile(relative);
  }

  await pruneStale(sourceFiles);

  console.log(
    `[sync-extension-dir] synced ${sourceFiles.length} files into dist/extension/ ` +
    `— load THAT directory in chrome://extensions, not build/.`
  );
}

// Only run the sync when this file is EXECUTED (`node scripts/sync-extension-dir.mjs`),
// never when it is merely imported. `sync-extension-dir.test.js` imports the pure
// helpers above, and an unguarded top-level `main()` runs the whole sync — including
// its `process.exit(1)` when `build/` is absent — during the test run. Vitest surfaces
// that as an unhandled rejection and fails the suite even though every test passed,
// and it only reproduces where `build/` does NOT already exist: green on any machine
// that has built recently, red in CI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('[sync-extension-dir] failed:', e);
    process.exit(1);
  });
}
