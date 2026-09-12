import markdown from '@eslint/markdown';
import { defineConfig, globalIgnores } from 'eslint/config';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/**
 * Design rules checked as `no-restricted-syntax` selectors (docs/development/design-rules.md).
 * Every message begins with the rule id so a hit can be attributed; the only exemption form is
 * `// eslint-disable-next-line no-restricted-syntax -- R<n>: <reason>`.
 */

// R1 — one renderer: the SVG DOM. Canvas 2D only inside the export sink (src/export/).
const R1 = [
  {
    selector: 'CallExpression[callee.property.name="getContext"]',
    message: 'R1: Canvas 2D appears only inside the export sink (src/export/)',
  },
  { selector: 'Identifier[name=/WebGL/]', message: 'R1: no WebGL render path' },
  { selector: 'Literal[value=/WebGL/]', message: 'R1: no WebGL render path' },
  { selector: 'TemplateElement[value.raw=/WebGL/]', message: 'R1: no WebGL render path' },
  { selector: 'Literal[value=/foreignObject/]', message: 'R1: the framework emits no <foreignObject>' },
  { selector: 'TemplateElement[value.raw=/foreignObject/]', message: 'R1: the framework emits no <foreignObject>' },
];

// R7 — live regions belong to the host document or kit/narration.
const R7 = ['Literal[value=/aria-live/]', 'TemplateElement[value.raw=/aria-live/]', 'MemberExpression[property.name="ariaLive"]'].map(
  (selector) => ({
    selector,
    message: 'R7: the core never writes aria-live; live regions belong to the host document or kit/narration',
  }),
);

// R10 — wrapped text is kit/text's; src/compile/allowlist.ts is the SVG tag allowlist and may name tspan.
const R10 = ['Literal[value=/tspan/]', 'TemplateElement[value.raw=/tspan/]'].map((selector) => ({
  selector,
  message: 'R10: the core never wraps text; <tspan> lines are produced by kit/text',
}));

// R12 — scene functions pure and deterministic (examples and docs, fenced Markdown blocks included).
const r12Message = (name) =>
  `R12: scene functions must be pure and deterministic; ${name} is banned in examples and docs`;
const r12Property = (object, property) => [
  {
    selector: `MemberExpression[object.name="${object}"]:matches([property.name="${property}"], [property.value="${property}"])`,
    message: r12Message(`${object}.${property}`),
  },
  {
    selector: `VariableDeclarator[init.name="${object}"] > ObjectPattern > Property:matches([key.name="${property}"], [key.value="${property}"])`,
    message: r12Message(`${object}.${property}`),
  },
];
const R12 = [
  ...r12Property('Math', 'random'),
  ...r12Property('Date', 'now'),
  ...r12Property('performance', 'now'),
  {
    selector:
      'MemberExpression[object.object.name="globalThis"][object.property.name="performance"]:matches([property.name="now"], [property.value="now"])',
    message: r12Message('globalThis.performance.now'),
  },
  { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: r12Message('new Date()') },
];

// R16 — no layout reads on the frame path. getScreenCTM is an input-path read (§5.3) and stays allowed.
const r16Message = (apis) =>
  `R16: no layout reads during playback — ${apis} banned in src/evaluate, src/render, src/clock`;
const R16 = [
  {
    selector: 'MemberExpression[property.name=/^(getBBox|getBoundingClientRect|getComputedTextLength|getClientRects)$/]',
    message: r16Message('getBBox, getBoundingClientRect, getComputedTextLength and getClientRects are'),
  },
  { selector: 'CallExpression[callee.name="getComputedStyle"]', message: r16Message('getComputedStyle is') },
  { selector: 'MemberExpression[property.name="getComputedStyle"]', message: r16Message('getComputedStyle is') },
  {
    selector: 'MemberExpression[property.name=/^offset(Width|Height|Top|Left|Parent)$/]',
    message: r16Message('offsetWidth, offsetHeight, offsetTop, offsetLeft and offsetParent are'),
  },
  {
    selector: 'MemberExpression[property.name=/^(clientWidth|clientHeight|scrollWidth|scrollHeight)$/]',
    message: r16Message('clientWidth, clientHeight, scrollWidth and scrollHeight are'),
  },
];

