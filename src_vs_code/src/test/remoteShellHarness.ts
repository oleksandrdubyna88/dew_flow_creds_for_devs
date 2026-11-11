import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext } from 'node:test';
import { HostShell } from '../hostShell';
import { LaunchPlan, RemotePlan, planLaunch } from '../remoteLaunch';
import { buildSshCommand } from '../sshCommand';
import { EntityMetadata } from '../types';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * What the two test files that run a composed remote command through REAL shells share (`remoteLaunchDelivery.test.ts` and
 * `remoteLoginShell.test.ts`): the corpus of hostile lines, the fake `ssh`, the way sshd starts the remote shell, and the owned
 * `HOME` of every run. It holds no test, so the runner (`out/test/*.test.js`) never loads it as one.
 */

export const SHELL_TIMEOUT_MS = 20_000;

export function has(program: string, args: string[]): boolean {
  try {
    execFileSync(program, args, { stdio: 'ignore', timeout: SHELL_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** A skip reason (printed by the runner) when `shell` is not on this machine, else `false`. */
export const skipUnless = (shell: string): string | false => (has(shell, ['-c', 'true']) ? false : `no ${shell} on this machine`);

export const dirOf = (t: TestContext, what: string): string => ownedDir(t, what);

export const E: EntityMetadata = { id: 's', name: 'srv', host: 'host', user: 'deploy', port: 2222, isSshEnabled: true };

export function lineFor(command: string, platform: NodeJS.Platform): string {
  const line = buildSshCommand(E, platform, { program: 'ssh', remote: { command, tty: true } });
  assert.ok(line !== undefined, 'the builder refused the entity');
  return line;
}

/** A `ssh` that records its argv NUL-separated and calls nothing named `ssh` (so it can never resolve to itself). */
export function fakeSsh(t: TestContext): { env: NodeJS.ProcessEnv; read: () => Buffer[] } {
  const dir = dirOf(t, 'ssh');
  const out = path.join(dir, 'argv.bin');
  fs.writeFileSync(path.join(dir, 'ssh'), '#!/bin/sh\nprintf \'%s\\0\' "$@" > "$FAKE_SSH_OUT"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), FAKE_SSH_OUT: out };
  const read = (): Buffer[] => {
    const bytes = fs.readFileSync(out);
    const parts: Buffer[] = [];
    let from = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0) {
        parts.push(bytes.subarray(from, i));
        from = i + 1;
      }
    }
    return parts;
  };
  return { env, read };
}

/** Where a shell lives on THIS machine: the remote's `$SHELL` is a path, and the test must name a real one. */
export function shellPath(name: string): string | undefined {
  try {
    return execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', timeout: SHELL_TIMEOUT_MS }).trim() || undefined;
  } catch {
    return undefined;
  }
}

// ---- a remote side that is sshd's, with a HOME of its own ---------------------------------------------------------------------

/** The `tool` that only `~/bin` holds: prints what it was given and ends with `$TOOL_EXIT`. */
const TOOL = '#!/bin/sh\nprintf \'tool ran: %s\\n\' "$*"\nexit "${TOOL_EXIT:-0}"\n';

/** The line a profile adds `~/bin` with: the one thing only a LOGIN shell reads. */
export const ADD_BIN = 'PATH="$HOME/bin:$PATH"; export PATH\n';

/** One owned `HOME` for a real-shell run: `bin/tool`, `sub/`, and the startup files the test names (`.profile`, `.bashrc`, …). */
export function remoteHome(t: TestContext, files: Readonly<Record<string, string>> = {}): string {
  const home = ownedDir(t, 'home');
  fs.mkdirSync(path.join(home, 'bin'));
  fs.mkdirSync(path.join(home, 'sub'));
  fs.writeFileSync(path.join(home, 'bin', 'tool'), TOOL, { mode: 0o755 });
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(home, name), text);
  }
  return home;
}

/**
 * The environment sshd gives a command, made from nothing (`env -i`): the owned `HOME` (and `ZDOTDIR`, `TMPDIR`, `TEMP`, `TMP`), the
 * shell as `SHELL`, a short `PATH`, and `SHLVL` SET on purpose (bash reads `~/.bashrc` for a `-c` command only when it is not, and
 * one of the `SSH_*` variables is set or standard input is a socket, which Node's piped input is). `ENV`, `BASH_ENV` and the
 * `SSH_*` variables are never there; a test that needs one passes it in `extra`, and `SHLVL: undefined` removes it.
 */
export function sshdEnv(home: string, shell: string, extra: Readonly<Record<string, string | undefined>> = {}): NodeJS.ProcessEnv {
  const dirs = ['/usr/bin', '/bin', path.dirname(shell)];
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    ZDOTDIR: home,
    TMPDIR: home,
    TEMP: home,
    TMP: home,
    SHELL: shell,
    PATH: dirs.filter((d, i) => dirs.indexOf(d) === i).join(path.delimiter),
    SHLVL: '1',
  };
  for (const [name, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete env[name];
    } else {
      env[name] = value;
    }
  }
  return env;
}

