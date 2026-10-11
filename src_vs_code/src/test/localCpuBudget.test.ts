import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

/**
 * Local test runs take at most 8 workers, at lowered CPU priority — the shared rule
 * `common/local-cpu-budget.md`, pinned here so it cannot quietly fall out of the scripts.
 *
 * <p>Measured 2026-10-10 on a 24-thread workstation: a plain `node --test` sized its pool from the
 * machine and started 23 test-file processes at normal priority, and every other session on the
 * machine lagged until the suite ended. The rule says that a repository which pins its own test
 * script pins the cap too; nothing here pinned the script, so this file is that pin.</p>
 *
 * <p>The preload is a VERBATIM copy of the conventions template with only its MOUNT line changed,
 * so a pin bump that changes the template turns this suite red until the copy follows. That one
 * comparison needs the mount, which CI does not check out, so there — and in a clone without
 * `git submodule update --init` — it is skipped and says so. Everything else holds without it.</p>
 */

const extensionRoot = path.join(__dirname, '..', '..');
const repoRoot = path.join(extensionRoot, '..');
const mountDir = path.join(repoRoot, '.claude', 'rules', 'shared');
const preloadPath = path.join(extensionRoot, 'scripts', 'lower-priority.mjs');
const templatePath = path.join(mountDir, 'tools', 'templates', 'lower-priority-preload.mjs');

const PRELOAD = '--import ./scripts/lower-priority.mjs';
const MAX_WORKERS = 8;
const MOUNT_LINE = /^const MOUNT = new URL\("([^"]+)", import\.meta\.url\);$/gm;

const lf = (text: string): string => text.replace(/\r\n/g, '\n');
const scripts = (): Record<string, string> =>
  (JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> })
    .scripts;

/** A worker count that really caps: a whole number from 1 to 8 (0 and negatives mean "no cap" to the runners). */
const isCap = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_WORKERS;

/** The part of a script after its last `&&` — the command that actually runs the tests. */
const lastCommand = (script: string): string => script.split('&&').at(-1)?.trim() ?? '';

/** The runner script `npm test` starts, loaded as the ES module it is. */
interface Runner {
  CAP: number;
  testConcurrency(threads?: number): number;
  testArgs(extra?: string[], threads?: number): string[];
  runTests(
    extra?: string[],
    spawn?: (command: string, args: string[], options: object) => { status: number | null; signal: NodeJS.Signals | null; error?: Error },
  ): number;
}
const runnerPath = path.join(extensionRoot, 'scripts', 'run-tests.mjs');
// module: Node16 keeps a dynamic import() as one in the CommonJS output, so it can load the .mjs.
const runner = async (): Promise<Runner> => (await import(pathToFileURL(runnerPath).href)) as Runner;

test('npm test runs the suite through the runner script, after the lowering preload', () => {
  const run = lastCommand(scripts().test);
  assert.ok(
    run.startsWith(`node ${PRELOAD} scripts/run-tests.mjs`),
    `the test script must preload the lowering module and start scripts/run-tests.mjs: ${run}`,
  );
  assert.doesNotMatch(run, /--test-concurrency=\d/, 'an exact --test-concurrency RAISES a small runner (4 vCPU: node 3 -> 8); the runner computes it');
});

test('the runner caps node --test at min(8, CPUs - 1) — node\'s own default, never a raise', async () => {
  const { CAP, testConcurrency, testArgs } = await runner();
  // One budget for both runners: the xUnit case below bounds maxParallelThreads by the same MAX_WORKERS, so
  // lowering the family cap means changing MAX_WORKERS, and that turns both cases red until both limits follow.
  assert.equal(CAP, MAX_WORKERS, `the runner's CAP (${CAP}) and this pin's MAX_WORKERS (${MAX_WORKERS}) must be the same budget`);
  // 4 threads is a hosted CI runner: node's own default there is 3, and an exact 8 would raise it.
  assert.deepEqual([1, 2, 4, 9, 24].map(threads => testConcurrency(threads)), [1, 1, 3, 8, 8]);
  assert.ok(isCap(testConcurrency()), `on this machine the runner asks for ${testConcurrency()} workers`);
  assert.deepEqual(testArgs(['out/test/*.test.js'], 24), ['--test', '--test-concurrency=8', 'out/test/*.test.js']);
});