/**
 * A flat config replaces a rule's options with those of the last matching config object, it does
 * not merge them. Each region therefore lists the union of the rule sets that apply inside it;
 * the regions after the first are the exemptions of R1, R7, R10 and the scope of R16, which are
 * pairwise disjoint.
 */
const restrictedSyntax = (files, ...sets) => ({
  files,
  rules: { 'no-restricted-syntax': ['error', ...sets.flat()] },
});

/**
 * Module layers (architecture §4.2), in dependency order. `dir` layers are
 * eslint-plugin-boundaries element descriptors (one element per folder); `file` layers are file
 * descriptors, because a single file is not a folder element. `allow` lists the layers a layer
 * may import; every other dependency between layers is disallowed. `kit` imports only `index`,
 * the public API of `.`.
 */
const layers = [
  { type: 'types', file: 'src/types.ts', allow: [] },
  { type: 'syntax', dir: 'src/syntax', allow: ['types'] },
  { type: 'easing', dir: 'src/easing', allow: ['types', 'syntax'] },
  { type: 'scale', dir: 'src/scale', allow: ['types', 'syntax'] },
  { type: 'clock', dir: 'src/clock', allow: ['types', 'syntax'] },
  { type: 'compile', dir: 'src/compile', allow: ['types', 'syntax', 'easing'] },
  { type: 'evaluate', dir: 'src/evaluate', allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile'] },
  { type: 'render', dir: 'src/render', allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate'] },
  {
    type: 'controller',
    dir: 'src/controller',
    allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate', 'render'],
  },
  {
    type: 'element',
    dir: 'src/element',
    file: 'src/define.ts',
    allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate', 'render', 'controller'],
  },
  {
    type: 'export',
    dir: 'src/export',
    allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate', 'render', 'controller', 'element'],
  },
  {
    type: 'index',
    file: 'src/index.ts',
    allow: ['types', 'syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate', 'render', 'controller', 'element', 'export'],
  },
  { type: 'kit', dir: 'src/kit/*', allow: ['index'] },
];

/** Entity selectors matching every file of the named layers, whether folder element or single file. */
const layerSelector = (types) => [{ element: { type: types } }, { file: { categories: types } }];

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', 'node_modules/**', 'test/fixtures/lint/**']),
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  { files: ['**/*.ts'], extends: [tseslint.configs.recommended] },
  { files: ['src/**/*.ts'], rules: { 'no-console': ['error', { allow: ['warn'] }] } },

  restrictedSyntax(['src/**/*.ts'], R1, R7, R10),
  restrictedSyntax(['src/export/**/*.ts'], R7, R10),
  restrictedSyntax(['src/kit/narration/**/*.ts'], R1, R10),
  restrictedSyntax(['src/kit/text/**/*.ts'], R1, R7),
  restrictedSyntax(['src/compile/allowlist.ts'], R1, R7),
  restrictedSyntax(['src/evaluate/**/*.ts', 'src/render/**/*.ts', 'src/clock/**/*.ts'], R1, R7, R10, R16),

  { files: ['docs/**/*.md'], plugins: { markdown }, processor: 'markdown/markdown' },
  restrictedSyntax(['examples/**/*.{ts,js,mjs}', 'docs/**/*.{ts,js,mjs}', 'docs/**/*.md/*.{ts,js}'], R12),

  // Layer order: every src file belongs to a layer and depends only on the layers it may import.
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': layers
        .filter((layer) => layer.dir)
        .map((layer) => ({ type: layer.type, pattern: layer.dir, partialMatch: false })),
      'boundaries/files': layers
        .filter((layer) => layer.file)
        .map((layer) => ({ category: layer.type, pattern: layer.file })),
      'boundaries/dependency-nodes': ['import', 'dynamic-import', 'export'],
      'import/resolver': { node: { extensions: ['.ts', '.js', '.mjs'] } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: layers
            .filter((layer) => layer.allow.length > 0)
            .map((layer) => ({ from: layerSelector([layer.type]), allow: { to: layerSelector(layer.allow) } })),
        },
      ],
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
    },
  },
]);
