import * as assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import * as childKill from '../childKill';
import { KILL_GRACE_MS } from '../childKill';
import { RemotePlan, planLaunch, secretsLaunch, secretsStdin, sshLinkOf } from '../remoteLaunch';
import { E3_INHERITED_DROP, type EnvDrop } from '../sshProgram';
import { EntityMetadata } from '../types';
import { NONCE, writeFakeSsh } from './remoteShellHarness';
import { fakeRoad, sshNode } from './sshRoadWorld';
import { StubEventEmitter, loadWithVscode } from './vscodeStub';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { HOST_SOCKET, OUR_SOCKET } from './fakePaths';

/**
 * The terminal whose output the extension owns, so a secret cannot appear in it (audit A3).
 *
 * <p>This is the only surface where a secret handed to a child process is supposed to be
 * unprintable, and the guarantee is worth stating precisely: the child DOES receive the real
 * value in its environment — it has to, or the command would not work — and what is replaced
 * is only what comes back out. So the test that matters spawns a real child, gives it a real
 * secret, has it print that secret deliberately, and asserts the screen never shows it.</p>
 *
 * <p>A real child, not a stub, because the masking runs over chunk boundaries: a value split
 * across two `data` events is exactly the case a stub would never produce and a slow pipe
 * produces constantly. `SecretMasker` holds a tail back for that, and the flush-before-exit
 * ordering below is what keeps the held-back characters from arriving after `[exit 0]`.</p>
 */

type Masked = typeof import('../maskedTerminal');

interface Pty {
  onDidWrite(listener: (text: string) => void): { dispose(): void };
  onDidClose(listener: (code: number) => void): { dispose(): void };
  open(): void;
  close(): void;
  handleInput(data: string): void;
}

interface World {
  mod: Masked;
  /** Every child `spawnSpy` saw start. */
  children: childProcess.ChildProcess[];
  /** The options of every `killChild` call `killSpy` saw. */
  kills: unknown[];
  /** How many times the terminal was disposed. */
  disposed: number;
  /** The pty VS Code was handed, plus everything written to it. */
  pty(): Pty;
  written(): string;
  exitCode(): number | undefined;
  shown: number;
}

interface WorldOptions {
  /** Modules to stand in for, by the request string `maskedTerminal.ts` writes (`spawnSpy`, `killSpy`). */
  mocks?: (w: World) => Record<string, unknown>;
  /** The first workspace folder the stub `vscode.workspace` has; none when absent. */
  workspaceDir?: string;
  /** `show()` throws `no show` after the terminal was made. */
  showThrows?: boolean;
  /** `createTerminal` throws `no terminal`. */
  createThrows?: boolean;
}

/** Records every child that starts, and passes the spawn through. */
const spawnSpy = (w: World): Record<string, unknown> => ({
  'node:child_process': {
    ...childProcess,
    spawn: (...args: Parameters<typeof childProcess.spawn>): childProcess.ChildProcess => {
      const child = childProcess.spawn(...args);
      w.children.push(child);
      return child;
    },
  },
});

/** Records the options of every kill, and passes it through. */
const killSpy = (w: World): Record<string, unknown> => ({
  './childKill': {
    ...childKill,
    killChild: (child: childProcess.ChildProcess, options: childKill.KillOptions): void => {
      w.kills.push(options);
      childKill.killChild(child, options);
    },
  },
});

/** The stub's folders: none, unless the test names a workspace. */
function foldersOf(workspaceDir: string | undefined): { uri: { fsPath: string } }[] | undefined {
  return workspaceDir === undefined ? undefined : [{ uri: { fsPath: workspaceDir } }];
}

/** The terminal the stub hands back: `show()` may throw (`no show`), and every `dispose()` is counted. */
function terminalOf(w: World, showThrows: boolean): unknown {
  return {
    show: (): void => {
      w.shown += 1;
      if (showThrows) {
        throw new Error('no show');
      }
    },
    dispose: (): void => {
      w.disposed += 1;
    },
  };
}

