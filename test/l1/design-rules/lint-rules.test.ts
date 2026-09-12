import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = resolve(root, 'test/fixtures/lint');
const eslint = new ESLint({ cwd: root, overrideConfigFile: 'eslint.config.js' });

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

async function lint(text: string, filePath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(text, { filePath });
  if (!result) throw new Error(`no lint result for ${filePath}`);
  return result.messages;
}

function withPrefix(messages: Linter.LintMessage[], ruleId: string): Linter.LintMessage[] {
  return messages.filter((m) => m.message.startsWith(`${ruleId}:`));
}

function expectLocated(messages: Linter.LintMessage[]): void {
  for (const m of messages) {
    expect(m.line, `${m.message} has a line`).toBeTypeOf('number');
    expect(m.column, `${m.message} has a column`).toBeTypeOf('number');
  }
}

/** One hit, attributed to the design rule by its message prefix, located by line and column. */
async function expectHit(file: string, filePath: string, rule: string, ruleId = 'no-restricted-syntax'): Promise<void> {
  const messages = await lint(fixture(file), filePath);
  expect(messages, `${file} at ${filePath}`).toHaveLength(1);
  const [hit] = messages;
  expect(hit?.ruleId).toBe(ruleId);
  expect(hit?.message.startsWith(`${rule}:`), `${hit?.message} starts with ${rule}:`).toBe(true);
  expect(hit?.severity).toBe(2);
  expectLocated(messages);
}

/** No hit for the design rule at an exempted location, and nothing else either. */
async function expectClean(file: string, filePath: string, rule: string): Promise<void> {
  const messages = await lint(fixture(file), filePath);
  expect(withPrefix(messages, rule), `${file} at ${filePath} has no ${rule} hit`).toEqual([]);
  expect(messages, `${file} at ${filePath} is clean`).toEqual([]);
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

const directive = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b([^\n]*?)(?:\*\/|$)/gm;
const description = /^-- R\d+: .+/;

/** Every eslint-disable directive in `text` whose description is not `-- R<n>: <reason>`. */
function undescribedDirectives(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(directive)) {
    const rest = match[1] ?? '';
    const at = rest.indexOf('--');
    const reason = at < 0 ? '' : rest.slice(at).trim();
    if (!description.test(reason)) out.push(match[0].trim());
  }
  return out;
}

const knipBin = resolve(root, 'node_modules/knip/bin/knip.js');

