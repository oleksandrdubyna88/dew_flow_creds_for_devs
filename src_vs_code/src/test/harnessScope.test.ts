// `scripts/lib/harnessScope.cjs` (E2.2.S2, plan change 7.1): the one exit module every scenario harness uses. A harness is a script,
// not a test file, so its owned folders are removed on EVERY exit path by this module: a return, a returned failure code, a throw,
// a throw at load, a SIGINT/SIGTERM/SIGHUP, and a second signal during the close. SIGKILL cannot be handled; the next sweep collects.
//
// Each scenario runs a small fixture script in a REAL child process (a signal and `process.exit` cannot be tried in this process).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Scope } from '../../scripts/lib/leftovers.cjs';
import { SRC_VS_CODE, WRAPPER, isAlive, privateRoot } from './runnerWorld';

const HARNESS_SCOPE = path.join(SRC_VS_CODE, 'scripts', 'lib', 'harnessScope.cjs');
const SSHD_HELPERS = path.join(SRC_VS_CODE, 'scripts', 'itestSshd.cjs');
const posixOnly = process.platform === 'win32' ? { skip: 'a signal is delivered to a process on POSIX; Windows ends it' } : {};

interface Outcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  out: string;
}
interface Step {
  /** When the child's output matches this... */
  when: RegExp;
  /** ...send it this signal. */
  send: NodeJS.Signals;
}

interface Fixture {
  /** The fixture's source: a constant text apart from `body`. No value is spliced into it. */
  script: string;
  /** The values it reads at run time, from its environment. */
  env: NodeJS.ProcessEnv;
}

/** A fixture harness: owns one folder under `root`, prints it, then runs `body`. It reads the wrapper, the exit module and the root from its environment. */
function fixture(root: string, body: string): Fixture {
  const script = [
    "const fs = require('node:fs');",
    "const { ownedDir } = require(process.env.FIXTURE_WRAPPER);",
    "const harnessScope = require(process.env.FIXTURE_HARNESS_SCOPE);",
    'harnessScope.run(async (scope) => {',
    "  const dir = ownedDir(scope, 'fx', { parent: process.env.FIXTURE_ROOT });",
    "  console.log('DIR=' + dir + ' EXISTS=' + fs.existsSync(dir) + ' CLAIM=' + fs.existsSync(dir + '.owner'));",
    body,
    '});',
  ].join('\n');
  return { script, env: { ...process.env, FIXTURE_WRAPPER: WRAPPER, FIXTURE_HARNESS_SCOPE: HARNESS_SCOPE, FIXTURE_SSHD: SSHD_HELPERS, FIXTURE_ROOT: root } };
}

/** Run `code` in a child, send each step's signal when its output appears, and say how the child ended. */
function runChild(fx: Fixture, steps: Step[] = []): Promise<Outcome> {
  const child = spawn(process.execPath, ['-e', fx.script], { env: fx.env, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  const pending = [...steps];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    out += chunk;
    for (const step of pending.filter((candidate) => candidate.when.test(out))) {
      pending.splice(pending.indexOf(step), 1);
      child.kill(step.send);
    }
  });
  return new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal, out })));
}

const dirOf = (out: string): string => /DIR=(\S+)/.exec(out)?.[1] ?? '<no dir printed>';
const gone = (dir: string): boolean => !fs.existsSync(dir) && !fs.existsSync(`${dir}.owner`);
const HANG = "console.log('READY'); await new Promise(() => setInterval(() => {}, 1000));";

/** The premise of every scenario: the folder and its claim existed before the exit. */
function assertExisted(out: string): void {
  assert.match(out, /EXISTS=true CLAIM=true/, `premise: the folder and its claim existed before the exit (${out})`);
}

function privateRootOf(t: Scope): string {
  return fs.realpathSync(privateRoot(t));
}

