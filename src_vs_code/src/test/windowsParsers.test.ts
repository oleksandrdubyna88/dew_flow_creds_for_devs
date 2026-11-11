import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { killChild } from '../childKill';
import { quoteFor } from '../hostShell';
import { resolveJumpChain } from '../sshOptions';
import { askpassScript } from '../sshAskpass';
import { loginShellCommand, stayOpenWrapper } from '../remoteLaunch';
import { SshCommandOptions, buildSshCommand } from '../sshCommand';
import { CORPUS } from './remoteCorpus';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * The Windows quoting fix, OBSERVED on the parsers it is written for (PLAN_windows_shell_quoting_injection §4).
 *
 * <p>`hostShell.test.ts`, `sshCommand.test.ts` and `sshAskpass.test.ts` assert the STRINGS the fix produces. A string
 * is only a claim about what cmd.exe or PowerShell will do with it, and a measure nobody has seen work is a comment
 * (security.md). Here the strings are handed to the real parsers, with a hostile value carrying a marker side effect,
 * and two things are asserted: the parser read back exactly the raw value, and the side effect did not happen.</p>
 *
 * <p>OFF Windows a case skips, with its reason printed, when its shell is not on this machine: on Linux and macOS cmd.exe
 * and Windows PowerShell exist only through WSL interop (a different machine's filesystem, so they are not used) and
 * `pwsh` is used when installed. ON Windows nothing skips: a missing or failing `cmd.exe`, `powershell.exe` or `pwsh.exe`
 * FAILS (a green run that observed nothing is the failure this file exists to prevent), and it runs in the
 * `runner-windows` job of `ci-extension.yml`. It reads nothing from the vault and writes only into owned folders.</p>
 *
 * <p><b>How PowerShell receives the line.</b> `-EncodedCommand` (UTF-16LE base64), not `-Command <text>`: with
 * `-Command` the text passes through the Windows command-line parser first, which treats `"` and trailing backslashes
 * its own way and differently in 5.1 and 7 — a second quoting layer between the word and the parser under test. The
 * encoded form delivers the bytes untouched, so what is measured is PowerShell's reading of the word and nothing in
 * between. The result comes back as the hex of every UTF-16 code unit: the console code page of a CI runner is not
 * UTF-8, and a typographic quote written as `?` would hide the very difference this file is about.</p>
 */

const ON_WINDOWS = process.platform === 'win32';

/** What one bounded child did. `status` is `null` when it was killed, never started, or did not end in time. */
interface Ran {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly timedOut: boolean;
  readonly pid: number | undefined;
}

/**
 * Every child this file starts goes through here: a timeout kills the WHOLE process tree, not just the child it started
 * (`common/reliability.md` § "A timed-out child process is a killed child process"). `cmd.exe`, `powershell.exe` and
 * `pwsh` each start further processes, and a bare `spawnSync` timeout ends only the first one, leaving the rest holding
 * handles on a CI runner. On Windows `killChild` runs `taskkill /T /F`; elsewhere the child is its own process group
 * leader (`detached`) and the group gets SIGKILL. A program that does not exist is a `null` status with the reason in
 * `stderr`, as `spawnSync` returned it.
 */
function spawnBounded(program: string, args: readonly string[], options: { readonly timeoutMs: number; readonly env?: NodeJS.ProcessEnv }): Promise<Ran> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let timedOut = false;
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(program, args, { env: options.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !ON_WINDOWS });
    } catch (error) {
      resolve({ stdout: '', stderr: String(error), status: null, timedOut: false, pid: undefined });
      return;
    }
    const finish = (status: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: out, stderr: timedOut ? `${err}\n(timed out after ${options.timeoutMs} ms)` : err, status, timedOut, pid: child.pid });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTreeOf(child);
      // The pipes close once the tree is gone; this only stops a stuck one from holding the test forever.
      setTimeout(() => finish(null), 10_000).unref();
    }, options.timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', (error) => {
      err += String(error);
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** End `child` and everything it started. */
function killTreeOf(child: ReturnType<typeof spawn>): void {
  killChild(child, { tree: true });
  if (!ON_WINDOWS && child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // The group is already gone.
    }
  }
}

/** Whether `program` starts and runs a trivial command — the probe a case's skip reason hangs on. */
async function runs(program: string, args: string[]): Promise<boolean> {
  return (await spawnBounded(program, args, { timeoutMs: 30_000 })).status === 0;
}

const PS_PROBE = ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'];

interface PowerShellUnderTest {
  readonly name: string;
  readonly program: string;
  /** Why this one is skipped, or `false` when it runs. Always `false` on Windows: there a missing shell is a failure. */
  readonly skip: () => Promise<string | false>;
}

