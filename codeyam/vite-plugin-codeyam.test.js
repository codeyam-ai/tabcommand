import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { codeyamPlugin } from './vite-plugin-codeyam.mjs';

// The plugin's resolveId/load hooks are exercised against a temp root so the
// virtual-module resolution and the on-disk fallbacks are covered hermetically.
describe('codeyamPlugin', () => {
  let root;
  let plugin;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'codeyam-plugin-'));
    plugin = codeyamPlugin();
    plugin.configResolved({ root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // a known virtual specifier is marked virtual with a leading NUL byte
  it('resolves a generated virtual module to a NUL-prefixed id', () => {
    expect(plugin.resolveId('codeyam:components')).toBe('\0codeyam:components');
    expect(plugin.resolveId('codeyam:component-scenarios')).toBe('\0codeyam:component-scenarios');
  });

  // an unrelated specifier is left for the rest of the pipeline
  it('returns null for a specifier it does not own', () => {
    expect(plugin.resolveId('react')).toBeNull();
  });

  // the isolate specifier resolves to the harness's real on-disk path when present
  it('resolves codeyam:isolate to the harness file when it exists', () => {
    mkdirSync(join(root, '.codeyam/harness'), { recursive: true });
    writeFileSync(join(root, '.codeyam/harness/isolate.jsx'), 'export default () => null;\n');
    expect(plugin.resolveId('codeyam:isolate')).toBe(resolve(root, '.codeyam/harness/isolate.jsx'));
  });

  // a missing harness is a loud failure (the popup entry imports it, no empty stub)
  it('throws when codeyam:isolate harness is missing', () => {
    expect(() => plugin.resolveId('codeyam:isolate')).toThrow(/isolation harness not found/);
  });

  // load returns the empty module when the generated file has not been written yet
  it('load falls back to an empty module before generation', () => {
    expect(plugin.load('\0codeyam:components')).toBe('export const components = {};\n');
  });

  // load returns the generated file contents once it exists
  it('load returns the generated file contents when present', () => {
    mkdirSync(join(root, '.codeyam/generated'), { recursive: true });
    writeFileSync(join(root, '.codeyam/generated/components.ts'), 'export const components = { A: 1 };\n');
    expect(plugin.load('\0codeyam:components')).toBe('export const components = { A: 1 };\n');
  });

  // load ignores ids that are not virtual (no leading NUL) or not owned
  it('load returns null for non-virtual or unknown ids', () => {
    expect(plugin.load('/src/real/module.js')).toBeNull();
    expect(plugin.load('\0codeyam:unknown')).toBeNull();
  });
});
