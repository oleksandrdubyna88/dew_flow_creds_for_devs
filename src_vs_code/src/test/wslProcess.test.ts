import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { ChildProcess } from 'node:child_process';
import {
  TRANSLATE_TIMEOUT_MS,
  WslSpawner,
  runWslBounded,
  runWslOutcome,
  runningDistros,
  translateWindowsPath,
  wslBinary,
} from '../wslProcess';

// `runWsl` never rejects, which is right for "which distributions are there" — and it also never
// gives up. On the path of a button click that is an editor that has stopped answering, with no
// error anywhere. These tests drive the bounded variant through a fake `wsl.exe`, because CI is
// Linux and a test that only runs on a Windows machine with WSL installed is a test that never runs.

/** A fake child that answers exactly as a real one does, and remembers being killed. */
class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter() as EventEmitter & { setEncoding(enc: string): void };
  readonly killed: string[] = [];
  pid = 4242;

  constructor() {
    super();
    this.stdout.setEncoding = () => undefined;
  }

  kill(signal?: string): boolean {
    this.killed.push(signal ?? 'SIGTERM');
    return true;
  }
}

const spawning = (
  child: FakeChild,
  seen: string[][] = [],
): { spawn: WslSpawner; seen: string[][] } => ({
  spawn: (args) => {
    seen.push([...args]);
    return child as unknown as ChildProcess;
  },
  seen,
});

const says = (child: FakeChild, text: string, code = 0): void => {
  setImmediate(() => {
    child.stdout.emit('data', text);
    child.emit('close', code);
  });
};

test('an answer comes back as the text the child printed', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  says(child, '/mnt/c/Users/me/key\n');

  assert.equal(await runWslBounded(['-e', 'wslpath'], 1_000, spawn), '/mnt/c/Users/me/key\n');
});

test('a NON-ZERO exit answers empty, because its complaint went to stderr', async () => {
  // Treating a failed exit as an answer would hand the caller empty stdout as though it were a path.
  const child = new FakeChild();
  const { spawn } = spawning(child);
  says(child, '', 1);

  assert.equal(await runWslBounded(['-e', 'wslpath'], 1_000, spawn), '');
});

test('a child that never starts answers empty rather than rejecting', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  setImmediate(() => child.emit('error', new Error('wsl.exe is not on this machine')));

  assert.equal(await runWslBounded(['-l'], 1_000, spawn), '');
});

test('a HUNG child is bounded, and the child is actually killed', async () => {
  // The point of the whole story: a stopped distribution must not leave a click waiting for ever,
  // and a deadline that abandons the child rather than ending it is half a fix.
  const child = new FakeChild();
  const { spawn } = spawning(child); // says nothing, ever

  const started = Date.now();
  const answer = await runWslBounded(['-e', 'wslpath'], 60, spawn);

  assert.equal(answer, '');
  assert.ok(Date.now() - started < 5_000, 'the bound did not hold');
  assert.ok(child.killed.length > 0, 'the deadline passed but the child was left running');
});

test('the translation names the distribution and asks wslpath, never composing /mnt/c itself', async () => {
  // /mnt/c is the DEFAULT automount root, not a rule — it is configurable in /etc/wsl.conf, so a
  // composed path is a guess that breaks on the first machine that moved it.
  const child = new FakeChild();
  const { spawn, seen } = spawning(child);
  says(child, '/mnt/c/Users/me/known_hosts\n');

  const answer = await translateWindowsPath('Ubuntu', 'C:\\Users\\me\\known_hosts', 1_000, spawn);

  assert.equal(answer, '/mnt/c/Users/me/known_hosts');
  assert.deepEqual(seen, [['-d', 'Ubuntu', '-e', 'wslpath', '-a', 'C:\\Users\\me\\known_hosts']]);
});

test('the default distribution is asked without a -d, as WSL expects', async () => {
  const child = new FakeChild();
  const { spawn, seen } = spawning(child);
  says(child, '/mnt/c/x\n');

  await translateWindowsPath('', 'C:\\x', 1_000, spawn);

  assert.deepEqual(seen, [['-e', 'wslpath', '-a', 'C:\\x']]);
});

test('anything that is not ONE absolute path answers empty', async () => {
  // So the caller has one failure to handle and cannot hand a greeting to ssh.
  for (const output of ['', '\n', 'wslpath: bad usage\n', 'hello\n/mnt/c/x\n', 'C:\\x\n', '  \n']) {
    const child = new FakeChild();
    const { spawn } = spawning(child);
    says(child, output);

    assert.equal(
      await translateWindowsPath('Ubuntu', 'C:\\x', 1_000, spawn),
      '',
      `"${output.replace(/\n/g, '\\n')}" was accepted as a path`,
    );
  }
});

test('surrounding whitespace is trimmed, because wslpath ends its line', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  says(child, '  /mnt/c/Users/me/key  \r\n');

  assert.equal(await translateWindowsPath('Ubuntu', 'C:\\k', 1_000, spawn), '/mnt/c/Users/me/key');
});