test('the runner leaves with the child\'s code, 128 + the signal number, or 1 when the spawn failed', async () => {
  const { runTests } = await runner();
  const seen: string[][] = [];
  const exit = (status: number | null, signal: NodeJS.Signals | null, error?: Error) =>
    runTests(['x.test.js'], (_command, args) => {
      seen.push(args);
      return { status, signal, error };
    });
  assert.equal(exit(3, null), 3);
  assert.equal(exit(null, 'SIGTERM'), 128 + 15);
  assert.equal(exit(null, null, new Error('spawn ENOENT')), 1);
  assert.equal(seen[0].at(-1), 'x.test.js', 'the pattern reaches node --test unchanged');
});

test('every scenario harness script runs through the same lowering preload', () => {
  const harnesses = Object.entries(scripts()).filter(([name]) => name.startsWith('itest:'));
  assert.ok(harnesses.some(([name]) => name === 'itest:all'), 'no itest:all script — the filter matched the wrong names');
  const unlowered = harnesses.filter(([, script]) => !lastCommand(script).startsWith(`node ${PRELOAD} `));
  assert.deepEqual(unlowered, [], 'these harness scripts run at normal priority');
});

test('the preload has exactly one MOUNT line, and it points at the shared-rules submodule', () => {
  const mounts = [...lf(fs.readFileSync(preloadPath, 'utf8')).matchAll(MOUNT_LINE)].map(match => match[1]);
  assert.equal(mounts.length, 1, 'the preload must keep exactly one MOUNT line');
  const resolved = new URL(mounts[0], pathToFileURL(preloadPath)).href;
  assert.equal(resolved, pathToFileURL(mountDir + path.sep).href, 'MOUNT does not resolve to .claude/rules/shared/');
});

test('the preload is the conventions template with only the MOUNT line changed', t => {
  if (!fs.existsSync(templatePath)) {
    t.skip('the shared-rules mount is absent (CI, or git submodule update --init not run) — nothing to compare against');
    return;
  }
  const ours = lf(fs.readFileSync(preloadPath, 'utf8'));
  const template = lf(fs.readFileSync(templatePath, 'utf8'));
  const mount = [...ours.matchAll(MOUNT_LINE)][0]?.[0] ?? '';
  assert.equal(ours, template.replace(MOUNT_LINE, mount), 'the preload drifted from the template — copy it again and edit only MOUNT');
});

test('the xUnit runners get at most 8 threads from one root xunit.runner.json', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'xunit.runner.json'), 'utf8')) as { maxParallelThreads?: unknown };
  // 0 means "one per CPU" and -1 "unlimited" to xUnit, so "at most 8" is an integer from 1 to 8.
  assert.ok(isCap(config.maxParallelThreads), `maxParallelThreads ${String(config.maxParallelThreads)} is not an integer from 1 to ${MAX_WORKERS}`);
  const props = fs.readFileSync(path.join(repoRoot, 'Directory.Build.props'), 'utf8');
  assert.match(
    props,
    /<ItemGroup Condition="'\$\(IsTestProject\)' == 'true'">\s*<None Include="\$\(MSBuildThisFileDirectory\)xunit\.runner\.json"[^>]*CopyToOutputDirectory="PreserveNewest"/,
    'Directory.Build.props does not copy the root xunit.runner.json into every test project',
  );
  // An exact 8 raises xUnit on a 4-vCPU runner (its default is one thread per CPU), so CI must not get the file.
  assert.match(
    props,
    /<None Include="\$\(MSBuildThisFileDirectory\)xunit\.runner\.json"[^>]*Condition="'\$\(CI\)' != 'true'"/,
    'the copy of xunit.runner.json must be skipped when CI=true, so CI keeps its own thread count',
  );
});
