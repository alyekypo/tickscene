import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Fixed entries: [output name, source path, exports pattern]. Kit entries are discovered under src/kit/. */
const fixed = [
  ['index', 'src/index.ts', '.'],
  ['define', 'src/define.ts', './define'],
  ['export/index', 'src/export/index.ts', './export'],
  ['export/bake/index', 'src/export/bake/index.ts', './export/bake'],
];

const kitPattern = /^kit\/[^/]+\/index$/;

/**
 * Entry map consumed by tsdown, size-limit and test/l1/entries.test.ts.
 * @returns {Record<string, string>} output name -> source path, for every entry whose source file exists.
 */
export function entries() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, source] of fixed) {
    if (existsSync(resolve(root, source))) out[name] = source;
  }
  const kitDir = resolve(root, 'src/kit');
  if (existsSync(kitDir)) {
    const names = readdirSync(kitDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of names) {
      const source = `src/kit/${name}/index.ts`;
      if (existsSync(resolve(root, source))) out[`kit/${name}/index`] = source;
    }
  }
  return out;
}

/** @returns {string[]} the JS subpath patterns declared in package.json "exports". */
export function exportsPatterns() {
  return ['.', './define', './export', './export/bake', './kit/*'];
}

/**
 * @param {string} outputName
 * @returns {string} the exports pattern the output name belongs to.
 */
export function patternFor(outputName) {
  const row = fixed.find(([name]) => name === outputName);
  if (row) return row[2];
  if (kitPattern.test(outputName)) return './kit/*';
  throw new Error(`no exports pattern for entry "${outputName}"`);
}