test('a hung translation is refused within the bound, not waited on', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);

  assert.equal(await translateWindowsPath('Ubuntu', 'C:\\x', 50, spawn), '');
  assert.ok(child.killed.length > 0);
});

test('the default bound is short enough that a person does not think the editor froze', () => {
  assert.ok(TRANSLATE_TIMEOUT_MS <= 5_000, 'a click may not wait longer than five seconds');
});

// --- which binary is actually launched (CWE-426) -----------------------------------------------
//
// `spawn(name, …, { shell: false })` resolves a relative name the way CreateProcess does, and
// CreateProcess searches the CURRENT DIRECTORY before PATH. A `wsl.exe` left in the extension host's
// working directory would then run with our arguments. `sshProgram.ts` records the same defect for
// `ssh.exe`; SonarCloud flagged it here (typescript:S4036) on a new call site.

test('the launcher is named by its full path, never by a name Windows would search for', () => {
  // CWE-426: spawn(name, …, { shell: false }) resolves a relative name the way CreateProcess does,
  // and CreateProcess searches the CURRENT DIRECTORY before PATH. A wsl.exe left in the extension
  // host working directory would then run with our arguments. sshProgram.ts records the same defect
  // for ssh.exe; SonarCloud flagged it here (typescript:S4036) on one new call site.
  assert.equal(wslBinary({ SystemRoot: 'C:\\Windows' }), 'C:\\Windows\\System32\\wsl.exe');
});

test('a Windows that is not on C: is followed, not assumed', () => {
  assert.equal(wslBinary({ SystemRoot: 'D:\\Win' }), 'D:\\Win\\System32\\wsl.exe');
  assert.equal(wslBinary({ windir: 'E:\\Windows' }), 'E:\\Windows\\System32\\wsl.exe', 'the older spelling counts too');
});

test('with nothing to go on it is STILL absolute — there is no bare name to fall back to', () => {
  // A review caught the first version answering 'wsl.exe' when the file was missing, which hands the
  // search straight back to CreateProcess in the one case the guard exists for. A machine with no
  // wsl.exe in System32 has no WSL, and spawning a path that is not there emits an error event —
  // which every caller in this module already answers with the empty result it is built for.
  const answer = wslBinary({});
  assert.equal(answer, 'C:\\Windows\\System32\\wsl.exe');
  assert.equal(answer.includes('\\System32\\'), true, 'and it is a PATH, not a name');
});

// --- the same bounded run, telling a timeout from an exit (plan §5.8, E4.S2) ---------------------
//
// The stale-install check needs the difference `runWslBounded` folds away: a non-zero exit is a
// binary older than `--version` (stale), a timeout is a busy distribution (unknown). Widened from the
// one core, not a second spawner.

test('an exit is reported with its code and what it printed, even a non-zero one', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  says(child, 'unknown argument\n', 2);

  assert.deepEqual(await runWslOutcome(['-e', '/x', '--version'], 1_000, spawn), {
    kind: 'exited',
    code: 2,
    stdout: 'unknown argument\n',
  });
});

test('a hung child is reported as a TIMEOUT, not as an exit, and is killed', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);

  assert.deepEqual(await runWslOutcome(['-e', '/x', '--version'], 50, spawn), { kind: 'timeout' });
  assert.ok(child.killed.length > 0, 'the deadline passed but the child was left running');
});

test('a child that never starts is an exit with no code, not a timeout', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  setImmediate(() => child.emit('error', new Error('no wsl.exe')));

  assert.deepEqual(await runWslOutcome(['-l'], 1_000, spawn), { kind: 'exited', code: null, stdout: '' });
});

test('output that arrives as BYTES is decoded too — the core no longer relies on setEncoding', async () => {
  const child = new FakeChild();
  const { spawn } = spawning(child);
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from('creds-mcp 0.12.0\n', 'utf8'));
    child.emit('close', 0);
  });

  assert.deepEqual(await runWslOutcome(['-e', '/x'], 1_000, spawn), { kind: 'exited', code: 0, stdout: 'creds-mcp 0.12.0\n' });
});

test('the running distributions are read from UTF-16, the way wsl -l answers', async () => {
  const child = new FakeChild();
  const { spawn, seen } = spawning(child);
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from('Ubuntu\r\ndocker-desktop\r\n', 'utf16le'));
    child.emit('close', 0);
  });

  assert.deepEqual(await runningDistros(1_000, spawn), ['Ubuntu']);
  assert.deepEqual(seen, [['-l', '--running', '-q']], 'asked for the RUNNING ones — listing all would not say which are up');
});

test('a listing that hangs or fails answers "none running", so nothing is then asked', async () => {
  const hung = new FakeChild();
  assert.deepEqual(await runningDistros(50, spawning(hung).spawn), []);
  assert.ok(hung.killed.length > 0);

  const failed = new FakeChild();
  says(failed, '', 1);
  assert.deepEqual(await runningDistros(1_000, spawning(failed).spawn), []);
});