/** The probe of `pwsh` off Windows runs once, on the first case that asks. */
let pwshProbe: Promise<boolean> | undefined;

const POWERSHELLS: readonly PowerShellUnderTest[] = [
  {
    name: 'Windows PowerShell 5.1',
    program: 'powershell.exe',
    skip: async () =>
      ON_WINDOWS
        ? false
        : 'skipped: Windows PowerShell 5.1 is used only on Windows (off Windows a powershell.exe is a WSL interop stub on another filesystem)',
  },
  {
    name: 'PowerShell 7 (pwsh)',
    program: ON_WINDOWS ? 'pwsh.exe' : 'pwsh',
    skip: async () => {
      if (ON_WINDOWS) {
        return false;
      }
      pwshProbe ??= runs('pwsh', PS_PROBE);
      return (await pwshProbe) ? false : 'skipped: pwsh is not installed on this machine (it is required on Windows)';
    },
  },
];

/** A case body that skips itself, with the reason printed, when its shell is not on this machine. */
function shellCase(shell: PowerShellUnderTest, body: () => Promise<void> | void): (t: { skip: (reason: string) => void }) => Promise<void> {
  return async (t) => {
    const why = await shell.skip();
    if (why !== false) {
      t.skip(why);
      return;
    }
    await body();
  };
}

// ---- the launcher itself: a timeout ends the whole tree --------------------------------------------------------------

