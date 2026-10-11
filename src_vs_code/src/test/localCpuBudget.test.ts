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

/** The part of a script after its last `&&` — the command that actually runs the tests. */
const lastCommand = (script: string): string => script.split('&&').at(-1)?.trim() ?? '';

test('npm test runs node --test with at most 8 workers, after the lowering preload', () => {
  const run = lastCommand(scripts().test);
  const concurrency = /--test-concurrency=(\d+)/.exec(run);
  assert.ok(concurrency, `the test script sets no --test-concurrency, so node sizes its pool from the machine: ${run}`);
  assert.ok(Number(concurrency[1]) <= MAX_WORKERS, `--test-concurrency=${concurrency[1]} is above the cap of ${MAX_WORKERS}`);
  assert.ok(run.startsWith(`node ${PRELOAD} --test `), `the test script does not preload the lowering module before --test: ${run}`);
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
  assert.equal(typeof config.maxParallelThreads, 'number', 'xunit.runner.json sets no numeric maxParallelThreads');
  assert.ok(Number(config.maxParallelThreads) <= MAX_WORKERS, `maxParallelThreads ${String(config.maxParallelThreads)} is above ${MAX_WORKERS}`);
  const props = fs.readFileSync(path.join(repoRoot, 'Directory.Build.props'), 'utf8');
  assert.match(
    props,
    /<ItemGroup Condition="'\$\(IsTestProject\)' == 'true'">\s*<None Include="\$\(MSBuildThisFileDirectory\)xunit\.runner\.json"[^>]*CopyToOutputDirectory="PreserveNewest"/,
    'Directory.Build.props does not copy the root xunit.runner.json into every test project',
  );
});