function world(options: WorldOptions = {}): World {
  let pty: Pty | undefined;
  let out = '';
  let code: number | undefined;
  const w = {
    children: [] as childProcess.ChildProcess[],
    kills: [] as unknown[],
    disposed: 0,
    mod: undefined as never as Masked,
    pty: (): Pty => pty as Pty,
    written: (): string => out,
    exitCode: (): number | undefined => code,
    shown: 0,
  };
  const createTerminal = (created: { pty: Pty }): unknown => {
    if (options.createThrows === true) {
      throw new Error('no terminal');
    }
    pty = created.pty;
    // VS Code subscribes before it opens; so does this.
    pty.onDidWrite((text) => {
      out += text;
    });
    pty.onDidClose((c) => {
      code = c;
    });
    return terminalOf(w, options.showThrows === true);
  };
  const stub = { EventEmitter: StubEventEmitter, window: { createTerminal }, workspace: { workspaceFolders: foldersOf(options.workspaceDir) } };
  w.mod = loadWithVscode<Masked>('../maskedTerminal', stub, options.mocks?.(w) ?? {});
  return w;
}

/** Run one command to completion in the masked terminal and return what reached the screen. */
async function run(
  w: World,
  options: { commandLine: string; env?: Record<string, string>; secrets: readonly (string | { value: string; label: string })[] },
): Promise<string> {
  w.mod.runInMaskedTerminal({
    name: 'test',
    commandLine: options.commandLine,
    env: options.env ?? {},
    secrets: options.secrets,
    banner: '[masked]',
    shell: process.platform === 'win32' ? undefined : '/bin/sh',
  });
  w.pty().open();
  await closed(w);
  return w.written();
}

function closed(w: World): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (w.exitCode() !== undefined) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - started > 20_000) {
        clearInterval(poll);
        reject(new Error(`child never closed; output so far: ${w.written()}`));
      }
    }, 10);
  });
}

const NODE = JSON.stringify(process.execPath);

test('a secret the child PRINTS never reaches the screen', async () => {
  // The whole feature. `vscode.window.createTerminal({ env })` cannot do this — the extension
  // never sees a byte — which is why the script feature could previously only warn about it.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.log(process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.ok(!out.includes('sk-live-abcdef123456'), `the secret leaked: ${out}`);
  assert.match(out, /\[exit 0\]/, 'and the run itself succeeded');
});

test('the child still RECEIVES the real value — masking is about the screen, not the run', async () => {
  // A masker that also broke the command would be worse than no masker.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "process.exit(process.env.TOKEN === 'sk-live-abcdef123456' ? 0 : 3)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.match(out, /\[exit 0\]/, `the child did not see the real value: ${out}`);
});

test('a labelled secret says WHICH one stood there', async () => {
  // With several in play, an anonymous block of asterisks tells nobody what was hidden.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.log(process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: [{ value: 'sk-live-abcdef123456', label: 'API_TOKEN' }],
  });

  assert.match(out, /API_TOKEN/, out);
  assert.ok(!out.includes('sk-live-abcdef123456'));
});

test('stderr is masked too — a secret in an error message is still a secret', async () => {
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "console.error('failed for ' + process.env.TOKEN)"`,
    env: { TOKEN: 'sk-live-abcdef123456' },
    secrets: ['sk-live-abcdef123456'],
  });

  assert.ok(!out.includes('sk-live-abcdef123456'), out);
  assert.match(out, /failed for/, 'the rest of the message survives');
});

test('a secret split across two writes is still caught', async () => {
  // The reason the masker holds a tail back. Two writes with no newline between them arrive
  // as separate chunks, and a per-chunk replace would miss the value spanning them.
  const w = world();
  const half = 'sk-live-abcdef';

  const out = await run(w, {
    commandLine: `${NODE} -e "process.stdout.write('${half}'); setTimeout(() => process.stdout.write('123456' + String.fromCharCode(10)), 50)"`,
    env: {},
    secrets: [`${half}123456`],
  });

  assert.ok(!out.includes(`${half}123456`), `the split value leaked: ${JSON.stringify(out)}`);
});

test('the held-back tail is released BEFORE the exit line, not after it', async () => {
  // Otherwise the last characters of the output arrive after `[exit 0]` — or never.
  const w = world();

  const out = await run(w, {
    commandLine: `${NODE} -e "process.stdout.write('tail-without-newline')"`,
    env: {},
    secrets: ['nothing-here'],
  });

  assert.ok(out.indexOf('tail-without-newline') < out.indexOf('[exit'), out);
});

test('the exit CODE is reported rather than the terminal just vanishing', async () => {
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "process.exit(7)"`, secrets: [] });

  assert.match(out, /\[exit 7\]/, out);
  assert.equal(w.exitCode(), 7, 'and VS Code is told the same code');
});

