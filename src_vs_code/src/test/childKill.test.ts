import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { KILL_GRACE_MS, killChild, treeKillArgv } from '../childKill';

test('on Windows a shell-spawned child needs the whole TREE killed, not just the wrapper', () => {
  // `spawn(line, [], { shell: true })` makes cmd.exe the child and the real program a
  // grandchild, so kill() alone leaves the program running — with the secrets it was given.
  assert.deepEqual(treeKillArgv(4242, 'win32'), ['taskkill', '/pid', '4242', '/T', '/F']);
});

test('POSIX needs no separate tree command — the signal is enough', () => {
  assert.equal(treeKillArgv(4242, 'linux'), undefined);
  assert.equal(treeKillArgv(4242, 'darwin'), undefined);
});

test('a missing or nonsense pid produces no command rather than a wild one', () => {
  // `taskkill /pid 0 /T /F` is not a command anyone should run by accident.
  assert.equal(treeKillArgv(0, 'win32'), undefined);
  assert.equal(treeKillArgv(-1, 'win32'), undefined);
  assert.equal(treeKillArgv(1.5, 'win32'), undefined);
});

test('the grace period is a named constant, so the escalation is a decision and not a guess', () => {
  assert.equal(KILL_GRACE_MS, 2_000);
});

test('killChild ends a real child that ignores SIGTERM', async () => {
  // The whole point of escalating: a process that catches the polite signal still goes.
  const script =
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); console.log("ready");';
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve) => child.stdout.once('data', resolve));

  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  killChild(child, { tree: false });

  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), KILL_GRACE_MS + 4_000).unref?.(),
  );
  assert.notEqual(await Promise.race([exited, timeout]), 'timeout', 'the child outlived the kill');
});

test('killing an already-dead child is a no-op rather than a throw', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((resolve) => child.once('exit', resolve));

  assert.doesNotThrow(() => killChild(child, { tree: false }));
});
