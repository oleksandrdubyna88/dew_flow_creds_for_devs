// The runner's lifecycle (`scripts/run-tests.mjs`): the record it exports once, the audit by the EXACT exported record
// string after the suite returned, the process-tree completion policy, and the refusals. The runner's seams are
// `spawn`, `sweep`, `roots`, `record`, `confirm`, `timeoutMs`, `stdio` and `write`.
//
// Every scenario reads a PRIVATE root (made with `ownedDir`) through the `roots` seam, never the real temp root, and never
// runs the real start-of-run sweep: a runner test that swept the real root would be a test that deletes by itself.
//
// The tests that start a REAL `node --test` run on Linux and on the `windows-latest` job of `ci-extension.yml` (the
// extension job is ubuntu-only otherwise): the kill path is the one place a Windows-only defect can hide.
import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { Owner, Scope } from '../../scripts/lib/leftovers.cjs';
import { formatOwner, ownedDir, readOwner, thisOwner, thisOwnerToken } from '../../scripts/lib/leftovers.cjs';

type Spawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; detached?: boolean; stdio?: unknown }) => EventEmitter;
interface Seams {
  spawn?: Spawn;
  sweep?: (options: { repo: string; tmp: string }) => object;
  roots?: string[];
  record?: string;
  confirm?: () => Promise<{ ended: boolean; alive: number }>;
  timeoutMs?: number;
  stdio?: string;
  write?: (line: string) => void;
}
interface Runner {
  runWithAudit(extra?: string[], seams?: Seams): Promise<number>;
  exitCodeOf(result: { status?: number | null; signal?: NodeJS.Signals | null; error?: Error }): number;
}

const SRC_VS_CODE = path.resolve(__dirname, '..', '..');
const RUNNER = path.join(SRC_VS_CODE, 'scripts', 'run-tests.mjs');
const WRAPPER = path.join(SRC_VS_CODE, 'scripts', 'lib', 'leftovers.cjs');
const runner = async (): Promise<Runner> => (await import(pathToFileURL(RUNNER).href)) as Runner;

/**
 * NODE_TEST_CONTEXT is how node tells a test process it is the child of a runner. A nested `node --test` that inherits it
 * reports to that parent and exits 0 without running, so every REAL suite these tests start is given an environment without it.
 */
const WITHOUT_TEST_CONTEXT = { NODE_TEST_CONTEXT: undefined };

const nothingSwept = (): object => ({ removed: [], preserved: [], listed: [], errors: [] });
const me = thisOwnerToken();
const RECORD = formatOwner(thisOwner());

/** A private root for one scenario: the folders the scenario makes and counts are the only ones in it. */
const privateRoot = (scope: Scope): string => ownedDir(scope, 'aud');

/** A folder of the owner form claimed by `record` (or by no one when `record` is undefined), made by hand. */
function plant(root: string, what: string, record?: string): string {
  const dir = path.join(root, `testsToDelete-${me}-creds-${what}-abc123`);
  fs.mkdirSync(dir);
  if (record !== undefined) fs.writeFileSync(`${dir}.owner`, `${record}\n`);
  return dir;
}

/** A coordinator that "runs a suite": does `work`, then exits with `status`. Starts nothing; its pid is none. */
function suite(status: number, work: () => void = () => undefined, seen?: { env?: NodeJS.ProcessEnv }): Spawn {
  return (_command, _args, options) => {
    if (seen !== undefined) seen.env = options.env;
    const child = new EventEmitter();
    setImmediate(() => {
      work();
      child.emit('exit', status, null);
    });
    return child;
  };
}

function lines(): { write: (line: string) => void; seen: string[] } {
  const seen: string[] = [];
  return { write: (line) => seen.push(line), seen };
}

const exists = (target: string): boolean => fs.existsSync(target);

test('a sweep that throws is one line, and the suite keeps its own code', async (t) => {
  const { runWithAudit } = await runner();
  const log = lines();
  const code = await runWithAudit([], {
    spawn: suite(3),
    roots: [privateRoot(t)],
    sweep: () => {
      throw new Error('the sweep broke');
    },
    write: log.write,
  });

  assert.equal(code, 3);
  assert.equal(log.seen.filter((line) => line.includes('leftovers sweep failed')).length, 1);
  assert.match(log.seen[0], /the sweep broke/);
});

test('the child gets the run\'s record as TESTSTODELETE_RUN, and it is this process\'s own record', async (t) => {
  const { runWithAudit } = await runner();
  const seen: { env?: NodeJS.ProcessEnv } = {};
  await runWithAudit([], { spawn: suite(0, undefined, seen), roots: [privateRoot(t)], sweep: nothingSwept, write: lines().write });

  assert.equal(seen.env?.TESTSTODELETE_RUN, RECORD);
});