test('a command that cannot start says so instead of an empty terminal', async () => {
  const w = world();

  const out = await run(w, {
    commandLine: 'definitely-not-a-real-binary-xyz --version',
    secrets: [],
  });

  assert.ok(/Could not start|\[exit/.test(out), `a silent terminal is the failure mode: ${out}`);
  assert.notEqual(w.exitCode(), 0, 'and it is not reported as success');
});

test('the banner is written before anything the child prints', async () => {
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "console.log('child output')"`, secrets: [] });

  assert.ok(out.indexOf('[masked]') < out.indexOf('child output'), out);
});

test('output is CRLF, or every line stair-steps', async () => {
  // A terminal needs CRLF; a child writes LF.
  const w = world();

  const out = await run(w, { commandLine: `${NODE} -e "console.log('one')"`, secrets: [] });

  assert.ok(!/(?<!\r)\n/.test(out), `a bare LF reached the terminal: ${JSON.stringify(out)}`);
});

test('typing is echoed, because a pipe does not echo it back', async () => {
  // Without this a person answering a prompt sees nothing at all as they type.
  const w = world();
  w.mod.runInMaskedTerminal({
    name: 'test',
    commandLine: `${NODE} -e "setTimeout(() => process.exit(0), 300)"`,
    env: {},
    secrets: [],
    banner: '[masked]',
  });
  w.pty().open();

  w.pty().handleInput('y');
  w.pty().handleInput('\r');

  assert.match(w.written(), /y\r\n/, w.written());
  w.pty().close();
  await closed(w);
});

test('a keystroke arriving after the child exited does not take the extension host down', async () => {
  // The real race: `write()` after a stream has ended emits ERR_STREAM_WRITE_AFTER_END, and
  // with nothing listening Node throws it — which in an extension host is not a dropped
  // keystroke but "Extension host terminated unexpectedly".
  const w = world();
  await run(w, { commandLine: `${NODE} -e "process.exit(0)"`, secrets: [] });

  assert.doesNotThrow(() => w.pty().handleInput('late'));
  assert.doesNotThrow(() => w.pty().close());
});

test('the terminal is shown, not left to be found in the panel list', () => {
  const w = world();

  w.mod.runInMaskedTerminal({ name: 'test', commandLine: 'echo hi', env: {}, secrets: [], banner: 'b' });

  assert.equal(w.shown, 1);
});

// ---- argv mode: Run with Secrets over SSH (E3.S1, M1-M14) ----------------------------------------------------------------
//
// The tests below spawn REAL children by argv with no shell. POSIX only (`/bin/sh`): on win32 each real-child test is skipped
// with a printed reason (M12 and M14 are not real-child tests and run everywhere). Every one is bounded (`{ timeout: 15_000 }`
// and `closedWithin`, never `closed`): a test that goes RED fails in seconds on its own message and leaves no process behind.

const POSIX_ONLY = process.platform === 'win32' ? 'argv-mode children are spawned through /bin/sh here: POSIX only' : false;
const REAL_CHILD = { skip: POSIX_ONLY, timeout: 15_000 };

/**
 * Wait for the child to close; at `ms` close the terminal (which is `killChild(child, { tree: true })`), wait for the exit it
 * causes, and fail with its own message. So a stalled child costs seconds, and nothing is left running.
 */
function closedWithin(w: World, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const state: { killedAt: number | undefined } = { killedAt: undefined };
    const poll = setInterval(() => {
      const verdict = checked(w, state, started + ms);
      if (verdict === 'waiting') {
        return;
      }
      clearInterval(poll);
      return verdict === 'closed' ? resolve() : reject(new Error(`child never closed within ${ms} ms; killed; output so far: ${w.written()}`));
    }, 10);
  });
}

function checked(w: World, state: { killedAt: number | undefined }, deadline: number): 'waiting' | 'closed' | 'gave up' {
  const now = Date.now();
  if (state.killedAt !== undefined) {
    return afterKill(w, state.killedAt, now);
  }
  if (w.exitCode() !== undefined) {
    return 'closed';
  }
  if (now > deadline) {
    state.killedAt = now;
    closeIfOpen(w);
  }
  return 'waiting';
}

/** After the kill: its exit has come, or the grace period and a second have passed. Either way the test has failed on its own message. */
function afterKill(w: World, killedAt: number, now: number): 'waiting' | 'gave up' {
  return w.exitCode() !== undefined || now - killedAt > KILL_GRACE_MS + 1_000 ? 'gave up' : 'waiting';
}

function closeIfOpen(w: World): void {
  const pty = w.pty();
  if (pty !== undefined) {
    pty.close();
  }
}

async function waitFor(what: string, ok: () => boolean, ms: number): Promise<void> {
  const started = Date.now();
  while (!ok()) {
    if (Date.now() - started > ms) {
      throw new Error(`${what} did not happen within ${ms} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

interface ArgvRun {
  argv: readonly [string, ...string[]];
  /** An owned folder unless a test gives one. */
  cwd?: string;
  env?: Record<string, string>;
  withoutEnv?: EnvDrop;
  stdinText?: string;
  secrets?: readonly (string | { value: string; label: string })[];
  onEnded?: () => void;
}

/** `run()` for argv mode: the same terminal, opened at once; it does NOT wait (each test waits with `closedWithin`). */
function runArgv(t: TestContext, w: World, options: ArgvRun): void {
  w.mod.runInMaskedTerminal({
    name: 'test',
    argv: options.argv,
    cwd: options.cwd ?? ownedDir(t, 'cwd'),
    env: options.env ?? {},
    withoutEnv: options.withoutEnv,
    stdinText: options.stdinText,
    secrets: options.secrets ?? [],
    banner: '[masked]',
    onEnded: options.onEnded,
  });
  w.pty().open();
}

/** A counter for `onEnded`: "exactly once" is counted, never read through an idempotent cleanup. */
function counter(): { count: () => number; ended: () => void } {
  let n = 0;
  return { count: () => n, ended: () => void (n += 1) };
}

test('argv_mode_runs_no_shell', REAL_CHILD, async (t) => {
  const w = world();
  runArgv(t, w, { argv: ['/bin/echo', '$HOME;id'] });
  await closedWithin(w, 3_000);
  assert.ok(w.written().includes('$HOME;id'), `the argument arrives literally, no shell parsed it: ${w.written()}`);
});

test('stdin_text_is_written_once_then_closed', REAL_CHILD, async (t) => {
  const w = world();
  runArgv(t, w, { argv: ['/bin/sh', '-c', 'cat; echo END'], stdinText: 'hello-from-stdin\n' });
  await closedWithin(w, 3_000);
  const out = w.written();
  assert.ok(out.indexOf('hello-from-stdin') >= 0 && out.indexOf('hello-from-stdin') < out.indexOf('END'), `the script reached the child, then cat ended: ${out}`);
  assert.match(out, /\[exit 0\]/, 'cat ended, so stdin was closed');
});

test('keystrokes_are_not_forwarded_when_stdin_is_a_script', REAL_CHILD, async (t) => {
  const w = world();
  runArgv(t, w, { argv: ['/bin/sh', '-c', 'sleep 1; cat; echo END'], stdinText: 'script\n' });
  w.pty().handleInput('typed\r');
  await closedWithin(w, 4_000);
  assert.ok(!w.written().includes('typed'), `stdin is the script and closed: no echo, no write: ${w.written()}`);
});

test('on_ended_is_called_once_when_the_child_exits', REAL_CHILD, async (t) => {
  const w = world();
  const ended = counter();
  runArgv(t, w, { argv: ['/bin/true'], onEnded: ended.ended });
  await closedWithin(w, 3_000);
  assert.equal(ended.count(), 1);
});

test('on_ended_is_called_once_when_the_program_does_not_exist', REAL_CHILD, async (t) => {
  const w = world();
  const ended = counter();
  runArgv(t, w, { argv: ['/nonexistent/ssh-xyz'], onEnded: ended.ended });
  await closedWithin(w, 3_000);
  await new Promise((resolve) => setTimeout(resolve, 200)); // a later `close` after the `error` must not count again
  assert.match(w.written(), /Could not start|ENOENT/, w.written());
  assert.equal(ended.count(), 1);
});

test('on_ended_is_called_once_when_the_terminal_closes_before_the_child_starts', (t) => {
  const w = world();
  const ended = counter();
  w.mod.runInMaskedTerminal({ name: 'test', argv: ['/bin/true'], cwd: ownedDir(t, 'cwd'), env: {}, secrets: [], banner: '[masked]', onEnded: ended.ended });
  w.pty().close();
  assert.equal(ended.count(), 1);
});

test('a_run_closed_before_it_started_never_spawns_or_writes', (t) => {
  const w = world({ mocks: spawnSpy });
  const ended = counter();
  w.mod.runInMaskedTerminal({ name: 'test', argv: ['/bin/true'], cwd: ownedDir(t, 'cwd'), env: {}, secrets: [], banner: '[masked]', onEnded: ended.ended });
  w.pty().close();
  w.pty().open(); // VS Code should not, and the code must not care
  assert.deepEqual(w.children, []);
  assert.equal(ended.count(), 1);
  assert.ok(!w.written().includes('Could not start'), w.written());
});

test('on_ended_is_called_once_when_the_start_throws', REAL_CHILD, async (t) => {
  // A NUL byte in the program makes spawn throw at once (ERR_INVALID_ARG_VALUE): the failed-start exit of E3-D7.
  const w = world();
  const ended = counter();
  runArgv(t, w, { argv: ['bad\0program'], onEnded: ended.ended });
  await closedWithin(w, 3_000);
  assert.match(w.written(), /Could not start/, w.written());
  assert.equal(ended.count(), 1);
});

test('the_env_of_argv_mode_reaches_the_child', REAL_CHILD, async (t) => {
  const w = world();
  runArgv(t, w, { argv: ['/bin/sh', '-c', 'printf %s "$ASKPASS_PROBE"'], env: { ASKPASS_PROBE: 'probe-value-1234' } });
  await closedWithin(w, 3_000);
  assert.ok(w.written().includes('probe-value-1234'), w.written());
});

// ---- the end to end run through a recording fake ssh (M8, M11) -----------------------------------------------------------

const S1 = sshNode('s1');
const LINKED: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'printenv', commandArgs: [{ value: 'creds://me/alert/password' }], sshEntityId: 's1' };

/** The argv `secretsLaunch` gives for the fake road's first ready (a key session, or a password one). */
async function launchArgv(password: boolean): Promise<readonly string[]> {
  const road = fakeRoad(() => (password ? { password: true } : {}), (id) => (id === 's1' ? S1 : undefined));
  await road.prepare('a1', S1.details as EntityMetadata);
  const plan = planLaunch(LINKED, sshLinkOf(LINKED, (id) => (id === 's1' ? S1 : undefined)), { stayOpen: false });
  assert.equal(plan.kind, 'remote');
  const launch = secretsLaunch(plan as RemotePlan, road.readies[0], false, NONCE);
  assert.equal(launch.kind, 'spawn');
  return launch.kind === 'spawn' ? launch.argv : [];
}

function nulSplit(file: string): string[] {
  return fs.readFileSync(file, 'utf8').split('\0').filter((entry) => entry.length > 0);
}

/** Every PID the fake and the remote shell recorded must be gone; a live one is killed and named. */
function assertNoProcessLeft(dir: string): void {
  const left: number[] = [];
  const recorded = path.join(dir, 'pids');
  for (const pid of fs.existsSync(recorded) ? fs.readFileSync(recorded, 'utf8').split('\n').filter((line) => line.length > 0).map(Number) : []) {
    try {
      process.kill(pid, 0);
      left.push(pid);
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH');
    }
  }
  assert.deepEqual(left, [], `fake ssh process ${left.join(', ')} was left running`);
}

const SECOND = 'second-secret-value-42';

test('end_to_end_values_echoed_to_stdout_and_stderr_are_masked', REAL_CHILD, async (t) => {
  const dir = ownedDir(t, 'ssh');
  const fake = writeFakeSsh(dir);
  const first = `it's $HOME "quoted" value`;
  const argv = await launchArgv(false);
  const script = secretsStdin(
    { CREDS_REF_1: first, CREDS_REF_2: SECOND },
    `echo $$ >> '${dir}/pids'; printf "%s\\n" "$CREDS_REF_1"; printf "%s\\n" "$CREDS_REF_2" >&2`,
    NONCE,
  );
  const w = world();
  try {
    runArgv(t, w, {
      argv: [fake, ...argv],
      stdinText: script,
      secrets: [
        { value: first, label: 'CREDS_REF_1' },
        { value: SECOND, label: 'CREDS_REF_2' },
      ],
    });
    await closedWithin(w, 5_000);
    const out = w.written();
    assert.ok(out.includes('<CREDS_MASKED:CREDS_REF_1>') && out.includes('<CREDS_MASKED:CREDS_REF_2>'), out);
    assert.ok(!out.includes(first) && !out.includes(SECOND), `a raw value reached the screen: ${out}`);
    assert.match(out, /\[exit 0\]/);
    const recordedArgv = nulSplit(path.join(dir, 'argv'));
    assert.deepEqual(recordedArgv, [...argv], 'the fake ssh recorded the argv the road built');
    for (const value of [first, SECOND]) {
      assert.ok(!recordedArgv.some((element) => element.includes(value)), 'no value in argv');
      assert.ok(!nulSplit(path.join(dir, 'env')).some((entry) => entry.includes(value)), 'no value in the ssh environment');
    }
    assert.equal(fs.readFileSync(path.join(dir, 'pids'), 'utf8').split('\n').filter((line) => line.length > 0).length, 2, 'the fake and the remote shell recorded themselves');
  } finally {
    assertNoProcessLeft(dir);
  }
});

test('the_ssh_childs_environment_holds_no_secret_value', REAL_CHILD, async (t) => {
  const dir = ownedDir(t, 'ssh');
  const fake = writeFakeSsh(dir);
  const values = { CREDS_REF_1: 'first-secret-value-0001', CREDS_REF_2: SECOND };
  const askpass = { SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'ssh-entry-password-77' };
  const w = world();
  try {
    runArgv(t, w, {
      argv: [fake, ...(await launchArgv(true))],
      env: askpass,
      stdinText: secretsStdin(values, `echo $$ >> '${dir}/pids'; true`, NONCE),
      secrets: [
        { value: values.CREDS_REF_1, label: 'CREDS_REF_1' },
        { value: values.CREDS_REF_2, label: 'CREDS_REF_2' },
      ],
    });
    await closedWithin(w, 5_000);
    const recorded = nulSplit(path.join(dir, 'env'));
    assert.ok(recorded.includes('SSH_ASKPASS_REQUIRE=force'), 'the positive control: the recording works');
    assert.ok(recorded.includes('CREDS_SSH_PASSWORD=ssh-entry-password-77'), "the SSH entry's own password IS there: the accepted limit (E3-D8), asserted, not hidden");
    for (const entry of recorded) {
      assert.ok(!entry.startsWith('CREDS_REF_'), `no reference variable: ${entry}`);
      assert.ok(!Object.values(values).some((value) => entry.includes(value)), `no resolved value in the environment: ${entry}`);
    }
  } finally {
    assertNoProcessLeft(dir);
  }
});

// ---- the whole child environment of E3's two roads (F6 (2); parent D17 (a)) -------------------------------------------------

const RESOLVED = 'correct-horse-battery-staple';
const ASKPASS = { SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'ssh-entry-password-77' };

/** `env`'s own bookkeeping: a started `/bin/sh` re-derives these, so a changed one is the shell's, not the run's. */
const SHELL_OWN = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

/** One run of the recording fake ssh with the host's agent socket and a CREDS_REF_ name seeded; answers what its `env -0` recorded. */
async function recordedEnv(t: TestContext, password: boolean, env: Record<string, string>): Promise<string[]> {
  const dir = ownedDir(t, 'ssh');
  const fake = writeFakeSsh(dir);
  const w = world();
  try {
    runArgv(t, w, {
      argv: [fake, ...(await launchArgv(password))],
      env,
      withoutEnv: E3_INHERITED_DROP,
      stdinText: secretsStdin({ CREDS_REF_1: RESOLVED }, `echo $$ >> '${dir}/pids'; true`, NONCE),
      secrets: [{ value: RESOLVED, label: 'CREDS_REF_1' }],
    });
    await closedWithin(w, 5_000);
    return nulSplit(path.join(dir, 'env'));
  } finally {
    assertNoProcessLeft(dir);
  }
}

/** The keys whose value differs from `process.env` — added or changed — in what the child recorded. */
function changedKeys(recorded: readonly string[]): string[] {
  const pairs = recorded.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]);
  return pairs.filter(([key, value]) => process.env[key] !== value && !SHELL_OWN.has(key)).map(([key]) => key).sort();
}

