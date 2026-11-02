// The runner's code gate and risk consult (E2.1, coai sessions 156fd570 and 3d75f52c): a descendant that leaves the process
// group, the cleanup that must never throw, the poll that backs off inside its bound, a finite timeout that says it fired, a
// confirmation that cannot succeed without a handle, and one runner at a time per process.
//
// Same rules as `leftoversRunner.test.ts`: private roots through the `roots` seam, never the real sweep, and a REAL
// `node --test` only where the point is the real process tree.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ownedDir, processProbe, tempRoot, thisOwner } from '../../scripts/lib/leftovers.cjs';
import {
  ENDED, RECORD, WRAPPER, exists, isAlive, lines, me, nothingSwept, plant, privateRoot, processTree, runner, suite, tableOf, withEnv,
} from './runnerWorld';

const posixOnly = process.platform === 'win32' ? { skip: 'process groups and sessions are POSIX; Windows has the job-object supervisor' } : {};
/** The environment marker and the fake /proc are Linux's: on macOS the scan has no environment to read and fails closed (see the darwin scenario). */
const linuxOnly = process.platform === 'linux' ? {} : { skip: 'reads /proc and the Linux environment marker; macOS lists and fails instead (the darwin scenario)' };
/** A mode-0 file is still readable by root, so the scenarios that rely on EACCES skip under it. */
const blindOnly = process.platform === 'linux' && process.getuid?.() !== 0 ? {} : { skip: 'needs Linux and a caller that is not root: mode 0 stops only the others' };

/** A pid no process can have: the kernel never hands out more than 2^22 on a 64-bit Linux. */
const NO_SUCH_PID = 4_194_305;

/** A suite file that starts a grandchild in a SESSION of its own (`detached`), which makes a claimed folder and stays alive. */
function setsidFixture(root: string): string {
  const grandchild = [
    `const { ownedDir, cleanupScope } = require(${JSON.stringify(WRAPPER)});`,
    "ownedDir(cleanupScope(), 'setsid', { parent: process.env.FIXTURE_PARENT });",
    'setInterval(() => undefined, 1000);',
  ].join(' ');
  const body = [
    "const { test } = require('node:test');",
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "test('a suite whose grandchild leaves the process group', async () => {",
    `  const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { detached: true, stdio: 'ignore' });`,
    '  child.unref();',
    '  fs.writeFileSync(process.env.FIXTURE_PID_FILE, String(child.pid));',
    '  const until = Date.now() + 10000;',
    "  while (!fs.readdirSync(process.env.FIXTURE_PARENT).some((name) => name.endsWith('.owner')) && Date.now() < until) {",
    '    await new Promise((resolve) => setTimeout(resolve, 20));',
    '  }',
    '});',
  ].join('\n');
  const file = path.join(root, 'setsid.test.cjs');
  fs.writeFileSync(file, body);
  return file;
}

/** The boundary: a folder is never removed while a process that uses it is alive; a folder that is kept is reported. */
function assertBoundary(work: string, pid: number, said: string[]): void {
  const folders = fs.readdirSync(work).filter((name) => !name.endsWith('.owner'));
  if (folders.length === 0) {
    assert.equal(isAlive(pid), false, 'the folder was removed while its grandchild was still alive');
    return;
  }
  assert.ok(said.some((line) => line.includes('(not removed:')), `a preserved folder must be reported: ${said.join(' | ')}`);
}

test('a descendant that left the process group is ended before any removal, or the folder is kept and the audit fails', linuxOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const work = path.join(root, 'work');
  fs.mkdirSync(work);
  const pidFile = path.join(root, 'grandchild.pid');
  const file = setsidFixture(root);
  const log = lines();
  let pid = 0;
  try {
    const code = await withEnv({ FIXTURE_PARENT: work, FIXTURE_PID_FILE: pidFile }, () =>
      runWithAudit([file], { roots: [work], sweep: nothingSwept, stdio: 'ignore', write: log.write }),
    );

    pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(Number.isSafeInteger(pid) && pid > 0, 'the fixture wrote its grandchild\'s pid');
    assertBoundary(work, pid, log.seen);
    assert.equal(code, 1, 'a suite that left a claimed folder fails, however it ended');
  } finally {
    if (pid > 0 && isAlive(pid)) process.kill(pid, 'SIGKILL'); // the test's own cleanup of its own fixture
  }
});

