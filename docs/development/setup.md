# Development setup

## Toolchain

| Tool | Version | Purpose |
|---|---|---|
| TypeScript (`tsc7`) | 7.0.2 | `npm run typecheck`; installed under the alias `tsc7` (`"tsc7": "npm:typescript@7.0.2"`) because the package name `typescript` is taken by the TypeScript 6 alias below |
| `typescript` (alias of `@typescript/typescript6`) | 6.0.2 | `import 'typescript'` resolves to the TypeScript 6 compiler API (`typescript@6.0.3` under the alias `@typescript/old`) for typescript-eslint and for tsdown's declaration emission; TypeScript 7 ships no JavaScript compiler API |
| `@typescript/typescript6` | 6.0.2 | the same package under its own name: `import ts6 from '@typescript/typescript6'` and the `tsc6` command |
| `@types/node` | 24.13.4 | Node type declarations for the L1 tests and `scripts/` |
| tsdown | 0.23.0 | ESM build of every entry, `.d.ts` bundling |
| Vitest | 5.0.0 | Node test layer L1, including `.test-d.ts` type tests |
| size-limit, `@size-limit/esbuild`, `@size-limit/file` | 13.0.3 | per-entry size report (esbuild bundles the entry, `file` measures the gzipped bytes) |
| ESLint | 10.10.0 | `npm run lint`: the flat config `eslint.config.js` |
| typescript-eslint | 8.70.0 | TypeScript parser and the `recommended` rule set for `**/*.ts`, without type information |
| eslint-plugin-boundaries | 7.2.0 | module layer order of `src/` |
| knip | 6.34.0 | unused files, exports, types and dependencies, unresolved imports (`knip.json`) |
| `@eslint/markdown` | 8.0.3 | extracts the fenced code blocks of `docs/**/*.md` so the R12 lint reaches them |
| Node | 24 | runtime for every script and for CI |
| npm | lockfile v3 | package manager; CI installs with `npm ci` |

### TypeScript 6 compiler API

typescript-eslint parses with the TypeScript compiler API and declares the peer range `typescript >=4.8.4 <6.1.0`; TypeScript 7.0.2 has no JavaScript compiler API. `package.json` therefore installs `@typescript/typescript6@6.0.2` under the name `typescript` (`"typescript": "npm:@typescript/typescript6@6.0.2"`) and TypeScript 7.0.2 under the name `tsc7`. Every package that imports `typescript` (`@typescript-eslint/*`, `ts-api-utils`, `rolldown-plugin-dts`) receives the 6.0.3 API; `npm run typecheck` names the TypeScript 7 launcher explicitly.

An `overrides` entry replacing `typescript` only below `@typescript-eslint/typescript-estree` (or below `typescript-eslint`) is rejected by npm with `ERESOLVE`: the `typescript` peer of the top-level package `typescript-eslint` has to be satisfied by the top-level `typescript`, which was 7.0.2.

`@typescript/old` (`typescript@6.0.3`) and `tsc7` (`typescript@7.0.2`) both declare a `tsc` bin; `node_modules/.bin/tsc` is TypeScript 7.0.2 (`node_modules/.bin/tsc --version`). Vitest's type tests spawn `tsc` from `node_modules/.bin` and therefore run under TypeScript 7.0.2, like `npm run typecheck`, which covers the same files, including `test/l1/types.test-d.ts`.

## Scripts

| Script | Runs |
|---|---|
| `npm run build` | `tsdown`: both configurations of `tsdown.config.ts` |
| `npm run typecheck` | `node node_modules/tsc7/bin/tsc --noEmit` over `tsconfig.json` |
| `npm run test:l1` | `vitest run --project l1`: `test/l1/**/*.test.ts` in Node plus the type tests `test/l1/**/*.test-d.ts` |
| `npm test` | `vitest run`: every Vitest project |
| `npm run size` | `size-limit`: the size report, after `npm run build` |
| `npm run lint` | `eslint .` and then `knip` |

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