/** Whether a process is still alive. A zombie counts as alive here, so the caller polls: the reaper clears it within moments. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Clean up after a failed run: nothing this test started may outlive it. */
function killIfAlive(...pids: (number | undefined)[]): void {
  for (const pid of pids) {
    if (pid !== undefined && alive(pid)) {
      process.kill(pid, 'SIGKILL');
    }
  }
}

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i += 1) {
    if (!alive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

test('spawnBounded: a timeout kills the child AND the process it started, and says it timed out', async () => {
  // The child starts a grandchild that shares its pipes (as `cmd.exe` starts `ssh`), prints the grandchild's pid, and waits.
  const sleeper = 'setTimeout(() => {}, 30000)';
  const parent = `const g = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(sleeper)}], { stdio: 'inherit' }); console.log(g.pid); ${sleeper}`;
  const ran = await spawnBounded(process.execPath, ['-e', parent], { timeoutMs: 3_000 });
  assert.equal(ran.timedOut, true);
  // POSIX: killed by a signal, so no exit code. Windows: `taskkill /T /F` ends the process with exit code 1 (seen on windows-latest).
  assert.equal(ran.status, process.platform === 'win32' ? 1 : null);
  const grandchild = Number.parseInt(ran.stdout.trim(), 10);
  assert.ok(Number.isInteger(grandchild) && ran.pid !== undefined, `the child printed no pid: ${JSON.stringify(ran.stdout)}`);
  try {
    assert.equal(await gone(ran.pid as number), true, 'the child outlived its timeout');
    assert.equal(await gone(grandchild), true, 'the process the child started outlived the timeout (a bare kill leaves it behind)');
  } finally {
    killIfAlive(ran.pid, grandchild);
  }
});

test('spawnBounded: a child that ends in time is read as it ended, and a program that does not exist is a null status', async () => {
  const ok = await spawnBounded(process.execPath, ['-e', "process.stdout.write('hi'); process.stderr.write('warn'); process.exit(3)"], { timeoutMs: 20_000 });
  assert.deepEqual([ok.stdout, ok.stderr, ok.status, ok.timedOut], ['hi', 'warn', 3, false]);
  const missing = await spawnBounded('creds-no-such-program-7f3a', [], { timeoutMs: 20_000 });
  assert.equal(missing.status, null);
  assert.equal(missing.timedOut, false);
  assert.match(missing.stderr, /ENOENT/);
});

// ---- (a) a REAL cmd.exe running the askpass .bat ---------------------------------------------------------------------

const CMD_PASSWORDS = [
  'a&echo PWNED&b',
  'p"q%PATH%^r!s',
  '!calc!',
  '^!x^!',
  '<x>|y',
  ' lead and trail ',
  '100%',
  'x!y!z',
] as const;

test(
  'a REAL cmd.exe prints a password full of cmd syntax unchanged and runs none of it',
  { skip: ON_WINDOWS ? false : 'skipped: cmd.exe is the parser under test and exists here only on Windows' },
  async () => {
    // The file exactly as production writes it (`writeAskpassScriptFile`, the same bytes the connect path hands to ssh),
    // with no line-end fix-up here: a test that repaired the file would test a file nobody ships.
    const installer = loadWithVscode<typeof import('../keyInstaller')>('../keyInstaller', {});
    const script = installer.writeAskpassScriptFile(ownedDir(scope, 'askpassStore'), 'win32');
    assert.equal(path.basename(script), askpassScript('win32').name);
    assert.equal(fs.readFileSync(script, 'utf8'), askpassScript('win32').content, 'the file is the script, byte for byte');
    for (const password of CMD_PASSWORDS) {
      const run = await spawnBounded('cmd.exe', ['/d', '/c', script], {
        env: { ...process.env, CREDS_SSH_PASSWORD: password },
        timeoutMs: 20_000,
      });
      assert.equal(run.stdout, `${password}\r\n`, JSON.stringify(password));
      assert.equal(run.stdout.split(/\r?\n/).includes('PWNED'), false, `${JSON.stringify(password)} ran its echo`);
    }
  },
);

// ---- (b) REAL PowerShell 5.1 and 7 reading the words the fix produces ------------------------------------------------

/** A function that prints every argument it receives as hex UTF-16 code units, arguments joined with `|`. */
const SHOW_FUNCTION =
  "function credsShow { [Console]::Out.Write((($args | ForEach-Object { -join ($_.ToCharArray() | ForEach-Object { '{0:x4}' -f [int]$_ }) }) -join '|')) }";

function encodedCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function hexOf(value: string): string {
  return Array.from({ length: value.length }, (_, i) => value.charCodeAt(i).toString(16).padStart(4, '0')).join('');
}

function unhex(hex: string): string {
  return (hex.match(/.{4}/g) ?? []).map((unit) => String.fromCharCode(parseInt(unit, 16))).join('');
}

/** What the shell read for each argument: the output of `credsShow`, back as text. */
function argumentsRead(output: string): string[] {
  return output === '' ? [] : output.split('|').map(unhex);
}

async function runPowerShell(shell: PowerShellUnderTest, script: string): Promise<Ran> {
  return spawnBounded(shell.program, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand(script)], { timeoutMs: 60_000 });
}

/** The injected command every hostile value carries: it creates `marker`, so a file there proves the value ran. */
function makeMarker(marker: string): string {
  return `New-Item -Path "${marker}" -ItemType File`;
}

/** Every character PowerShell reads as a quote, each wrapped around an injected command. */
const QUOTES = ["'", '\u2018', '\u2019', '\u201A', '\u201B', '"', '\u201C', '\u201D', '\u201E'] as const;

/** The values a vault entry could carry into a word, the ordinary ones first. Each hostile one creates `marker` if it runs. */
function valuesFor(marker: string): string[] {
  const make = makeMarker(marker);
  return [
    'C:\\Users\\me\\.ssh\\id',
    'C:\\Program Files\\k',
    `$(${make})`,
    '`$HOME',
    'a$HOME',
    ...QUOTES.map((q) => `x${q}; ${make}; ${q}`),
  ];
}

function assertNoMarker(dir: string, shell: PowerShellUnderTest, what: string): void {
  assert.deepEqual(fs.readdirSync(dir), [], `${shell.name}: ${what} ran the injected command (a file was created)`);
}

for (const shell of POWERSHELLS) {
  test(`${shell.name}: starts on this machine (on Windows a missing shell FAILS, it does not skip)`, shellCase(shell, async () => {
    assert.equal(await runs(shell.program, PS_PROBE), true, `${shell.program} does not start: nothing below can be observed`);
  }));

  test(`${shell.name}: the marker the hostile values would create CAN be created here (the control that keeps the cases below honest)`, shellCase(shell, async () => {
    const dir = ownedDir(scope, 'psControl');
    const marker = path.join(dir, 'control');
    const ran = await runPowerShell(shell, `${makeMarker(marker)} | Out-Null`);
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(fs.existsSync(marker), true, 'the injected command does not create its file on this machine, so "no file" would prove nothing');
  }));

  test(`${shell.name}: quoteFor('powershell') words are read back byte for byte, as an expression and as a command argument`, shellCase(shell, async () => {
    const dir = ownedDir(scope, 'psQuote');
    for (const value of valuesFor(path.join(dir, 'pwned'))) {
      const word = quoteFor('powershell', value);
      for (const [mode, line] of [['expression', `credsShow (${word})`], ['argument', `credsShow ${word}`]] as const) {
        const ran = await runPowerShell(shell, `${SHOW_FUNCTION}\n${line}`);
        assert.equal(ran.status, 0, `${mode} ${JSON.stringify(value)}: ${ran.stderr}`);
        assert.deepEqual(argumentsRead(ran.stdout), [value], `${mode} ${JSON.stringify(value)} read as something else (${hexOf(value)})`);
        assertNoMarker(dir, shell, `${mode} ${JSON.stringify(value)}`);
      }
    }
  }));

  test(`${shell.name}: the words buildSshCommand emits for win32 reach the program as the raw values`, shellCase(shell, async () => {
    const dir = ownedDir(scope, 'psSsh');
    const marker = path.join(dir, 'pwned');
    const base = { id: 'e1', name: 'prod', host: 'example.com', user: 'deploy', isSshEnabled: true };
    // `credsShow` stands in for ssh: the line is the one a terminal gets, only the program word differs.
    const lineOf = (over: Partial<EntityMetadata>, options: SshCommandOptions = {}): string => {
      const line = buildSshCommand({ ...base, ...over }, 'win32', { program: 'credsShow', ...options });
      assert.notEqual(line, undefined, JSON.stringify(over));
      return line as string;
    };
    const read = async (line: string): Promise<string[]> => {
      const ran = await runPowerShell(shell, `${SHOW_FUNCTION}\n${line}`);
      assert.equal(ran.status, 0, `${line}\n${ran.stderr}`);
      return argumentsRead(ran.stdout);
    };

    // A key path: the ordinary ones, a space, and every hostile one.
    for (const key of valuesFor(marker)) {
      assert.deepEqual(await read(lineOf({ sshKeyPath: key })), ['-i', key, 'deploy@example.com'], `key path ${JSON.stringify(key)}`);
      assertNoMarker(dir, shell, `key path ${JSON.stringify(key)}`);
    }
    // A user holding `$` (the destination), and the same inside a jump value.
    assert.deepEqual(await read(lineOf({ user: 'a$HOME' })), ['a$HOME@example.com']);
    assert.deepEqual(await read(lineOf({}, { jump: 'a$HOME@bastion:2200' })), ['-J', 'a$HOME@bastion:2200', 'deploy@example.com']);
    assert.deepEqual(await read(lineOf({}, { jump: 'j@b:2200' })), ['-J', 'j@b:2200', 'deploy@example.com']);
    // A TWO-hop chain: `joinHops` writes `a@b,c@d`, and a bare comma is a PowerShell ARRAY in argument mode, so the chain used
    // to arrive as `-J a@b c@d` with the second hop as the destination. Built through the walk that produces it.
    const hop = (id: string, user: string, host: string, next?: string): EntityMetadata => ({ ...base, id, name: id, user, host, jumpHostEntityId: next });
    const byId = new Map([hop('h1', 'c', 'd', 'h2'), hop('h2', 'a', 'b')].map((e) => [e.id, e]));
    const chain = resolveJumpChain({ ...base, jumpHostEntityId: 'h1' }, (id) => byId.get(id));
    assert.deepEqual(chain, { ok: true, value: 'a@b,c@d' });
    assert.deepEqual(await read(lineOf({}, { jump: (chain as { value: string }).value })), ['-J', 'a@b,c@d', 'deploy@example.com']);
    // The pinned known_hosts file, ordinary and holding a `$`.
    for (const file of ['C:\\Users\\me\\known_hosts', 'C:\\Users\\me\\a$b\\known_hosts', 'C:\\Program Files\\kh']) {
      assert.deepEqual(
        await read(lineOf({}, { knownHostsFile: file })),
        ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, 'deploy@example.com'],
        `known_hosts ${JSON.stringify(file)}`,
      );
    }
    assertNoMarker(dir, shell, 'the destination, jump and known_hosts cases');
  }));

  // The remote word of a terminal road (PLAN_ssh_line_runs_in_login_shell.md): the login form of every element of the corpus, bare and
  // stay-open, reaches `credsShow` (a PowerShell function that stands for the ssh program) as the ONE raw word. Windows' own re-quoting of an argument under 5.1 is a hand check.
  test(`${shell.name}: the remote word of the login form reaches the PowerShell function that stands for ssh as the raw command`, shellCase(shell, async () => {
    const base = { id: 'e1', name: 'prod', host: 'example.com', user: 'deploy', isSshEnabled: true };
    for (const element of CORPUS) {
      for (const command of [element, loginShellCommand(element), loginShellCommand(stayOpenWrapper(element))]) {
        const line = buildSshCommand(base, 'win32', { program: 'credsShow', remote: { command, tty: true } });
        assert.notEqual(line, undefined, JSON.stringify(command));
        const ran = await runPowerShell(shell, `${SHOW_FUNCTION}\n${line as string}`);
        assert.equal(ran.status, 0, `${JSON.stringify(command)}: ${ran.stderr}`);
        const read = argumentsRead(ran.stdout);
        assert.equal(read[read.length - 1], command, `${JSON.stringify(command)} was read as ${JSON.stringify(read)}`);
      }
    }
  }));
}
