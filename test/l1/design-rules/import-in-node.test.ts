import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dist = resolve(root, 'dist');

/** Architecture §4.2: the modules that reference no window or document. DOM modules are never imported here. */
const domFree = ['syntax', 'easing', 'scale', 'clock', 'compile', 'evaluate'];

const sideEffects = ['./dist/define.js', './dist/dev/define.js'];

function globals(): string[] {
  return Object.getOwnPropertyNames(globalThis).sort();
}

function expectNoDom(): void {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
  expect(typeof customElements).toBe('undefined');
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

describe('R11 side-effect-free core', () => {
  it('the globals snapshot detects a module that writes a global', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tickframe-polluting-'));
    const file = join(dir, 'polluting-module.mjs');
    copyFileSync(resolve(root, 'test/fixtures/lint/polluting-module.txt'), file);
    const before = globals();
    try {
      await import(pathToFileURL(file).href);
      const after = globals();
      expect(after).not.toEqual(before);
      expect(after.filter((name) => !before.includes(name))).toEqual(['__tf']);
    } finally {
      delete (globalThis as Record<string, unknown>).__tf;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(globals()).toEqual(before);
  });

  it('src/index.ts and every existing DOM-free module import in Node without touching globals', async () => {
    expectNoDom();
    const modules = ['src/index.ts', ...domFree.map((name) => `src/${name}/index.ts`)].filter((path) =>
      existsSync(resolve(root, path)),
    );
    expect(modules).toContain('src/index.ts');
    const before = globals();
    for (const path of modules) {
      await import(pathToFileURL(resolve(root, path)).href);
    }
    expectNoDom();
    expect(globals()).toEqual(before);
  });

  it('package.json sideEffects names the two define outputs and nothing else under dist/', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { sideEffects: unknown };
    expect(pkg.sideEffects).toEqual(sideEffects);
    if (existsSync(dist)) {
      for (const file of walk(dist)) {
        const listed = `./${relative(root, file)}`;
        if (!sideEffects.includes(listed)) expect(pkg.sideEffects, listed).not.toContain(listed);
      }
    }
  });

  it('the built . entry adds no global and registers no custom element', async (ctx) => {
    const built = resolve(dist, 'index.js');
    if (!existsSync(built)) {
      ctx.skip('dist/index.js is absent: run `npm run build` before test:l1');
      return;
    }
    const define = vi.fn();
    const before = globals();
    Object.defineProperty(globalThis, 'customElements', { value: { define }, configurable: true, writable: true });
    try {
      await import(pathToFileURL(built).href);
      expect(define).not.toHaveBeenCalled();
      expect(globals().filter((name) => name !== 'customElements')).toEqual(before);
    } finally {
      delete (globalThis as { customElements?: unknown }).customElements;
    }
    expectNoDom();
    expect(globals()).toEqual(before);
  });
});