test('survivors that cannot be accounted for keep the audit at list-and-fail', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'unseen', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    survivors: () => ({ pids: [NO_SUCH_PID], unverified: [] }),
    pidAlive: () => true,
    settleTimeoutMs: 120,
    write: log.write,
  });

  assert.equal(code, 1);
  assert.ok(exists(left) && exists(`${left}.owner`), 'nothing is removed while a survivor is unaccounted for');
  assert.ok(log.seen.some((line) => line.includes('(not removed: 1 descendant(s) still alive)')), log.seen.join(' | '));
});

test('a failure while looking for survivors means "cannot confirm": list-and-fail, and nothing is thrown past the cleanup', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'scan', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    survivors: () => {
      throw new Error('ps is not there');
    },
    write: log.write,
  });

  assert.equal(code, 1);
  assert.ok(exists(left), 'the folder is kept');
  assert.ok(log.seen.some((line) => line.includes('could not be confirmed')), log.seen.join(' | '));
});

test('a confirmation that throws is "cannot confirm" too', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'throws', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: async () => {
      throw new Error('spawn ENOENT');
    },
    write: log.write,
  });

  assert.equal(code, 1);
  assert.ok(exists(left));
  assert.ok(log.seen.some((line) => line.includes('could not be confirmed')), log.seen.join(' | '));
});

test('with no handle on the tree the confirmation does NOT succeed, and the audit removes nothing', async (t) => {
  const { runWithAudit } = await runner();
  const tree = await processTree();
  const root = privateRoot(t);
  const log = lines();
  let left = '';

  const answer = await tree.confirmTreeEnded(undefined);
  const code = await runWithAudit([], { spawn: suite(0, () => { left = plant(root, 'nohandle', RECORD); }), roots: [root], sweep: nothingSwept, write: log.write });

  assert.equal(answer.ended, false, 'no pid and no job acknowledgment is not proof of anything');
  assert.equal(code, 1);
  assert.ok(exists(left) && exists(`${left}.owner`));
  assert.ok(log.seen.some((line) => line.includes('no acknowledgment')), log.seen.join(' | '));
});

test('with no handle and nothing claimed, a passing suite stays passing: there is nothing to list or remove', async (t) => {
  const { runWithAudit } = await runner();
  const log = lines();

  const code = await runWithAudit([], { spawn: suite(0), roots: [privateRoot(t)], sweep: nothingSwept, write: log.write });

  assert.equal(code, 0);
  assert.deepEqual(log.seen, []);
});

test('the signal handlers and the child\'s listeners are removed on every outcome, and a pid that is not positive is never signalled', async (t) => {
  const { runWithAudit } = await runner();
  const before = process.listenerCount('SIGINT');
  const during: number[] = [];
  for (const pid of [0, -5, 1.5]) {
    let child = new EventEmitter();
    const start = (): EventEmitter => {
      child = Object.assign(new EventEmitter(), { pid });
      setImmediate(() => {
        during.push(process.listenerCount('SIGINT'));
        child.emit('exit', 0, null);
      });
      return child;
    };
    await runWithAudit([], { spawn: start, roots: [privateRoot(t)], sweep: nothingSwept, confirm: ENDED, write: lines().write });

    assert.equal(child.listenerCount('exit') + child.listenerCount('error'), 0, `pid ${pid}: the child keeps no listener of the runner's`);
  }

  assert.deepEqual(during, [before, before, before], 'no handler is installed for a pid a negative signal would turn into somebody else\'s');
  assert.equal(process.listenerCount('SIGINT'), before);
});

test('the confirmation polls with a backoff from 50 ms to 1 s, inside its bound, and reports what is still alive', async () => {
  const tree = await processTree();
  const waited: number[] = [];
  let clock = 0;

  const answer = await tree.confirmTreeEnded(
    { root: 1 },
    { timeoutMs: 5000, probe: () => true, count: () => 3, now: () => clock, pause: async (ms) => { waited.push(ms); clock += ms; } },
  );

  assert.deepEqual(answer, { ended: false, alive: 3 });
  assert.deepEqual(waited.slice(0, 6), [50, 100, 200, 400, 800, 1000]);
  assert.ok(Math.max(...waited) <= 1000, 'a step never grows past one second');
  assert.ok(waited.reduce((sum, ms) => sum + ms, 0) <= 5000, 'the polling stays inside the bound');
});