- `dist/`: the published build; `clean: true`; one `.d.ts` and `.d.ts.map` beside every entry (`dts: { sourcemap: true }`; rolldown-plugin-dts selects its `tsc` generator because the package resolved as `typescript` is not 7.0, and emits through the TypeScript 6.0.3 compiler API); `import.meta.env.DEV` defined as `false`.
- `dist/dev/`: the dev build; `clean: false`; no declarations; `import.meta.env.DEV` defined as `true`.

Externals: `mediabunny`, `gifenc`, `/^d3-delaunay/`, `/^delaunator/`. tsdown 0.23.0 prints a deprecation warning for the `external` option and names `deps.neverBundle` as its successor; the option still applies.

The build fails when an entry named by `entries()` has no source or when a type cannot be resolved for declaration emission. Shared chunks are allowed. Output names follow the entry map keys: `dist/index.js`, and later `dist/define.js`, `dist/export/index.js`, `dist/kit/<name>/index.js`.

`tsconfig.json` sets `allowJs` so that TypeScript types `scripts/entries.mjs` and `.size-limit.js` from their JSDoc when `tsdown.config.ts` and the tests import them, and lists `node` and `vite/client` in `types`; `vite/client` declares `import.meta.env` and comes from Vitest's own dependency on Vite, not from a direct dependency.

## Dev-build flag

In `src/`, dev-only assertions and warnings are written as

```ts
if (import.meta.env.DEV) {
  console.warn('tickframe: the message');
}
```

The published configuration defines `'import.meta.env.DEV'` as `'false'` and the dev configuration as `'true'`, so neither `dist/` nor `dist/dev/` contains the text `import.meta.env` and importing a published entry never touches `import.meta.env` at runtime. Under Vitest `import.meta.env.DEV === true` (Vite's default for test mode); nothing overrides it. `console.warn` is the only `console` method the lint allows in `src/`.

`sideEffects` in `package.json` names `./dist/define.js` and `./dist/dev/define.js`. The dev output is listed so that a bundler resolving the `development` export condition does not tree-shake the custom-element registration; the field declares every other output side-effect free. `test/l1/design-rules/import-in-node.test.ts` checks the field and imports the DOM-free modules in Node (design rule R11).

## Size report

`npm run size` runs size-limit on `dist/` and prints one row per entry, named `<exports pattern> <output name>` (`. index` today), as the gzipped size of the entry bundled by esbuild. `d3-delaunay`, `delaunator`, `mediabunny` and `gifenc` are in every check's `ignore` list, so peers and dynamic imports never count towards a total. No `limit` thresholds are set.

## Lint

`npm run lint` runs `eslint .` and then `knip`; both must exit 0.

`eslint.config.js` is an ESLint flat config: the typescript-eslint `recommended` rule set for `**/*.ts` without `parserOptions.project`, so files outside `tsconfig.json` (`examples/`, code under `docs/`, fenced Markdown blocks) lint too; `no-console` allowing only `console.warn` in `src/`; the design-rule sets R1, R7, R10, R12 and R16 and the layer order of `src/` ([design-rules.md](design-rules.md)); `linterOptions.reportUnusedDisableDirectives: 'error'`. It ignores `dist/`, `coverage/`, `node_modules/` and `test/fixtures/lint/`. `@eslint/markdown` is the processor for `docs/**/*.md`: every fenced `ts` or `js` block is linted under the virtual path `<file>.md/<n>.ts`, so it has to parse and is subject to R12 and the `recommended` rules; blocks without a language tag are skipped.

`knip.json` lists the entries (the five `exports` sources, `scripts/*.mjs`, the tests and the configuration files) and the project files (`src/**/*.ts`, `scripts/**/*.mjs`, `test/**/*.ts`). knip fails on unused files, unused exports and types, unresolved imports and unused dependencies; `ignoreExportsUsedInFile` is on. `@typescript/typescript6` and `@size-limit/esbuild` are in `ignoreDependencies`. The exports of `src/types.ts` are public API reached through the entry `src/index.ts`.

## CI

`.github/workflows/ci.yml` runs the workflow `ci` on `push` and `pull_request` with two independent jobs on `ubuntu-latest` with Node 24 (`actions/setup-node`, `cache: npm`).

`build-l1-size`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:l1`
5. `npm run size` — its output is the size report
6. upload `dist/` as the artefact `dist`

`lint`:

1. `npm ci`
2. `npm run lint`