test('a suite that passed and left a folder it claimed fails with exit 1, names the folder, and the folder is removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { left = plant(root, 'left', RECORD); }), roots: [root], sweep: nothingSwept, write: log.write });

  assert.equal(code, 1);
  assert.ok(left.length > 0 && !exists(left) && !exists(`${left}.owner`), 'the folder and its claim are removed');
  assert.ok(log.seen.some((line) => line.startsWith('run-tests: this run left 1 folder(s) it claimed') && line.includes(left)), log.seen.join('\n'));
});

test('a folder claimed by another record of the same user is not counted and not touched, though its owner segment is ours', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const other = formatOwner({ ...thisOwner(), pid: process.ppid } as Owner);
  assert.notEqual(other, RECORD, 'the premise: a different record of the same owner');
  const log = lines();
  let sibling = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { sibling = plant(root, 'sibling', other); }), roots: [root], sweep: nothingSwept, write: log.write });

  assert.equal(code, 0, 'nothing of this run was left');
  assert.ok(exists(sibling) && exists(`${sibling}.owner`), 'a concurrent run\'s folder survives the audit');
  const claim = readOwner(sibling, 'folder') as Owner;
  assert.equal(claim.owner, me, 'the owner segment IS ours: an audit that compared it alone would have removed this folder');
  assert.deepEqual(log.seen, []);
});

test('an owner-form folder with no claim is listed and never touched, and does not change a passing verdict', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let unmarked = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { unmarked = plant(root, 'nobody'); }), roots: [root], sweep: nothingSwept, write: log.write });

  assert.equal(code, 0);
  assert.ok(exists(unmarked));
  assert.ok(log.seen.some((line) => line.includes('unmarked:') && line.includes(unmarked)));
});

test('a suite that failed keeps its own code, the list is printed, and the run\'s folder is removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], { spawn: suite(5, () => { left = plant(root, 'failed', RECORD); }), roots: [root], sweep: nothingSwept, write: log.write });

  assert.equal(code, 5);
  assert.ok(!exists(left));
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)') && line.includes(left)));
});

test('an orphan claim of this run is removed too, and counts', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const orphan = path.join(root, `testsToDelete-${me}-creds-orphan-abc123.owner`);
  const code = await runWithAudit([], { spawn: suite(0, () => fs.writeFileSync(orphan, `${RECORD}\n`)), roots: [root], sweep: nothingSwept, write: lines().write });

  assert.equal(code, 1);
  assert.equal(exists(orphan), false);
});

test('the audit matches the record the runner EXPORTED, not one recomputed afterwards', async (t) => {
  const { runWithAudit } = await runner();
  const me0 = thisOwner();
  // A record one second off this process's live start: inside the two-second tolerance, so the child accepts it as a live
  // run of this user; a record recomputed at audit time would differ from it and find nothing.
  const exported = formatOwner({ ...me0, start: me0.start === undefined ? undefined : me0.start + 1 } as Owner);
  const root = privateRoot(t);
  const made: { claim?: string; pid?: number } = {};
  const script = `const { ownedDir, cleanupScope } = require(${JSON.stringify(WRAPPER)}); ownedDir(cleanupScope(), 'eightb', { parent: process.env.FIXTURE_PARENT });`;
  const viaChild: Spawn = (_command, _args, options) => {
    const child = spawn(process.execPath, ['-e', script], { ...options, env: { ...options.env, FIXTURE_PARENT: root }, stdio: 'ignore' } as object) as ChildProcess;
    made.pid = child.pid;
    child.once('exit', () => {
      const found = fs.readdirSync(root).find((name) => name.endsWith('.owner'));
      made.claim = found === undefined ? undefined : fs.readFileSync(path.join(root, found), 'utf8').trim();
    });
    return child;
  };
  const log = lines();

  const code = await runWithAudit([], { spawn: viaChild, roots: [root], record: exported, sweep: nothingSwept, write: log.write });

  assert.equal(made.claim, exported, 'the child claimed with the exported string');
  assert.notEqual(made.pid, thisOwner().pid, 'the child is another process: its pid is nowhere in the claim');
  assert.equal(code, 1);
  assert.deepEqual(fs.readdirSync(root), [], 'the audit found exactly that folder and removed it');
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)')));
});

test('a tree that cannot be confirmed ended is listed, never removed, and fails the run', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'alive', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: async () => ({ ended: false, alive: 1 }),
    write: log.write,
  });

  assert.equal(code, 1);
  assert.ok(exists(left) && exists(`${left}.owner`), 'nothing is removed while a descendant may still be using it');
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)') && line.endsWith('(not removed: 1 descendant(s) still alive)')), log.seen.join('\n'));
});