test('the confirmation asks "is anyone there" with no process listing, and counts members only when it must report them', async () => {
  const tree = await processTree();
  const answers = [true, true, false];
  let counted = 0;

  const ended = await tree.confirmTreeEnded({ root: 1 }, { probe: () => answers.shift() ?? false, count: () => { counted += 1; return 9; }, pause: async () => undefined });
  const never = await tree.confirmTreeEnded({ root: 1 }, { timeoutMs: 100, probe: () => true, count: () => { counted += 1; return 2; }, pause: async () => undefined, now: (() => { let t = 0; return () => (t += 60); })() });

  assert.deepEqual(ended, { ended: true, alive: 0 });
  assert.deepEqual(never, { ended: false, alive: 2 });
  assert.equal(counted, 1, 'counted once, for the answer that is not "ended" — never while polling');
});

test('the Windows supervisor\'s captured output has a finite bound', async () => {
  const tree = await processTree();

  assert.ok(Number.isSafeInteger(tree.SUPERVISOR_MAX_OUTPUT_BYTES), 'a number, not "no limit"');
  assert.ok(tree.SUPERVISOR_MAX_OUTPUT_BYTES > 0 && tree.SUPERVISOR_MAX_OUTPUT_BYTES <= 64 * 1024 * 1024);
});

test('the default timeout is finite (60 minutes), an environment variable overrides it, and a bad value is refused naming the legal ones', async () => {
  const { DEFAULT_TIMEOUT_MS, timeoutFrom } = await runner();

  assert.equal(DEFAULT_TIMEOUT_MS, 60 * 60 * 1000);
  assert.equal(timeoutFrom({}), DEFAULT_TIMEOUT_MS);
  assert.equal(timeoutFrom({ RUN_TESTS_TIMEOUT_MS: '90000' }), 90000);
  for (const bad of ['0', '-1', '1.5', 'soon', '99999999999']) {
    assert.throws(() => timeoutFrom({ RUN_TESTS_TIMEOUT_MS: bad }), /RUN_TESTS_TIMEOUT_MS.*positive whole number/, `value ${bad}`);
  }
});

test('a timeout that fires is reported, the whole tree is ended, and the audit still runs: the run fails', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const hanging = (): EventEmitter => {
    const child = Object.assign(new EventEmitter(), { stop: () => child.emit('exit', null, 'SIGKILL') });
    left = plant(root, 'slow', RECORD);
    return child;
  };

  const code = await withEnv({ RUN_TESTS_TIMEOUT_MS: '40' }, () =>
    runWithAudit([], { spawn: hanging, roots: [root], sweep: nothingSwept, confirm: ENDED, write: log.write }),
  );

  assert.ok(log.seen.some((line) => line.includes('timeout of 40 ms') && line.includes('ending the whole process tree')), log.seen.join(' | '));
  assert.notEqual(code, 0);
  assert.equal(exists(left), false, 'the audit ran after the tree was ended, and removed what the run claimed');
});

test('the seam beats the environment variable', async (t) => {
  const { runWithAudit } = await runner();
  const log = lines();
  const hanging = (): EventEmitter => {
    const child = Object.assign(new EventEmitter(), { stop: () => child.emit('exit', null, 'SIGKILL') });
    return child;
  };

  await withEnv({ RUN_TESTS_TIMEOUT_MS: '3600000' }, () =>
    runWithAudit([], { spawn: hanging, roots: [privateRoot(t)], sweep: nothingSwept, confirm: ENDED, timeoutMs: 30, write: log.write }),
  );

  assert.ok(log.seen.some((line) => line.includes('timeout of 30 ms')), log.seen.join(' | '));
});

test('an invalid RUN_TESTS_TIMEOUT_MS stops the run before node --test starts', async (t) => {
  const { runWithAudit } = await runner();
  const log = lines();
  let started = false;
  const code = await withEnv({ RUN_TESTS_TIMEOUT_MS: 'soon' }, () =>
    runWithAudit([], { spawn: (...args) => { started = true; return suite(0)(...args); }, roots: [privateRoot(t)], sweep: nothingSwept, write: log.write }),
  );

  assert.equal(code, 1);
  assert.equal(started, false);
  assert.ok(log.seen.some((line) => line.includes('RUN_TESTS_TIMEOUT_MS')));
});

test('a second run in the same process while one is active is refused, and the first is not disturbed', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  let release: () => void = () => undefined;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const slow = (): EventEmitter => {
    const child = new EventEmitter();
    void first.then(() => child.emit('exit', 0, null));
    return child;
  };
  const log = lines();

  const running = runWithAudit([], { spawn: slow, roots: [root], sweep: nothingSwept, confirm: ENDED, write: lines().write });
  const refused = await runWithAudit([], { spawn: suite(0), roots: [root], sweep: nothingSwept, confirm: ENDED, write: log.write });
  release();
  const code = await running;
  const again = await runWithAudit([], { spawn: suite(0), roots: [root], sweep: nothingSwept, confirm: ENDED, write: lines().write });

  assert.equal(refused, 1);
  assert.ok(log.seen.some((line) => line.includes('already running in this process')), log.seen.join(' | '));
  assert.equal(code, 0);
  assert.equal(again, 0, 'the guard is released when the first run ends');
});