test('the_hosts_agent_socket_does_not_reach_the_ssh_of_e3s_two_roads', REAL_CHILD, async (t) => {
  const seeded = { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK, CREDS_REF_7: process.env.CREDS_REF_7 };
  Object.assign(process.env, { SSH_AUTH_SOCK: HOST_SOCKET, CREDS_REF_7: 'seeded' });
  try {
    const password = await recordedEnv(t, true, ASKPASS);
    assert.ok(password.some((entry) => entry.startsWith('PATH=')), 'the positive control: ordinary variables are inherited');
    assert.ok(!password.some((entry) => entry.startsWith('SSH_AUTH_SOCK=')), `the host's socket is gone: ${password.filter((e) => e.includes('SSH_AUTH_SOCK')).join(' ')}`);
    assert.deepEqual(password.filter((entry) => entry.toUpperCase().startsWith('CREDS_REF_')), [], 'no CREDS_REF_ name, in any letter case');
    assert.ok(!password.some((entry) => entry.includes(RESOLVED)), 'no resolved value in any value');
    assert.deepEqual(changedKeys(password), Object.keys(ASKPASS).sort(), 'what the run added or changed is exactly the askpass variables');

    const ours = await recordedEnv(t, false, { SSH_AUTH_SOCK: OUR_SOCKET });
    assert.deepEqual(changedKeys(ours), ['SSH_AUTH_SOCK'], 'with our agent: only its socket');
    assert.deepEqual(ours.filter((entry) => entry.startsWith('SSH_AUTH_SOCK=')), ['SSH_AUTH_SOCK=' + OUR_SOCKET], 'ours, exactly once');
    assert.ok(!ours.some((entry) => entry.includes(HOST_SOCKET)), 'and the host socket stands nowhere');

    assert.deepEqual(changedKeys(await recordedEnv(t, false, {})), [], 'a key session with no env adds and changes nothing');
  } finally {
    for (const [name, value] of Object.entries(seeded)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

// ---- the bounded run (M9, M10, M10b) -----------------------------------------------------------------------------------------

test('closing_the_terminal_kills_a_stalled_child_and_drops_the_unwritten_script', REAL_CHILD, async (t) => {
  const w = world({ mocks: (world) => ({ ...spawnSpy(world), ...killSpy(world) }) });
  const ended = counter();
  runArgv(t, w, {
    argv: ['/bin/sh', '-c', "echo PID=$$; trap '' TERM; exec sleep 300"],
    stdinText: 'x'.repeat(4 * 1024 * 1024), // more than a pipe takes; sleep never reads
    onEnded: ended.ended,
  });
  await waitFor('the child telling its PID', () => /PID=\d+/.test(w.written()), 3_000);
  const pid = Number(/PID=(\d+)/.exec(w.written())?.[1]);
  w.pty().close();
  await closedWithin(w, KILL_GRACE_MS + 3_000);
  assert.ok(w.written().trimEnd().endsWith('[exit killed]'), w.written());
  assert.equal(ended.count(), 1);
  assert.deepEqual(w.kills, [{ tree: true }]);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(w.children[0].stdin?.destroyed, true, 'the unwritten script (the values) is dropped with the run, never written later');
});

test('an_error_event_ends_the_run_at_once_and_drops_the_unwritten_script', REAL_CHILD, async (t) => {
  // The one exit where the child may still be ALIVE when the run ends: its 'error' event (a failed kill, a failed message). The
  // end destroys stdin, so the script (the values) is not written to a child that nobody watches any more.
  const w = world({ mocks: spawnSpy });
  const ended = counter();
  runArgv(t, w, { argv: ['/bin/sh', '-c', 'echo PID=$$; exec sleep 300'], stdinText: 'x'.repeat(4 * 1024 * 1024), onEnded: ended.ended });
  try {
    await waitFor('the child telling its PID', () => /PID=\d+/.test(w.written()), 3_000);
    assert.equal(w.children[0].stdin?.destroyed, false, 'before the end the script is still being written');
    w.children[0].emit('error', new Error('boom'));
    assert.equal(ended.count(), 1);
    assert.equal(w.children[0].stdin?.destroyed, true, 'the end destroyed stdin while the child is still running');
  } finally {
    // The error event already ended the run (and told VS Code), so a close would not wait for the child: kill it here.
    w.children[0].kill('SIGKILL');
    await waitFor('the killed child closing', () => w.children[0].exitCode !== null || w.children[0].signalCode !== null, 3_000);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(ended.count(), 1, 'the later close does not count again');
});

test('a_terminal_that_cannot_be_created_throws_and_never_spawns', (t) => {
  // GREEN before and after: a guard that pins E3-D7's "a throw from createTerminal is the caller's to clean".
  const w = world({ createThrows: true, mocks: spawnSpy });
  const ended = counter();
  assert.throws(
    () => w.mod.runInMaskedTerminal({ name: 'test', argv: ['/bin/true'], cwd: ownedDir(t, 'cwd'), env: {}, secrets: [], banner: '[masked]', onEnded: ended.ended }),
    /no terminal/,
  );
  assert.equal(ended.count(), 0);
  assert.deepEqual(w.children, []);
});

test('a_show_that_throws_ends_the_run_and_a_later_open_spawns_nothing', (t) => {
  const w = world({ showThrows: true, mocks: spawnSpy });
  const ended = counter();
  assert.throws(
    () => w.mod.runInMaskedTerminal({ name: 'test', argv: ['/bin/echo', 'x'], cwd: ownedDir(t, 'cwd'), env: {}, secrets: [], banner: '[masked]', onEnded: ended.ended }),
    /no show/,
  );
  assert.equal(ended.count(), 1);
  assert.equal(w.disposed, 1);
  w.pty().open();
  assert.deepEqual(w.children, []);
  assert.equal(w.written(), '');
  assert.equal(ended.count(), 1);
});

// ---- the program's own folder (M12, M13) -------------------------------------------------------------------------------------

test('launch_of_argv_mode_takes_its_own_folder_never_the_workspace', () => {
  const w = world({ workspaceDir: '/work/repo' });
  const storage = 'C:/Users/me/AppData/Roaming/Code/User/globalStorage/x';
  assert.deepEqual(
    w.mod.launchOf({ name: 't', argv: ['C:/Windows/System32/OpenSSH/ssh.exe', '-o', 'BatchMode=yes'], cwd: storage, env: {}, secrets: [], banner: '' }),
    { program: 'C:/Windows/System32/OpenSSH/ssh.exe', args: ['-o', 'BatchMode=yes'], shell: false, cwd: storage },
  );
  assert.equal(w.mod.launchOf({ name: 't', commandLine: 'echo hi', env: {}, secrets: [], banner: '' }).cwd, '/work/repo', 'the shell variant is unchanged');
});

test('an_argv_run_starts_in_its_own_folder', REAL_CHILD, async (t) => {
  const workspace = ownedDir(t, 'workspace');
  const own = ownedDir(t, 'own');
  const w = world({ workspaceDir: workspace });
  runArgv(t, w, { argv: ['/bin/sh', '-c', 'pwd'], cwd: own });
  await closedWithin(w, 3_000);
  assert.ok(w.written().includes(fs.realpathSync(own)), w.written());
  assert.ok(!w.written().includes(fs.realpathSync(workspace)), 'never the workspace folder');
});