/** A fixture suite file that makes a folder under the exported record, starts a long-lived descendant, and (optionally) kills itself. */
function fixtureFile(root: string, selfKill: boolean): string {
  const body = [
    "const { test } = require('node:test');",
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    `const { ownedDir, cleanupScope } = require(${JSON.stringify(WRAPPER)});`,
    "test('a suite whose process leaves a descendant behind', async () => {",
    "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    '  fs.writeFileSync(process.env.FIXTURE_PID_FILE, String(child.pid));',
    "  ownedDir(cleanupScope(), 'eightc', { parent: process.env.FIXTURE_PARENT });",
    selfKill ? "  process.kill(process.pid, 'SIGKILL');" : '  await new Promise(() => undefined);',
    '});',
  ].join('\n');
  const file = path.join(root, 'fixture.test.cjs');
  fs.writeFileSync(file, body);
  return file;
}

/** Is `pid` a process right now? `process.kill(pid, 0)` on POSIX; `tasklist` on Windows, where signal 0 is not a probe everywhere. */
function isAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    const answer = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], { encoding: 'utf8' });
    return answer.includes(`"${pid}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The runner starts the REAL `node --test` over `file`, with the fixture's own environment added to the child's. */
function realSuite(root: string, pidFile: string): Spawn {
  return (command, args, options) =>
    spawn(command, args, { ...options, env: { ...options.env, ...WITHOUT_TEST_CONTEXT, FIXTURE_PARENT: root, FIXTURE_PID_FILE: pidFile }, stdio: 'ignore' } as object) as ChildProcess;
}

test('the kill path: a descendant that outlives the suite is ended before any removal, and the run fails', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const pidFile = path.join(root, 'descendant.pid');
  const file = fixtureFile(root, true);
  const log = lines();
  const work = path.join(root, 'work');
  fs.mkdirSync(work);

  const code = await runWithAudit([file], { spawn: realSuite(work, pidFile), roots: [work], sweep: nothingSwept, stdio: 'ignore', write: log.write });

  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'the fixture printed its descendant\'s pid');
  assert.equal(isAlive(pid), false, 'the descendant is not alive after the runner returned');
  assert.deepEqual(fs.readdirSync(work), [], 'the folder the dead suite claimed was removed, after the tree ended');
  assert.equal(code, 1);
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)')), log.seen.join('\n'));
});

test('the timeout ends the whole tree: the descendant of a suite that never finishes is dead when the runner returns', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const pidFile = path.join(root, 'descendant.pid');
  const file = fixtureFile(root, false);
  const work = path.join(root, 'work');
  fs.mkdirSync(work);

  const code = await runWithAudit([file], { spawn: realSuite(work, pidFile), roots: [work], sweep: nothingSwept, stdio: 'ignore', timeoutMs: 4000, write: lines().write });

  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.equal(isAlive(pid), false, 'the descendant is dead');
  assert.deepEqual(fs.readdirSync(work), [], 'and what the killed suite claimed is removed');
  assert.notEqual(code, 0);
});

test('the exit code is the child\'s own, 128 + the signal number, or 1 when the spawn failed', async () => {
  const { exitCodeOf } = await runner();

  assert.equal(exitCodeOf({ status: 3, signal: null }), 3);
  assert.equal(exitCodeOf({ status: null, signal: 'SIGTERM' }), 128 + 15);
  assert.equal(exitCodeOf({ error: new Error('spawn ENOENT') }), 1);
});

test('without the mount the runner refuses before node --test starts, and names the command that restores it', (t) => {
  // The runner and its two helpers copied into a tree that has no `.claude/rules/shared`.
  const root = ownedDir(t, 'nomnt');
  const scripts = path.join(root, 'src_vs_code', 'scripts');
  fs.mkdirSync(path.join(scripts, 'lib'), { recursive: true });
  for (const file of ['run-tests.mjs', path.join('lib', 'leftovers.cjs'), path.join('lib', 'processTree.mjs')]) {
    fs.copyFileSync(path.join(SRC_VS_CODE, 'scripts', file), path.join(scripts, file));
  }
  const marker = path.join(root, 'ran.test.cjs');
  fs.writeFileSync(marker, `require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'ran'))}, 'x');`);

  let output = '';
  let status: number | null = 0;
  try {
    output = execFileSync(process.execPath, [path.join(scripts, 'run-tests.mjs'), marker], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...WITHOUT_TEST_CONTEXT } });
  } catch (error) {
    const failure = error as { status: number | null; stderr: string };
    status = failure.status;
    output = failure.stderr;
  }

  assert.equal(status, 1);
  assert.match(output, /git submodule update --init \.claude\/rules\/shared/);
  assert.equal(output.trim().split('\n').length, 1, 'one line');
  assert.equal(exists(path.join(root, 'ran')), false, 'node --test was never started');
});