// ---- code round 2 -----------------------------------------------------------------------------------------------------------

test('[E2.1 code2 0] an orphan claim the caller does not own is listed and never read, removed or counted', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  const orphan = path.join(root, `testsToDelete-${me}-creds-strange-abc123.owner`);
  const code = await runWithAudit([], {
    spawn: suite(0, () => fs.writeFileSync(orphan, `${RECORD}\n`)),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    mine: (target) => !target.endsWith('.owner'), // the claim file belongs to somebody else
    write: log.write,
  });

  assert.equal(code, 0, 'a claim that is not ours is not a folder this run left');
  assert.ok(exists(orphan), 'another user\'s claim is never touched');
  assert.ok(log.seen.some((line) => line.includes('foreign:') && line.includes(orphan) && line.includes('does not fail this run') && /uid \d+/.test(line)), log.seen.join(' | '));
});

test('[E2.1 code2 0] a folder whose claim is another user\'s is kept too, even when the folder is ours and the text names this run', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let dir = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { dir = plant(root, 'theirs', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    mine: (target) => !target.endsWith('.owner'),
    write: log.write,
  });

  assert.equal(code, 0);
  assert.ok(exists(dir) && exists(`${dir}.owner`));
});

/** A child that sleeps, with `TESTSTODELETE_RUN` set to `value`; the caller ends it. */
function sleeper(value: string): ReturnType<typeof spawn> {
  return spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore', env: { ...process.env, TESTSTODELETE_RUN: value } });
}

test('[E2.1 code2 1] the marker is matched by the whole entry: the record as a prefix of a longer value, or inside another name, is not this run', linuxOnly, async () => {
  const tree = await processTree();
  const exact = sleeper(RECORD);
  const longer = sleeper(`${RECORD}9`);
  const prefixed = sleeper(`9${RECORD}`);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300)); // the three have started and their environments are readable

    const found = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', since: thisOwner().start, startOf: (pid) => processProbe(pid).start });

    assert.deepEqual(found.pids, [exact.pid], 'only the process whose entry is exactly TESTSTODELETE_RUN=<record>');
    assert.deepEqual(found.unverified, []);
  } finally {
    for (const child of [exact, longer, prefixed]) child.kill('SIGKILL');
  }
});

test('[E2.1 code2 3] a root that is a symlink to another root is one root, not two: the audit counts a folder once', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const real = privateRoot(t);
  const link = path.join(ownedDir(t, 'lnk'), 'to-real');
  fs.symlinkSync(real, link);
  const log = lines();
  let dir = '';

  const code = await runWithAudit([], { spawn: suite(0, () => { dir = plant(real, 'twice', RECORD); }), roots: [real, link], sweep: nothingSwept, confirm: ENDED, write: log.write });

  assert.equal(code, 1);
  assert.ok(!exists(dir));
  assert.ok(log.seen.some((line) => line.includes('this run left 1 folder(s)')), `one folder, counted once: ${log.seen.join(' | ')}`);
});

test('[E2.1 code2 3] a root given as a symlink is audited on its canonical path', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const real = privateRoot(t);
  const link = path.join(ownedDir(t, 'lnk'), 'to-real');
  fs.symlinkSync(real, link);
  const log = lines();
  let dir = '';

  await runWithAudit([], { spawn: suite(0, () => { dir = plant(real, 'canon', RECORD); }), roots: [link], sweep: nothingSwept, confirm: ENDED, write: log.write });

  assert.ok(log.seen.some((line) => line.includes(fs.realpathSync(real)) && line.includes(dir)), `the line names the canonical path: ${log.seen.join(' | ')}`);
});

test('[E2.1 code2 4] an unreadable /proc is "cannot confirm" on the marker path, never a throw — and the parent-pid chain still runs', linuxOnly, async () => {
  const tree = await processTree();
  const parent = spawn(
    process.execPath,
    ['-e', "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore' }); setInterval(() => undefined, 1000);"],
    { stdio: 'ignore', detached: true },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const found = await tree.findSurvivors({ rootPid: parent.pid, record: RECORD, platform: 'linux', procRoot: path.join(tempRoot(), 'no-such-proc') });

    assert.ok(found.unverified.length > 0, 'the marker path says it could not look');
    assert.equal(found.pids.length, 1, 'the chain below the root was still walked: the grandchild is found');
    assert.ok(!found.pids.includes(parent.pid ?? -1));
  } finally {
    if (parent.pid !== undefined) process.kill(-parent.pid, 'SIGKILL');
  }
});