export interface Remote {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
}

/** `<sshd's shell> -c <the one remote command>`, the script (or nothing) on standard input. The way sshd runs an exec request. */
export function sshdRun(shell: string, command: string, env: NodeJS.ProcessEnv, input = ''): Remote {
  const run = spawnSync(shell, ['-c', command], { env, input, cwd: env.HOME, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
  assert.equal(run.error, undefined, String(run.error));
  return { stdout: run.stdout, stderr: run.stderr, status: run.status };
}

/** The same line run by a LOGIN shell directly: what an assertion on exact output compares against (`/etc/profile` is read too). */
export function loginDirect(shell: string, line: string, env: NodeJS.ProcessEnv): Remote {
  const run = spawnSync(shell, ['-l', '-c', line], { env, input: '', cwd: env.HOME, timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' });
  assert.equal(run.error, undefined, String(run.error));
  return { stdout: run.stdout, stderr: run.stderr, status: run.status };
}

/**
 * A stand-in for the stay-open roads' final `exec ${SHELL:-sh} -l`: called with exactly `-l` it says `LOGIN-SHELL`, where it is
 * (`pwd -P`) and whether `tool` is on `PATH`; called with anything else (`-l -c '<line>'`) it runs the real `shell`.
 */
export function loginStandIn(t: TestContext, shell: string): string {
  const file = path.join(dirOf(t, 'standin'), 'standin');
  const text = [
    '#!/bin/sh',
    'if [ "$#" -eq 1 ] && [ "$1" = "-l" ]; then',
    '  printf \'LOGIN-SHELL in=%s tool=%s\\n\' "$(pwd -P)" "$(command -v tool >/dev/null && echo found || echo missing)"',
    '  exit 0',
    'fi',
    `exec '${shell}' "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(file, text, { mode: 0o755 });
  return file;
}

/**
 * An executable that behaves as ssh does for an exec request: records its own PID, its argv (NUL-separated) and its environment
 * (`env -0`), sets SHELL as sshd sets the login shell (the runner's own `$SHELL` can be fish, which does not read a POSIX
 * script), skips its options to `--` and the destination, and runs the last argument with `/bin/sh -c`, stdin inherited.
 * The remote command makes `/bin/sh -l` read a profile, so the fake gives it an OWNED `HOME` (`dir`, which holds no profile), no `ENV`,
 * `BASH_ENV` or `SSH_*`, and `SHLVL`: the developer's own `~/.profile` never runs here (PLAN_ssh_line_runs_in_login_shell.md §5).
 */
export function writeFakeSsh(dir: string): string {
  const file = path.join(dir, 'fake-ssh');
  fs.writeFileSync(
    file,
    [
      '#!/bin/sh',
      `echo $$ >> '${dir}/pids'`,
      `printf '%s\\0' "$@" > '${dir}/argv'`,
      `env -0 > '${dir}/env'`,
      'SHELL=/bin/sh',
      `HOME='${dir}'; ZDOTDIR='${dir}'; SHLVL=1`,
      'export SHELL HOME ZDOTDIR SHLVL',
      'unset ENV BASH_ENV SSH_CLIENT SSH2_CLIENT SSH_CONNECTION',
      'while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done',
      'shift',
      'shift',
      '/bin/sh -c "$1"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return file;
}

// ---- plans -----------------------------------------------------------------------------------------------------------

const LINKED = { kind: 'linked', ssh: E, sshName: 'prod' } as const;

/** The remote plan of `line` on a linked Terminal entry, as the roads get it from `planLaunch`. */
export function remotePlanOf(line: string, stayOpen: boolean): RemotePlan {
  const plan: LaunchPlan = planLaunch({ id: 't1', name: 'deploy', command: line }, LINKED, { stayOpen });
  assert.equal(plan.kind, 'remote', JSON.stringify(plan));
  return plan as RemotePlan;
}

export const POSIX_SHELL: HostShell = { shellPath: '/bin/bash', family: 'posix' };

// ---- the marker nonce of Run with Secrets ---------------------------------------------------------------------------------------

/** The run's nonce of a real-shell test, and another one: a value that holds the markers of ANOTHER run must not pass for this run's. */
export const NONCE = '0123456789abcdef0123456789abcdef';
export const OTHER_NONCE = 'fedcba9876543210fedcba9876543210';