function runKnip(cwd: string): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [knipBin, '--reporter', 'json', '--no-progress'], {
    cwd,
    encoding: 'utf8',
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('R1 one renderer', () => {
  it('flags getContext outside src/export', () => expectHit('r1-getcontext.txt', 'src/render/x.ts', 'R1'));
  it('flags a foreignObject literal', () => expectHit('r1-foreignobject.txt', 'src/render/x.ts', 'R1'));
  it('flags a WebGL token', () => expectHit('r1-webgl.txt', 'src/render/x.ts', 'R1'));
  it('allows getContext inside the export sink', () => expectClean('ok-r1-export-sink.txt', 'src/export/x.ts', 'R1'));
});

describe('R7 live regions', () => {
  it('flags an aria-live attribute write', () => expectHit('r7-aria-live.txt', 'src/element/x.ts', 'R7'));
  it('flags the ariaLive property', () => expectHit('r7-arialive-property.txt', 'src/element/x.ts', 'R7'));
  it('allows aria-live in kit/narration', () => expectClean('ok-r7-kit-narration.txt', 'src/kit/narration/x.ts', 'R7'));
});

describe('R10 wrapped text', () => {
  it('flags tspan in the core', () => expectHit('r10-tspan.txt', 'src/render/x.ts', 'R10'));
  it('allows tspan in kit/text', () => expectClean('ok-r10-kit-text.txt', 'src/kit/text/x.ts', 'R10'));
  it('allows tspan in the SVG tag allowlist', () => expectClean('ok-r10-allowlist.txt', 'src/compile/allowlist.ts', 'R10'));
});

describe('R12 pure scene functions', () => {
  it('flags Math.random in examples', () => expectHit('r12-math-random.txt', 'examples/bars/scene.ts', 'R12'));
  it('flags Date.now in docs', () => expectHit('r12-date-now.txt', 'docs/api/snippet.ts', 'R12'));
  it('flags performance.now in examples', () => expectHit('r12-performance-now.txt', 'examples/bars/scene.ts', 'R12'));
  it('flags globalThis.performance.now in examples', () =>
    expectHit('r12-globalthis-performance-now.txt', 'examples/bars/scene.ts', 'R12'));
  it('flags new Date() in docs', () => expectHit('r12-new-date.txt', 'docs/api/snippet.ts', 'R12'));

  it('reaches fenced ts blocks of docs/**/*.md through the Markdown processor', async () => {
    const messages = await lint(fixture('r12-md-fence.txt'), 'docs/development/design-rules.md');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('no-restricted-syntax');
    expect(messages[0]?.message.startsWith('R12:')).toBe(true);
    expect(messages[0]?.line).toBe(7);
    expectLocated(messages);
  });

  it('does not apply to src', () => expectClean('r12-math-random.txt', 'src/render/x.ts', 'R12'));
});

describe('R16 no layout reads on the frame path', () => {
  it('flags getBBox in src/render', () => expectHit('r16-getbbox.txt', 'src/render/x.ts', 'R16'));
  it('flags getBoundingClientRect in src/clock', () => expectHit('r16-getboundingclientrect.txt', 'src/clock/x.ts', 'R16'));
  it('flags getComputedStyle in src/evaluate', () => expectHit('r16-getcomputedstyle.txt', 'src/evaluate/x.ts', 'R16'));
  it('flags offsetWidth in src/render', () => expectHit('r16-offsetwidth.txt', 'src/render/x.ts', 'R16'));
  it('flags clientWidth in src/evaluate', () => expectHit('r16-clientwidth.txt', 'src/evaluate/x.ts', 'R16'));
  it('allows getComputedTextLength in src/controller', () => expectClean('ok-r16-controller.txt', 'src/controller/x.ts', 'R16'));
  it('allows getComputedTextLength in src/element', () => expectClean('ok-r16-controller.txt', 'src/element/x.ts', 'R16'));

  it('keeps R1, R7 and R10 active inside the R16 scope', async () => {
    await expectHit('r1-getcontext.txt', 'src/clock/x.ts', 'R1');
    await expectHit('r7-aria-live.txt', 'src/evaluate/x.ts', 'R7');
    await expectHit('r10-tspan.txt', 'src/render/x.ts', 'R10');
  });
});

describe('exemptions', () => {
  const snippet = (reason: string): string =>
    `export function box(el: SVGGraphicsElement): DOMRect {\n  // eslint-disable-next-line no-restricted-syntax${reason}\n  return el.getBBox();\n}\n`;

  it('a directive without -- R<n>: <reason> silences ESLint but fails the description scan', async () => {
    const text = snippet('');
    expect(await lint(text, 'src/render/x.ts')).toEqual([]);
    expect(undescribedDirectives(text)).toEqual(['// eslint-disable-next-line no-restricted-syntax']);
  });

  it('a directive with -- R16: <reason> is clean and passes the scan', async () => {
    const text = snippet(' -- R16: input-time read');
    expect(await lint(text, 'src/render/x.ts')).toEqual([]);
    expect(undescribedDirectives(text)).toEqual([]);
  });

  it('the scan rejects a description that does not name a rule', () => {
    expect(undescribedDirectives('// eslint-disable-next-line no-restricted-syntax -- legacy\n')).toHaveLength(1);
    expect(undescribedDirectives('/* eslint-disable no-console -- R7: reason */\n')).toEqual([]);
    expect(undescribedDirectives('/* eslint-disable no-console */\n')).toHaveLength(1);
  });

  it('every eslint-disable directive under src/ carries -- R<n>: <reason>', () => {
    for (const file of walk(resolve(root, 'src')).filter((f) => f.endsWith('.ts'))) {
      expect(undescribedDirectives(readFileSync(file, 'utf8')), relative(root, file)).toEqual([]);
    }
  });

  it('a directive that suppresses nothing is an error', async () => {
    const messages = await lint(fixture('unused-disable-directive.txt'), 'src/render/x.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toMatch(/^Unused eslint-disable directive/);
    expectLocated(messages);
  });
});

describe('layer order', () => {
  it('types importing index is an upward import', async () => {
    const messages = await lint(fixture('boundaries-upward-import.txt'), 'src/types.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('boundaries/dependencies');
    expectLocated(messages);
  });

  it('a kit importing a module path is disallowed', async () => {
    const messages = await lint(fixture('boundaries-kit-module-path.txt'), 'src/kit/text/x.ts');
    expect(messages.map((m) => m.ruleId)).toEqual(['boundaries/dependencies']);
    expectLocated(messages);
  });

  it('a kit importing the public API is allowed', async () => {
    expect(await lint(fixture('ok-boundaries-kit-index.txt'), 'src/kit/text/x.ts')).toEqual([]);
  });

  it('a lower layer importing types is allowed', async () => {
    const text = "import type { Tick } from '../types';\n\nexport type Y = Tick;\n";
    expect(await lint(text, 'src/compile/x.ts')).toEqual([]);
    expect(await lint(text, 'src/clock/x.ts')).toEqual([]);
  });

  it('a dependency on a file outside the layers is unknown', async () => {
    const messages = await lint(fixture('boundaries-unknown-dependency.txt'), 'src/render/x.ts');
    expect(messages.map((m) => m.ruleId)).toEqual(['boundaries/no-unknown-dependencies']);
    expectLocated(messages);
  });

  it('a src file outside every layer is unknown', async () => {
    for (const filePath of ['src/unknown/x.ts', 'src/kit/x.ts']) {
      const messages = await lint(fixture('ok-r16-controller.txt'), filePath);
      expect(messages.map((m) => m.ruleId), filePath).toEqual(['boundaries/no-unknown-files']);
      expectLocated(messages);
    }
  });
});

describe('console', () => {
  it('flags console.log in src', async () => {
    const messages = await lint(fixture('console-log.txt'), 'src/render/x.ts');
    expect(messages.map((m) => m.ruleId)).toEqual(['no-console']);
    expectLocated(messages);
  });

  it('allows console.warn in src', async () => {
    expect(await lint(fixture('ok-console-warn.txt'), 'src/render/x.ts')).toEqual([]);
  });
});

describe('the tree', () => {
  it('passes the lint', async () => {
    const results = await eslint.lintFiles(['src', 'test', 'scripts', '*.ts', '*.js']);
    const findings = results.flatMap((r) => r.messages.map((m) => `${relative(root, r.filePath)}:${m.line} ${m.ruleId} ${m.message}`));
    expect(findings).toEqual([]);
    expect(results.reduce((n, r) => n + r.errorCount + r.warningCount, 0)).toBe(0);
    expect(results.length).toBeGreaterThan(0);
  });

  it('passes knip, and knip names an unused export added to a copy of the tree', { timeout: 120_000 }, () => {
    const real = runKnip(root);
    expect(real.stderr).toBe('');
    expect(real.status, real.stdout).toBe(0);
    expect(JSON.parse(real.stdout)).toEqual({ issues: [] });

    const copy = mkdtempSync(join(tmpdir(), 'tickframe-knip-'));
    try {
      const excluded = new Set(['node_modules', 'dist', 'coverage', '.git'].map((d) => resolve(root, d)));
      cpSync(root, copy, { recursive: true, filter: (source) => !excluded.has(source) });
      symlinkSync(resolve(root, 'node_modules'), join(copy, 'node_modules'), 'dir');
      writeFileSync(join(copy, 'src/probe.ts'), 'export const used = 1;\nexport const unusedExportProbe = 2;\n');
      appendFileSync(join(copy, 'src/index.ts'), "export { used } from './probe';\n");

      const probed = runKnip(copy);
      expect(probed.status).not.toBe(0);
      const report = JSON.parse(probed.stdout) as { issues: { file: string; exports?: { name: string }[] }[] };
      const probe = report.issues.find((issue) => basename(issue.file) === 'probe.ts');
      expect(probe?.exports?.map((e) => e.name)).toEqual(['unusedExportProbe']);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