test('[S2.2] a return: the owned folder and its claim are gone, exit 0', async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, 'return;'));

  assertExisted(done.out);
  assert.equal(done.code, 0);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a returned failure code is the exit code, and the folder is gone', async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, 'return 3;'));

  assertExisted(done.out);
  assert.equal(done.code, 3);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a throw is exit 1 with the error on stderr, and the folder is gone', async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, "throw new Error('boom');"));

  assertExisted(done.out);
  assert.equal(done.code, 1);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a throw at load inside main (an `out/` that was not compiled) is exit 1, and the folder is gone', async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, "require('./out-that-was-not-compiled.js');"));

  assertExisted(done.out);
  assert.equal(done.code, 1);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a SIGTERM: exit 143, the folder and its claim are gone', posixOnly, async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, HANG), [{ when: /READY/, send: 'SIGTERM' }]);

  assertExisted(done.out);
  assert.equal(done.signal, null, 'the child chose its exit; the signal did not kill it');
  assert.equal(done.code, 143);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a SIGINT is exit 130 and a SIGHUP is exit 129, and the folder is gone', posixOnly, async (t) => {
  const root = privateRootOf(t);

  const interrupted = await runChild(fixture(root, HANG), [{ when: /READY/, send: 'SIGINT' }]);
  const hungUp = await runChild(fixture(root, HANG), [{ when: /READY/, send: 'SIGHUP' }]);

  assert.deepEqual([interrupted.code, hungUp.code], [130, 129]);
  assert.ok(gone(dirOf(interrupted.out)) && gone(dirOf(hungUp.out)));
});

// The close is slowed by a callback registered AFTER the folder, so it runs first and the folder is still there while the second
// signal comes. With `process.once` the second SIGTERM would get Node's default and kill the child by signal, leaving the folder.
const SLOW_CLOSE = [
  "scope.after(async () => { console.log('CLOSE-START'); await new Promise((r) => setTimeout(r, 800)); console.log('CLOSE-END'); });",
  HANG,
].join('\n');

test('[S2.2] a second SIGTERM during the close is ignored: the close finishes, exit 143, not a death by signal', posixOnly, async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, SLOW_CLOSE), [
    { when: /READY/, send: 'SIGTERM' },
    { when: /CLOSE-START/, send: 'SIGTERM' },
  ]);

  assertExisted(done.out);
  assert.match(done.out, /CLOSE-START[\s\S]*CLOSE-END/, 'premise: the second signal came inside the close, and the close went on');
  assert.equal(done.signal, null, 'the second SIGTERM did not take the default action');
  assert.equal(done.code, 143);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] a section scope registered in the module scope is closed by a SIGTERM too', posixOnly, async (t) => {
  const root = privateRootOf(t);
  const body = [
    'const section = harnessScope.sectionScope();',
    "const inner = ownedDir(section, 'sec', { parent: process.env.FIXTURE_ROOT });",
    "console.log('SECTION=' + inner);",
    HANG,
  ].join('\n');

  const done = await runChild(fixture(root, body), [{ when: /READY/, send: 'SIGTERM' }]);

  const inner = /SECTION=(\S+)/.exec(done.out)?.[1] ?? '<none>';
  assert.notEqual(inner, '<none>', 'premise: the section folder was made');
  assert.equal(done.code, 143);
  assert.ok(gone(inner), 'the section folder and its claim are gone');
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] pin: after SIGKILL the folder and its claim remain — the next sweep collects them', posixOnly, async (t) => {
  const root = privateRootOf(t);

  const done = await runChild(fixture(root, HANG), [{ when: /READY/, send: 'SIGKILL' }]);

  assertExisted(done.out);
  assert.equal(done.signal, 'SIGKILL');
  const dir = dirOf(done.out);
  assert.ok(fs.existsSync(dir) && fs.existsSync(`${dir}.owner`), 'SIGKILL cannot be handled: nothing removed it');
});

test('[S2.2] tempEnv gives a child the owned folder as TMPDIR, TEMP and TMP and keeps the rest of the environment', async (t) => {
  const root = privateRootOf(t);
  const body = "console.log('ENV=' + JSON.stringify(harnessScope.tempEnv('/owned/dir', { KEEP: 'yes', TMPDIR: '/old' })));";

  const done = await runChild(fixture(root, body));

  const env = JSON.parse(/ENV=(.*)/.exec(done.out)?.[1] ?? 'null') as Record<string, string> | null;
  assert.deepEqual(env, { KEEP: 'yes', TMPDIR: '/owned/dir', TEMP: '/owned/dir', TMP: '/owned/dir' });
});

