# Development setup

## Toolchain

| Tool | Version | Purpose |
|---|---|---|
| TypeScript | 7.0.2 | `npm run typecheck` and declaration emission (tsdown runs the native compiler of this package) |
| `@typescript/typescript6` | 6.0.2 | TypeScript 6 compiler API (`import ts6 from '@typescript/typescript6'`) and the `tsc6` command; TypeScript 7 ships no JavaScript compiler API. Depends on `typescript@6.0.3` under the alias `@typescript/old`. |
| `@types/node` | 24.13.4 | Node type declarations for the L1 tests and `scripts/` |
| tsdown | 0.23.0 | ESM build of every entry, `.d.ts` bundling |
| Vitest | 5.0.0 | Node test layer L1, including `.test-d.ts` type tests |
| size-limit, `@size-limit/esbuild`, `@size-limit/file` | 13.0.3 | per-entry size report (esbuild bundles the entry, `file` measures the gzipped bytes) |
| Node | 24 | runtime for every script and for CI |
| npm | lockfile v3 | package manager; CI installs with `npm ci` |

## Scripts

| Script | Runs |
|---|---|
| `npm run build` | `tsdown`: both configurations of `tsdown.config.ts` |
| `npm run typecheck` | `node node_modules/typescript/bin/tsc --noEmit` over `tsconfig.json` |
| `npm run test:l1` | `vitest run --project l1`: `test/l1/**/*.test.ts` in Node plus the type tests `test/l1/**/*.test-d.ts` |
| `npm test` | `vitest run`: every Vitest project |
| `npm run size` | `size-limit`: the size report, after `npm run build` |

`typecheck` names the TypeScript 7 launcher explicitly. `@typescript/old` (`typescript@6.0.3`) and `typescript@7.0.2` both declare a `tsc` bin; npm links bins in path order and keeps the first, so `node_modules/.bin/tsc` is TypeScript 6.0.3. Vitest's type tests spawn `tsc` from `node_modules/.bin` and therefore run under TypeScript 6.0.3; `npm run typecheck` covers the same files, including `test/l1/types.test-d.ts`, under 7.0.2.

## Build and entry resolution

`scripts/entries.mjs` exports `entries()`, the map from output name to source path for every entry whose source file exists, checked with `fs.existsSync` relative to the repository root. tsdown, `.size-limit.js` and `test/l1/entries.test.ts` all read it, so adding an entry is adding its source file.

| Output name | Source | Exports pattern |
|---|---|---|
| `index` | `src/index.ts` | `.` |
| `define` | `src/define.ts` | `./define` |
| `export/index` | `src/export/index.ts` | `./export` |
| `export/bake/index` | `src/export/bake/index.ts` | `./export/bake` |
| `kit/<name>/index` | `src/kit/<name>/index.ts`, one per directory under `src/kit/` | `./kit/*` |

`exportsPatterns()` returns the five patterns; `patternFor(outputName)` maps an output name to its pattern (`kit/axis/index` → `./kit/*`) and throws for any other name. Today `entries()` returns `{ index: 'src/index.ts' }`.

`tsdown.config.ts` builds two outputs from the same entry map, both ESM, `platform: 'browser'`, tree-shaken, with sourcemaps:

- `dist/`: the published build; `clean: true`; one `.d.ts` and `.d.ts.map` beside every entry (`dts: { sourcemap: true }`, emitted by TypeScript 7.0.2); `import.meta.env.DEV` defined as `false`.
- `dist/dev/`: the dev build; `clean: false`; no declarations; `import.meta.env.DEV` defined as `true`.

Externals: `mediabunny`, `gifenc`, `/^d3-delaunay/`, `/^delaunator/`. tsdown 0.23.0 prints a deprecation warning for the `external` option and names `deps.neverBundle` as its successor; the option still applies.

The build fails when an entry named by `entries()` has no source or when a type cannot be resolved for declaration emission. Shared chunks are allowed. Output names follow the entry map keys: `dist/index.js`, and later `dist/define.js`, `dist/export/index.js`, `dist/kit/<name>/index.js`.

`tsconfig.json` sets `allowJs` so that TypeScript types `scripts/entries.mjs` and `.size-limit.js` from their JSDoc when `tsdown.config.ts` and the tests import them, and lists `node` and `vite/client` in `types`; `vite/client` declares `import.meta.env` and comes from Vitest's own dependency on Vite, not from a direct dependency.

## Dev-build flag

In `src/`, dev-only assertions and warnings are written as

```ts
if (import.meta.env.DEV) { ... }
```

The published configuration defines `'import.meta.env.DEV'` as `'false'` and the dev configuration as `'true'`, so neither `dist/` nor `dist/dev/` contains the text `import.meta.env` and importing a published entry never touches `import.meta.env` at runtime. Under Vitest `import.meta.env.DEV === true` (Vite's default for test mode); nothing overrides it.

`sideEffects` in `package.json` names `./dist/define.js` and `./dist/dev/define.js`. The dev output is listed so that a bundler resolving the `development` export condition does not tree-shake the custom-element registration; the field declares every other output side-effect free.

## Size report

`npm run size` runs size-limit on `dist/` and prints one row per entry, named `<exports pattern> <output name>` (`. index` today), as the gzipped size of the entry bundled by esbuild. `d3-delaunay`, `delaunator`, `mediabunny` and `gifenc` are in every check's `ignore` list, so peers and dynamic imports never count towards a total. No `limit` thresholds are set.

## CI

`.github/workflows/ci.yml` runs the workflow `ci` on `push` and `pull_request` with one job, `build-l1-size`, on `ubuntu-latest` with Node 24 (`actions/setup-node`, `cache: npm`):

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:l1`
5. `npm run size` — its output is the size report
6. upload `dist/` as the artefact `dist`
