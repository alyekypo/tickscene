# Architecture overview

## Pipeline

Tickframe implements one pipeline from a declarative program to SVG DOM:

`Program` + `Ctx` → compile → `Compiled` → evaluate(`Compiled`, T, `Blend?`) → `Frame` → render → SVG DOM.

- A clock produces the integer tick sequence T and derives events from the half-open interval `(prevT, T]`.
- The element wires clock, controller and DOM together.
- Export runs the same evaluate on a detached clone or in a frame loop.

Time-valued inputs accept `TimeInput` and are normalised to integer `Tick` by the compiler; every runtime structure holds only `Tick`.

## Module layers

Every module respects this dependency order:

`types` → `easing`, `scale`, `clock` → `compile` → `evaluate` → `render` → `controller` → `element`

- `export` sits above `controller`.
- Kits import only the public API of `.`.
- DOM-free set: `types`, `easing`, `scale`, `clock`, `compile`, `evaluate`. These run in Node with `requestAnimationFrame`, `now` and `measure` injected.

Modules implemented so far:

| Module | Entry | DOM-free | Depends on | Contents |
|---|---|---|---|---|
| `types` | `.` | yes | — | the §6 data model |

## Entry points

`package.json` declares five `exports` patterns, each with `types` as its first condition, a `development` condition and a `default` condition:

| Pattern | Output |
|---|---|
| `.` | `dist/index.js` |
| `./define` | `dist/define.js` |
| `./export` | `dist/export/index.js` |
| `./export/bake` | `dist/export/bake/index.js` |
| `./kit/*` | `dist/kit/*/index.js` |

Only `.` resolves today: `scripts/entries.mjs` derives the build list from the entry sources that exist, so a pattern becomes resolvable when its source file is created. No `main`, `module`, `browser` or `typings` field exists.

## Repository layout

```
package.json  tsconfig.json  tsdown.config.ts  vitest.config.ts  .size-limit.js  LICENSE  .gitignore
scripts/entries.mjs
src/types.ts
src/index.ts
test/l1/entries.test.ts
test/l1/types.test-d.ts
.github/workflows/ci.yml
docs/README.md
docs/architecture/overview.md
docs/development/setup.md
```

Module directories are created by the prompt implementing them.

## Dev build

Dev-only assertions and warnings in `src/` are written as `if (import.meta.env.DEV) { ... }`. The build compiles the flag to a constant: `false` for the published output in `dist/`, `true` for the dev output in `dist/dev/`, so neither output contains the text `import.meta.env`. The `development` export condition of every entry points at `dist/dev/`, and bundlers that resolve that condition receive the dev build. Under Vitest, `import.meta.env.DEV === true`.