test('[S2.2] an uncaught exception from a callback is exit 1, the error is written, and the folder is gone', async (t) => {
  const root = privateRootOf(t);
  const body = "console.log('READY'); setTimeout(() => { throw new Error('late'); }, 50); await new Promise(() => setInterval(() => {}, 1000));";

  const done = await runChild(fixture(root, body));

  assertExisted(done.out);
  assert.equal(done.signal, null);
  assert.equal(done.code, 1);
  assert.ok(gone(dirOf(done.out)), 'the folder and its claim are gone');
});

test('[S2.2] an unhandled rejection from a callback is exit 1, and the folder is gone', async (t) => {
  const root = privateRootOf(t);
  const body = "console.log('READY'); setTimeout(() => { Promise.reject(new Error('lost')); }, 50); await new Promise(() => setInterval(() => {}, 1000));";

  const done = await runChild(fixture(root, body));

  assert.equal(done.code, 1);
  assert.ok(gone(dirOf(done.out)));
});

test('[S2.2] closeOnce: two calls at once close the scope once, and both wait for the close', async (t) => {
  const root = privateRootOf(t);
  const body = [
    'let closes = 0; let slowDone = false;',
    "scope.after(async () => { closes += 1; await new Promise((r) => setTimeout(r, 200)); slowDone = true; });",
    'const first = harnessScope.closeOnce();',
    'await harnessScope.closeOnce();', // only the SECOND call is awaited: it must wait for the close the first one started
    "console.log('SECOND-RETURNED closes=' + closes + ' slowDone=' + slowDone + ' gone=' + !fs.existsSync(dir));",
    'await first;',
    'return 0;',
  ].join('\n');

  const done = await runChild(fixture(root, body));

  assert.match(done.out, /SECOND-RETURNED closes=1 slowDone=true gone=true/);
  assert.equal(done.code, 0);
});

// A section's process writes into the section folder and records, OUTSIDE it, whether the folder was still there when it was told to stop.
const SECTION_CHILD =
  "const fs = require('node:fs'); fs.writeFileSync(process.env.CHILD_FOLDER + '/alive', '1');" +
  " process.on('SIGTERM', () => { let seen = 'ok'; try { fs.writeFileSync(process.env.CHILD_FOLDER + '/stopped', '1'); } catch { seen = 'folder-gone'; }" +
  " fs.writeFileSync(process.env.CHILD_OUT, seen); process.exit(0); }); setInterval(() => {}, 1000);";

const readOr = (file: string, fallback: string): string => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback);
const pidIn = (out: string): number => Number(/CHILDPID=(\d+)/.exec(out)?.[1] ?? 0);

function killQuietly(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // gone already
  }
}

test('[S2.2] a SIGTERM during a section stops the section\'s process BEFORE its folder is removed (never a folder in use)', posixOnly, async (t) => {
  const root = privateRootOf(t);
  const out = path.join(root, 'child-out.txt');
  const body = [
    "const path = require('node:path');",
    "const sshd = require(process.env.FIXTURE_SSHD);",
    'const section = harnessScope.sectionScope();',
    "const inner = ownedDir(section, 'sec', { parent: process.env.FIXTURE_ROOT });",
    'section.after(() => sshd.endRunning());', // registered AFTER the folder: it runs first on close
    `const started = sshd.launch(process.execPath, ['-e', ${JSON.stringify(SECTION_CHILD)}], { env: { ...process.env, CHILD_FOLDER: inner, CHILD_OUT: path.join(process.env.FIXTURE_ROOT, 'child-out.txt') } });`,
    "console.log('SECTION=' + inner + ' CHILDPID=' + started.child.pid);",
    "while (!fs.existsSync(inner + '/alive')) await new Promise((r) => setTimeout(r, 20));",
    "console.log('READY'); await new Promise(() => setInterval(() => {}, 1000));",
  ].join('\n');

  const done = await runChild(fixture(root, body), [{ when: /READY/, send: 'SIGTERM' }]);

  const pid = pidIn(done.out);
  try {
    assert.ok(pid > 0, 'premise: the section started its process');
    assert.equal(done.code, 143);
    assert.equal(readOr(out, 'the process was never told to stop'), 'ok', 'it was told to stop while the folder was still there');
    assert.equal(isAlive(pid), false, 'the process is dead');
    assert.ok(gone(/SECTION=(\S+)/.exec(done.out)?.[1] ?? '<none>'), 'and then the folder and its claim are gone');
  } finally {
    killQuietly(pid);
  }
});
