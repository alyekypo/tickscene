# Design rules

The twenty rules are normative; each has a mechanical check, and the fourth column names the file or job that enforces it once that check exists.

| # | Rule | Check | Enforced where |
|---|---|---|---|
| R1 | One renderer: the SVG DOM. No second render path on WebGL or Canvas; Canvas 2D appears only inside the export sink. | lint: `getContext(`/`WebGL` tokens only under `src/export/` | `eslint.config.js` rule set `R1` (`lint` job) |
| R2 | Public time is whole ticks; non-integers are rejected at the API boundary. | L1 property test: random `TimeInput` normalises to integers or throws | — |
| R3 | `evaluate` is pure: no DOM, clock or events; no mutation of `Compiled` except `Run.cursor`. | byte-identical frames for shuffled T (AC-6) | — |
| R4 | Keys mandatory, unique among siblings, never inferred. | duplicate/missing-key fixtures fail with key path + scene | — |
| R5 | Accessible name mandatory; a nameless root is `aria-hidden` and warned in dev. | axe + unit test of §5.4 order | — |
| R6 | Per-mark `label`/`focusable` render `<title>`, `tabindex="0"` and a visible focus ring. | L2: Tab reaches marks in order; ring visible in screenshot | — |
| R7 | Live regions belong to the host or `kit/narration`; the core never writes `aria-live`. | grep in `src/` excluding `kit/narration` | `eslint.config.js` rule set `R7` (`lint` job) |
| R8 | Contrast is the author's (WCAG 1.4.11); docs state it; examples pass axe colour checks. | axe on the five examples | — |
| R9 | Fonts load before measurement and export: one `document.fonts.ready` await, then recompile. | L2 test with a slow data-URI font | — |
| R10 | Wrapped text is `kit/text` `<tspan>` lines; the core never wraps. | grep `tspan` outside `kit/text` | `eslint.config.js` rule set `R10` (`lint` job) |
| R11 | Side-effect-free core; only `./define` registers anything. | `sideEffects` check + import-in-Node test | `test/l1/design-rules/import-in-node.test.ts` |
| R12 | Scene functions pure and deterministic; `Math.random`, `Date.now`, `performance.now` banned. | lint on examples/docs; dev-build double-compile assertion | `eslint.config.js` rule set `R12` (`lint` job) |
| R13 | The framework generates no `<use>`. | grep on renderer output in fixtures | — |
| R14 | Helpers never animate filters or masks. | kit unit tests; docs | — |
| R15 | Prefer `transform`/`opacity` on groups; the compiler never rewrites author geometry. | fixture: attributes reach the DOM verbatim | — |
| R16 | No layout reads during playback: `getBBox`, `getBoundingClientRect`, `getComputedTextLength`, `getComputedStyle`, `offset*` banned on the frame path. | lint scoped to `src/evaluate`, `src/render`, `src/clock` | `eslint.config.js` rule set `R16` (`lint` job) |
| R17 | Presentation attributes only; author `style` passes through. | fixture | — |
| R18 | `<defs>` ids instance-prefixed; `url(#)`/`href="#"` rewritten; `xlink:href` → `href`. | fixture with two instances | — |
| R19 | Reduced motion honoured by default (`reduced-motion="user"`). | L2 with emulated media | — |
| R20 | Every stated limit has an escape hatch named in the README (B-0). | docs test: each §12.1 row links a hatch | — |

The lint rule sets are `no-restricted-syntax` selectors whose messages begin with the rule id, so every hit reports the rule, the file, the line and the column. R1 is scoped to `src/` outside `src/export/`, R7 to `src/` outside `src/kit/narration/`, R10 to `src/` outside `src/kit/text/` and `src/compile/allowlist.ts` (the SVG tag allowlist), R12 to `examples/`, code files under `docs/` and the fenced `ts`/`js` blocks of `docs/**/*.md` (extracted by `@eslint/markdown`), R16 to `src/evaluate/`, `src/render/` and `src/clock/`. R16 does not name `getScreenCTM`, an input-path geometry read (spec §5.3), and does not cover `src/controller/`, where the measurer calls `getComputedTextLength` off the frame path. `src/` additionally allows no `console` method but `warn`.

## Exemptions

The only exemption is a disable comment that names the rule and a reason:

```text
// eslint-disable-next-line no-restricted-syntax -- R16: <reason>
```

`linterOptions.reportUnusedDisableDirectives` is `error`, so a directive that no longer suppresses anything fails the lint. ESLint does not require the `-- <reason>` description; `test/l1/design-rules/lint-rules.test.ts` scans every `eslint-disable` comment under `src/` and fails when its description does not match `-- R<n>: <reason>`. The follower clock's one `getBoundingClientRect` read per scroll frame (`src/clock/`, spec §7.1.2, "one read, before any write") is the one place an R16 exemption is expected, with the reason `R16: input-path geometry read (spec §7.1.2)`.

## Layer order

`eslint-plugin-boundaries` (`eslint.config.js`) assigns every file under `src/` to one layer. The table order is the dependency order.

| Layer | Files |
|---|---|
| `types` | `src/types.ts` |
| `syntax` | `src/syntax/**` |
| `easing` | `src/easing/**` |
| `scale` | `src/scale/**` |
| `clock` | `src/clock/**` |
| `compile` | `src/compile/**` |
| `evaluate` | `src/evaluate/**` |
| `render` | `src/render/**` |
| `controller` | `src/controller/**` |
| `element` | `src/element/**`, `src/define.ts` |
| `export` | `src/export/**` |
| `index` | `src/index.ts` |
| `kit` | `src/kit/*/**` |

A layer imports only layers strictly earlier in the table, with these narrowings and exceptions: `easing`, `scale` and `clock` import `types` and `syntax` but not each other; `compile` imports `types`, `syntax` and `easing`; `index` imports every layer but `kit`; `kit` imports only `index`, the public API of `.`, never a module path. `boundaries/dependencies` runs with `default: 'disallow'`, so a dependency that no allow list names is an error; `import`, `export … from` and `import()` all count. `boundaries/no-unknown-files` makes a file under `src/` that belongs to no layer an error, and `boundaries/no-unknown-dependencies` makes a dependency on a local file outside the layers an error. Folder layers are element descriptors (`partialMatch: false`); the single files `src/types.ts`, `src/define.ts` and `src/index.ts` are file descriptors. Each kit folder is one element, so files inside one kit import each other freely. Files outside `src/` have no layer and are not checked.

## Running

`npm run lint` runs `eslint .` and then `knip`; the CI job `lint` runs the same command. `npm run test:l1` runs `test/l1/design-rules/lint-rules.test.ts`, which lints the snippets in `test/fixtures/lint/` under virtual paths chosen to fall inside or outside each rule's scope, checks the exemption form, runs the lint over the tree and runs knip against the tree and against a copy with one unused export, and `test/l1/design-rules/import-in-node.test.ts`, the R11 check.
