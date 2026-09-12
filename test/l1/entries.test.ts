import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import sizeChecks from '../../.size-limit.js';
import { entries, exportsPatterns, patternFor } from '../../scripts/entries.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');

/** Spec table: output name, source path, exports pattern (kit rows are discovered under src/kit/). */
const fixedRows: [name: string, source: string, pattern: string][] = [
  ['index', 'src/index.ts', '.'],
  ['define', 'src/define.ts', './define'],
  ['export/index', 'src/export/index.ts', './export'],
  ['export/bake/index', 'src/export/bake/index.ts', './export/bake'],
];

const declaredPatterns = ['.', './define', './export', './export/bake', './kit/*'];

function tableRows(): [name: string, source: string, pattern: string][] {
  const rows = [...fixedRows];
  const kitDir = resolve(root, 'src/kit');
  if (existsSync(kitDir)) {
    for (const dirent of readdirSync(kitDir, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        rows.push([`kit/${dirent.name}/index`, `src/kit/${dirent.name}/index.ts`, './kit/*']);
      }
    }
  }
  return rows;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function requireBuilt(file: string): void {
  if (!existsSync(file)) {
    throw new Error(`${relative(root, file)} is missing: run \`npm run build\` before test:l1`);
  }
}

async function importDist(name: string): Promise<Record<string, unknown>> {
  const file = resolve(dist, `${name}.js`);
  requireBuilt(file);
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

describe('entries', () => {
  it('declares the five JS exports patterns', () => {
    expect(exportsPatterns()).toEqual(declaredPatterns);
  });

  it('every entry is built, typed and belongs to a declared exports pattern', async () => {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    const map = entries();
    expect(Object.keys(map).length).toBeGreaterThan(0);
    for (const [name, source] of Object.entries(map)) {
      expect(existsSync(resolve(root, source)), `${source} exists`).toBe(true);
      await expect(importDist(name)).resolves.toBeDefined();
      requireBuilt(resolve(dist, `${name}.d.ts`));
      const pattern = patternFor(name);
      expect(declaredPatterns).toContain(pattern);
      expect(Object.keys(pkg.exports)).toContain(pattern);
    }
  });

  it('size-limit checks cover exactly the built entries', () => {
    const expected = Object.keys(entries()).map((n) => `dist/${n}.js`);
    const actual = sizeChecks.map((check) => check.path);
    expect(new Set(actual)).toEqual(new Set(expected));
    expect(actual).toHaveLength(expected.length);
  });

  it('contains an entry if and only if its source exists', () => {
    const map = entries();
    const expected: Record<string, string> = {};
    for (const [name, source] of tableRows()) {
      const exists = existsSync(resolve(root, source));
      expect(name in map, `${name} present iff ${source} exists`).toBe(exists);
      if (exists) expected[name] = source;
    }
    expect(map).toEqual(expected);
  });

  it('patternFor maps kit output names to ./kit/* and rejects unknown names', () => {
    expect(patternFor('kit/axis/index')).toBe('./kit/*');
    expect(() => patternFor('kit/axis')).toThrow();
    expect(() => patternFor('nope')).toThrow();
  });
});

describe('dev flag', () => {
  it('is true under Vitest', () => {
    expect(import.meta.env.DEV).toBe(true);
  });

  it('is compiled out of every built file', () => {
    requireBuilt(resolve(dist, 'index.js'));
    requireBuilt(resolve(dist, 'dev', 'index.js'));
    const devDir = resolve(dist, 'dev') + '/';
    const built = walk(dist).filter((f) => !f.endsWith('.map'));
    const published = built.filter((f) => !f.startsWith(devDir));
    const dev = built.filter((f) => f.startsWith(devDir));
    expect(published.length).toBeGreaterThan(0);
    expect(dev.length).toBeGreaterThan(0);
    for (const file of [...published, ...dev]) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('import.meta.env'), `${relative(root, file)} contains import.meta.env`).toBe(false);
    }
  });
});

describe('. entry boundary', () => {
  it('exports exactly what src/index.ts exports', async () => {
    const built = await importDist('index');
    const source = (await import('../../src/index')) as Record<string, unknown>;
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
  });
});
