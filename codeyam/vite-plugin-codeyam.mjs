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
// In a PRODUCTION BUILD the harness is swapped for a stub that re-exports <App/>
// directly (`PROD_ISOLATE`). The harness only renders something other than <App/>
// when the URL carries `?isolate=`, which never happens in a packaged extension —
// but it carries ISOLATION_PROPS, and it pulls in the `codeyam:components` /
// `codeyam:component-scenarios` manifests. All of that is scenario mock data, and
// bundling it shipped internal URLs (Notion/Linear/Figma) and placeholder favicon
// links inside the published .zip. Dropping it keeps the store package free of
// codeyam artifacts; dev/editor/scenario-capture (which run the dev server) are
// untouched. Set CODEYAM_KEEP_HARNESS=1 to force the harness into a build.
//
// The stub is JSX-free on purpose: a `\0`-virtual id has no `.jsx` extension, so
// esbuild would parse JSX as plain JS and choke. A bare re-export sidesteps that.
const HARNESS_FILE = '.codeyam/harness/isolate.jsx';

const PROD_ISOLATE_ID = 'codeyam:isolate-prod';
const PROD_ISOLATE = "export { App as default } from '/src/lib/pages';\n";

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
  let stripHarness = false;
  const generatedDir = () => resolve(root, '.codeyam/generated');

  return {
    name: 'codeyam-virtual-modules',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      stripHarness =
        config.command === 'build' && !process.env.CODEYAM_KEEP_HARNESS;
    },
    resolveId(id) {
      // Production build: swap the harness (and the scenario data it drags in)
      // for a stub that is just <App/>. See the note by PROD_ISOLATE above.
      if (id === 'codeyam:isolate' && stripHarness) {
        return `\0${PROD_ISOLATE_ID}`;
      }
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
      if (id === `\0${PROD_ISOLATE_ID}`) return PROD_ISOLATE;
      const spec = VIRTUAL_MODULES[id.slice(1)];
      if (!spec) return null;
      // In a production build the harness is gone, so nothing imports these —
      // but resolve them empty anyway, so a stray import can never pull scenario
      // data into the shipped package.
      if (stripHarness) return spec.empty;
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
