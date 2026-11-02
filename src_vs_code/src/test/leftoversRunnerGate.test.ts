// The runner's code gate and risk consult (E2.1, coai sessions 156fd570 and 3d75f52c): a descendant that leaves the process
// group, the cleanup that must never throw, the poll that backs off inside its bound, a finite timeout that says it fired, a
// confirmation that cannot succeed without a handle, and one runner at a time per process.
//
// Same rules as `leftoversRunner.test.ts`: private roots through the `roots` seam, never the real sweep, and a REAL
// `node --test` only where the point is the real process tree.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  ENDED, RECORD, WRAPPER, exists, isAlive, lines, nothingSwept, plant, privateRoot, processTree, runner, suite, withEnv,
} from './runnerWorld';

const posixOnly = process.platform === 'win32' ? { skip: 'process groups and sessions are POSIX; Windows has the job-object supervisor' } : {};

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

test('a descendant that left the process group is ended before any removal, or the folder is kept and the audit fails', posixOnly, async (t) => {
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
    survivors: () => [NO_SUCH_PID],
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
    { timeoutMs: 5000, ask: () => 3, now: () => clock, pause: async (ms) => { waited.push(ms); clock += ms; } },
  );

  assert.deepEqual(answer, { ended: false, alive: 3 });
  assert.deepEqual(waited.slice(0, 6), [50, 100, 200, 400, 800, 1000]);
  assert.ok(Math.max(...waited) <= 1000, 'a step never grows past one second');
  assert.ok(waited.reduce((sum, ms) => sum + ms, 0) <= 5000, 'the polling stays inside the bound');
});

test('the confirmation stops asking as soon as the answer is none', async () => {
  const tree = await processTree();
  const answers = [2, 1, 0];

  const answer = await tree.confirmTreeEnded({ root: 1 }, { ask: () => answers.shift() ?? 0, pause: async () => undefined });

  assert.deepEqual(answer, { ended: true, alive: 0 });
  assert.deepEqual(answers, []);
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