test('[E2.1 code2 4] a scan that could not look keeps list-and-fail even when it found nothing', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let left = '';
  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'blind', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    survivors: () => ({ pids: [], unverified: ['/proc'] }),
    write: log.write,
  });

  assert.equal(code, 1);
  assert.ok(exists(left));
  assert.ok(log.seen.some((line) => line.includes('could not be confirmed')), log.seen.join(' | '));
});

test('[E2.1 code2 5] a supervised start that rejects settles the wait with an error instead of hanging it', async () => {
  const tree = await processTree();
  const job = tree.startInJob('node', [], { env: {} }, () => Promise.reject(new Error('pwsh is not there')));

  const error = await new Promise<Error>((resolve) => job.once('error', resolve));

  assert.match(error.message, /pwsh is not there/);
});

test('[E2.1 code2 6/11] survivors are scanned ONCE after the group is gone; only the pids found are polled until they are dead', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  let scans = 0;
  const asked: number[] = [];
  let left = '';
  const answers = [true, true, false];

  const code = await runWithAudit([], {
    spawn: suite(0, () => { left = plant(root, 'once', RECORD); }),
    roots: [root],
    sweep: nothingSwept,
    confirm: ENDED,
    survivors: () => { scans += 1; return { pids: [NO_SUCH_PID], unverified: [] }; },
    pidAlive: (pid) => { asked.push(pid); return answers.shift() ?? false; },
    settleTimeoutMs: 5000,
    write: lines().write,
  });

  assert.equal(scans, 1, 'the table and the environments are read once');
  assert.deepEqual(asked, [NO_SUCH_PID, NO_SUCH_PID, NO_SUCH_PID], 'then only the pid found is asked about');
  assert.equal(code, 1);
  assert.equal(exists(left), false, 'dead after the polls: removed');
});

test('[E2.1 code2 8] a run that timed out exits 124 whatever the coordinator\'s own code or signal was', async (t) => {
  const { runWithAudit } = await runner();
  const codes: number[] = [];
  for (const [status, signal] of [[0, null], [3, null], [null, 'SIGKILL'], [null, 'SIGTERM']] as const) {
    const hanging = (): EventEmitter => {
      const child = Object.assign(new EventEmitter(), { stop: () => child.emit('exit', status, signal) });
      return child;
    };
    codes.push(await runWithAudit([], { spawn: hanging, roots: [privateRoot(t)], sweep: nothingSwept, confirm: ENDED, timeoutMs: 20, write: lines().write }));
  }

  assert.deepEqual(codes, [124, 124, 124, 124]);
});

/** A fake /proc with one process of ours whose environment cannot be read (mode 0): what a hardened daemon of the same user looks like. */
function blindProc(scope: Parameters<typeof ownedDir>[0]): string {
  const proc = ownedDir(scope, 'proc');
  fs.mkdirSync(path.join(proc, '4242'));
  const environ = path.join(proc, '4242', 'environ');
  fs.writeFileSync(environ, 'TESTSTODELETE_RUN=x');
  fs.chmodSync(environ, 0);
  return proc;
}

test('[E2.1 code2 4] a process of ours that started BEFORE the run and cannot be read is not a doubt: it cannot be a descendant', blindOnly, async (t) => {
  const tree = await processTree();
  const proc = blindProc(t);

  const older = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]), since: 1_000_000, startOf: () => 999_000 });

  assert.deepEqual(older, { pids: [], unverified: [] });
});

test('[E2.1 code2 4] a process of ours that started AFTER the run began, or whose start is unknown, and cannot be read, is unverified', blindOnly, async (t) => {
  const tree = await processTree();
  const proc = blindProc(t);

  const newer = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]), since: 1_000_000, startOf: () => 1_000_005 });
  const unknown = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]), since: 1_000_000, startOf: () => undefined });
  const undated = await tree.findSurvivors({ rootPid: undefined, record: RECORD, platform: 'linux', procRoot: proc, table: () => tableOf([4242]) });

  for (const found of [newer, unknown, undated]) {
    assert.equal(found.pids.length, 0);
    assert.equal(found.unverified.length, 1, JSON.stringify(found));
  }
});
