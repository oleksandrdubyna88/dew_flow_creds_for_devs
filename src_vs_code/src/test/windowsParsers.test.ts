import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { quoteFor } from '../hostShell';
import { askpassScript } from '../sshAskpass';
import { SshCommandOptions, buildSshCommand } from '../sshCommand';
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
 * <p>Every case skips, with its reason printed, when its shell is not on this machine. On Linux and macOS this file
 * is a no-op (cmd.exe and Windows PowerShell exist there only through WSL interop, which is a different machine's
 * filesystem, so they are not used); on `windows-latest` all three exist and the file runs in the `runner-windows`
 * job of `ci-extension.yml`. It reads nothing from the vault and writes only into owned folders.</p>
 *
 * <p><b>How PowerShell receives the line.</b> `-EncodedCommand` (UTF-16LE base64), not `-Command <text>`: with
 * `-Command` the text passes through the Windows command-line parser first, which treats `"` and trailing backslashes
 * its own way and differently in 5.1 and 7 — a second quoting layer between the word and the parser under test. The
 * encoded form delivers the bytes untouched, so what is measured is PowerShell's reading of the word and nothing in
 * between. The result comes back as the hex of every UTF-16 code unit: the console code page of a CI runner is not
 * UTF-8, and a typographic quote written as `?` would hide the very difference this file is about.</p>
 */

/** Whether `program` starts and runs a trivial command — the probe a case's skip reason hangs on. */
function runs(program: string, args: string[]): boolean {
  try {
    return spawnSync(program, args, { stdio: 'ignore', timeout: 30_000 }).status === 0;
  } catch {
    return false;
  }
}

const ON_WINDOWS = process.platform === 'win32';
const PS_PROBE = ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'];

interface PowerShellUnderTest {
  readonly name: string;
  readonly program: string;
  /** Why this one is skipped, or `false` when it runs. */
  readonly skip: string | false;
}

const POWERSHELLS: readonly PowerShellUnderTest[] = [
  {
    name: 'Windows PowerShell 5.1',
    program: 'powershell.exe',
    skip: !ON_WINDOWS
      ? 'skipped: Windows PowerShell 5.1 is used only on Windows (off Windows a powershell.exe is a WSL interop stub on another filesystem)'
      : !runs('powershell.exe', PS_PROBE)
        ? 'skipped: powershell.exe does not start on this machine'
        : false,
  },
  {
    name: 'PowerShell 7 (pwsh)',
    program: ON_WINDOWS ? 'pwsh.exe' : 'pwsh',
    skip: !runs(ON_WINDOWS ? 'pwsh.exe' : 'pwsh', PS_PROBE) ? 'skipped: pwsh is not installed on this machine' : false,
  },
];

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
  () => {
    const dir = ownedDir(scope, 'askpass');
    const script = path.join(dir, askpassScript('win32').name);
    fs.writeFileSync(script, askpassScript('win32').content.replace(/\n/g, '\r\n'));
    for (const password of CMD_PASSWORDS) {
      const run = spawnSync('cmd.exe', ['/d', '/c', script], {
        env: { ...process.env, CREDS_SSH_PASSWORD: password },
        encoding: 'utf8',
        timeout: 20_000,
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

interface Ran {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
}

function runPowerShell(shell: PowerShellUnderTest, script: string): Ran {
  const run = spawnSync(shell.program, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand(script)], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  return { stdout: run.stdout ?? '', stderr: run.stderr ?? '', status: run.status };
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
  test(`${shell.name}: the marker the hostile values would create CAN be created here (the control that keeps the cases below honest)`, { skip: shell.skip }, () => {
    const dir = ownedDir(scope, 'psControl');
    const marker = path.join(dir, 'control');
    const ran = runPowerShell(shell, `${makeMarker(marker)} | Out-Null`);
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(fs.existsSync(marker), true, 'the injected command does not create its file on this machine, so "no file" would prove nothing');
  });

  test(`${shell.name}: quoteFor('powershell') words are read back byte for byte, as an expression and as a command argument`, { skip: shell.skip }, () => {
    const dir = ownedDir(scope, 'psQuote');
    for (const value of valuesFor(path.join(dir, 'pwned'))) {
      const word = quoteFor('powershell', value);
      for (const [mode, line] of [['expression', `credsShow (${word})`], ['argument', `credsShow ${word}`]] as const) {
        const ran = runPowerShell(shell, `${SHOW_FUNCTION}\n${line}`);
        assert.equal(ran.status, 0, `${mode} ${JSON.stringify(value)}: ${ran.stderr}`);
        assert.deepEqual(argumentsRead(ran.stdout), [value], `${mode} ${JSON.stringify(value)} read as something else (${hexOf(value)})`);
        assertNoMarker(dir, shell, `${mode} ${JSON.stringify(value)}`);
      }
    }
  });

  test(`${shell.name}: the words buildSshCommand emits for win32 reach the program as the raw values`, { skip: shell.skip }, () => {
    const dir = ownedDir(scope, 'psSsh');
    const marker = path.join(dir, 'pwned');
    const base = { id: 'e1', name: 'prod', host: 'example.com', user: 'deploy', isSshEnabled: true };
    // `credsShow` stands in for ssh: the line is the one a terminal gets, only the program word differs.
    const lineOf = (over: Partial<EntityMetadata>, options: SshCommandOptions = {}): string => {
      const line = buildSshCommand({ ...base, ...over }, 'win32', { program: 'credsShow', ...options });
      assert.notEqual(line, undefined, JSON.stringify(over));
      return line as string;
    };
    const read = (line: string): string[] => {
      const ran = runPowerShell(shell, `${SHOW_FUNCTION}\n${line}`);
      assert.equal(ran.status, 0, `${line}\n${ran.stderr}`);
      return argumentsRead(ran.stdout);
    };

    // A key path: the ordinary ones, a space, and every hostile one.
    for (const key of valuesFor(marker)) {
      assert.deepEqual(read(lineOf({ sshKeyPath: key })), ['-i', key, 'deploy@example.com'], `key path ${JSON.stringify(key)}`);
      assertNoMarker(dir, shell, `key path ${JSON.stringify(key)}`);
    }
    // A user holding `$` (the destination), and the same inside a jump value.
    assert.deepEqual(read(lineOf({ user: 'a$HOME' })), ['a$HOME@example.com']);
    assert.deepEqual(read(lineOf({}, { jump: 'a$HOME@bastion:2200' })), ['-J', 'a$HOME@bastion:2200', 'deploy@example.com']);
    assert.deepEqual(read(lineOf({}, { jump: 'j@b:2200' })), ['-J', 'j@b:2200', 'deploy@example.com']);
    // The pinned known_hosts file, ordinary and holding a `$`.
    for (const file of ['C:\\Users\\me\\known_hosts', 'C:\\Users\\a$b\\known_hosts', 'C:\\Program Files\\kh']) {
      assert.deepEqual(
        read(lineOf({}, { knownHostsFile: file })),
        ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, 'deploy@example.com'],
        `known_hosts ${JSON.stringify(file)}`,
      );
    }
    assertNoMarker(dir, shell, 'the destination, jump and known_hosts cases');
  });
}
