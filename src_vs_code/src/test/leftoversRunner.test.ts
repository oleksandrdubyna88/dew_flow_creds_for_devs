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
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { formatOwner, ownedDir, readOwner, thisOwner } from '../../scripts/lib/leftovers.cjs';
import {
  ENDED, NO_SURVIVORS, RECORD, SRC_VS_CODE, WITHOUT_TEST_CONTEXT, WRAPPER, auditRemoves, exists, isAlive, lines, me, nothingSwept, ownerWith, plant, privateRoot, runner, suite,
  type Spawn, withEnv,
} from './runnerWorld';

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
  const seen: { env?: NodeJS.ProcessEnv; args?: string[] } = {};
  await runWithAudit(['x.test.js'], { spawn: suite(0, undefined, seen), roots: [privateRoot(t)], confirm: ENDED, sweep: nothingSwept, write: lines().write });

  assert.equal(seen.env?.TESTSTODELETE_RUN, RECORD);
  assert.equal(seen.args?.at(-1), 'x.test.js', 'the pattern reaches node --test unchanged');
});

test('a suite that passed and left a folder it claimed fails with exit 1, names the folder, and the folder is removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { left = plant(root, 'left', RECORD); }), roots: [root], confirm: ENDED, survivors: NO_SURVIVORS, sweep: nothingSwept, write: log.write });

  assert.equal(code, 1);
  assert.ok(left.length > 0 && !exists(left) && !exists(`${left}.owner`), 'the folder and its claim are removed');
  assert.ok(log.seen.some((line) => line.startsWith('run-tests: this run left 1 folder(s) it claimed') && line.includes(left)), log.seen.join('\n'));
});

test('a folder claimed by another record of the same user is not counted and not touched, though its owner segment is ours', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const other = formatOwner(ownerWith(process.ppid));
  assert.notEqual(other, RECORD, 'the premise: a different record of the same owner');
  const log = lines();
  let sibling = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { sibling = plant(root, 'sibling', other); }), roots: [root], confirm: ENDED, sweep: nothingSwept, write: log.write });

  assert.equal(code, 0, 'nothing of this run was left');
  assert.ok(exists(sibling) && exists(`${sibling}.owner`), 'a concurrent run\'s folder survives the audit');
  const claim = readOwner(sibling, 'folder');
  assert.ok(claim !== null && !('unreadable' in claim), 'the other record is a readable claim');
  assert.equal(claim.owner, me, 'the owner segment IS ours: an audit that compared it alone would have removed this folder');
  assert.deepEqual(log.seen, []);
});

test('an owner-form folder with no claim is listed and never touched, and does not change a passing verdict', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let unmarked = '';
  const code = await runWithAudit([], { spawn: suite(0, () => { unmarked = plant(root, 'nobody'); }), roots: [root], confirm: ENDED, sweep: nothingSwept, write: log.write });

  assert.equal(code, 0);
  assert.ok(exists(unmarked));
  assert.ok(log.seen.some((line) => line.includes('unmarked:') && line.includes(unmarked)));
});

test('a suite that failed keeps its own code, the list is printed, and the run\'s folder is removed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], { spawn: suite(5, () => { left = plant(root, 'failed', RECORD); }), roots: [root], confirm: ENDED, survivors: NO_SURVIVORS, sweep: nothingSwept, write: log.write });

  assert.equal(code, 5);
  assert.ok(!exists(left));
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)') && line.includes(left)));
});

test('an orphan claim of this run is removed too, and counts', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const orphan = path.join(root, `testsToDelete-${me}-creds-orphan-abc123.owner`);
  const code = await runWithAudit([], { spawn: suite(0, () => fs.writeFileSync(orphan, `${RECORD}\n`)), roots: [root], confirm: ENDED, survivors: NO_SURVIVORS, sweep: nothingSwept, write: lines().write });

  assert.equal(code, 1);
  assert.equal(exists(orphan), false);
});

