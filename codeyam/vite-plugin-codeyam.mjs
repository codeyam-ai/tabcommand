import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CodeYam component-isolation virtual modules.
//
// Stack assumption: this plugin exists only for the Vite query-param isolation
// stacks (chrome-extension-react here). It exposes the two codeyam-generated
// artifacts as virtual ES modules so they can live under `.codeyam/generated/`
// — a gitignored, derived cache — instead of being mixed into the project's own
// `src/` tree:
//
//   import { components }         from 'codeyam:components';
//   import { componentScenarios } from 'codeyam:component-scenarios';
//
// The backing files are written by `codeyam-editor editor isolate` /
// `editor register`. Before the first generation (a freshly scaffolded project
// running `npm run dev` with nothing registered yet) the files do not exist, so
// `load()` returns a valid empty module — the import always resolves and the app
// renders.
//
// A third specifier, `codeyam:isolate`, exposes the committed isolation harness
// that lives under `.codeyam/harness/isolate.jsx`. Unlike the two generated
// modules above it is NOT served as a `\0`-virtual module: the harness is real
// JSX, and esbuild infers its loader from the module id's extension. A virtual
// id carries no `.jsx` suffix, so it would be parsed as plain JS and choke on
// the JSX. Instead `resolveId` returns the harness's real on-disk path, letting
// Vite + @vitejs/plugin-react transform it as an ordinary `.jsx` source file.
const HARNESS_FILE = '.codeyam/harness/isolate.jsx';

const VIRTUAL_MODULES = {
  'codeyam:components': {
    file: '.codeyam/generated/components.ts',
    empty: 'export const components = {};\n',
  },
  'codeyam:component-scenarios': {
    file: '.codeyam/generated/component-scenarios.ts',
    empty: 'export const componentScenarios = {};\n',
  },
};

export function codeyamPlugin() {
  let root = process.cwd();
  const generatedDir = () => resolve(root, '.codeyam/generated');

  return {
    name: 'codeyam-virtual-modules',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      // `codeyam:isolate` resolves to the harness's real path so Vite transforms
      // it as a normal `.jsx` file (JSX + the harness's own `/src/lib/pages` and
      // `codeyam:*` imports resolve through the standard pipeline). Fail loud if
      // the committed harness is missing — the popup entry imports it and there
      // is no sensible empty stub for an entrypoint.
      if (id === 'codeyam:isolate') {
        const abs = resolve(root, HARNESS_FILE);
        if (!existsSync(abs)) {
          throw new Error(
            `[codeyam] isolation harness not found at ${HARNESS_FILE}. ` +
              `It ships with the template and must be committed; re-scaffold or restore it.`,
          );
        }
        return abs;
      }
      // `\0` marks the id as virtual so Vite and other plugins do not try to
      // resolve it on disk. The component manifest imports its components with
      // root-relative specifiers (`/src/lib/components/...`), which Vite resolves
      // from the project root regardless of where this virtual module "lives".
      return id in VIRTUAL_MODULES ? `\0${id}` : null;
    },
    load(id) {
      if (!id.startsWith('\0')) return null;
      const spec = VIRTUAL_MODULES[id.slice(1)];
      if (!spec) return null;
      const abs = resolve(root, spec.file);
      return existsSync(abs) ? readFileSync(abs, 'utf8') : spec.empty;
    },
    configureServer(server) {
      // Re-render the isolated component when codeyam regenerates an artifact:
      // watch `.codeyam/generated/` and invalidate the virtual modules so the
      // next request re-runs `load()` and picks up the fresh file contents.
      server.watcher.add(generatedDir());
      const onChange = (file) => {
        if (!resolve(file).startsWith(generatedDir())) return;
        for (const id of Object.keys(VIRTUAL_MODULES)) {
          const mod = server.moduleGraph.getModuleById(`\0${id}`);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
    },
  };
}