test('the audit matches the record the runner EXPORTED, not one recomputed afterwards', async (t) => {
  const { runWithAudit } = await runner();
  const me0 = thisOwner();
  // A record one second off this process's live start: inside the two-second tolerance, so the child accepts it as a live
  // run of this user; a record recomputed at audit time would differ from it and find nothing.
  const exported = formatOwner(ownerWith(me0.pid, me0.start === undefined ? undefined : me0.start + 1));
  const root = privateRoot(t);
  const made: { claim?: string; pid?: number } = {};
  const script = `const { ownedDir, cleanupScope } = require(${JSON.stringify(WRAPPER)}); ownedDir(cleanupScope(), 'eightb', { parent: process.env.FIXTURE_PARENT });`;
  const viaChild: Spawn = (_command, _args, options) => {
    const child = spawn(process.execPath, ['-e', script], { detached: options.detached, env: { ...options.env, FIXTURE_PARENT: root }, stdio: 'ignore' });
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
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)')), 'the audit found exactly that folder, by the exported string');
  if (!auditRemoves()) {
    // Windows has no confirmation that the tree is gone (the job object gives no acknowledgment, risk 2 of the consult), and macOS
    // has no environment to scan for a descendant that left the group [E2.1 Opus 1]: the audit names the folder and keeps it, and the
    // run fails; the C# sweep of E2.3 or the janitor collects it.
    assert.equal(fs.readdirSync(root).filter((name) => !name.endsWith('.owner')).length, 1, 'kept: nothing proves the tree ended');
    assert.ok(log.seen.some((line) => line.includes('(not removed:')), log.seen.join(' | '));
  } else {
    assert.deepEqual(fs.readdirSync(root), [], 'the audit found exactly that folder and removed it');
  }
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

/**
 * What became of the folder a killed suite claimed. On Linux the group's end is confirmed and the survivors are scanned, so it is
 * removed. On Windows the supervisor gives no acknowledgment that its job is empty (the reference has none yet), and on macOS the
 * scan has no environment to read, so the audit removes nothing there and says so: the descendant is dead (asserted by the caller)
 * and the folder is preserved, listed and the run fails.
 */
function assertFolderOutcome(work: string): void {
  if (!auditRemoves()) {
    assert.equal(fs.readdirSync(work).some((name) => name.includes('-creds-eightc-')), true, 'preserved: nothing confirms the job is empty');
  } else {
    assert.deepEqual(fs.readdirSync(work), [], 'the folder the dead suite claimed was removed, after the tree ended');
  }
}

test('the kill path: a descendant that outlives the suite is ended before any removal, and the run fails', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const pidFile = path.join(root, 'descendant.pid');
  const file = fixtureFile(root, true);
  const log = lines();
  const work = path.join(root, 'work');
  fs.mkdirSync(work);

  const code = await withEnv({ FIXTURE_PARENT: work, FIXTURE_PID_FILE: pidFile }, () =>
    runWithAudit([file], { roots: [work], sweep: nothingSwept, stdio: 'ignore', write: log.write }),
  );

  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'the fixture printed its descendant\'s pid');
  assert.equal(isAlive(pid), false, 'the descendant is not alive after the runner returned');
  assertFolderOutcome(work);
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

  const code = await withEnv({ FIXTURE_PARENT: work, FIXTURE_PID_FILE: pidFile }, () =>
    runWithAudit([file], { roots: [work], sweep: nothingSwept, stdio: 'ignore', timeoutMs: 4000, write: lines().write }),
  );

  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.equal(isAlive(pid), false, 'the descendant is dead');
  assertFolderOutcome(work);
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

  const run = spawnSync(process.execPath, [path.join(scripts, 'run-tests.mjs'), marker], {
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
    env: { ...process.env, ...WITHOUT_TEST_CONTEXT },
  });
  const status = run.status;
  const output = run.stderr;

  assert.equal(status, 1);
  assert.match(output, /git submodule update --init \.claude\/rules\/shared/);
  assert.equal(output.trim().split('\n').length, 1, 'one line');
  assert.equal(exists(path.join(root, 'ran')), false, 'node --test was never started');
});
