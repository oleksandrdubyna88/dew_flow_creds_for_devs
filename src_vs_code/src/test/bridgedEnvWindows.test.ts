/**
 * PW1 (the E1.6 spec §S6.14 Y0; the parent's §7 probe table): what the bridged environment does on a real Windows image. The `runner-windows`
 * job of `ci-extension.yml` runs this file in a step of its own; off `win32` every case is skipped by name.
 *
 * A probe is a RECORD. Each case prints the line the lead pastes into §S6.13 (every line starts `PW1 <case>`) BEFORE it asserts, so a red case
 * still says what it saw. A client that is not on the image is a case skipped by the name "not measured", never a pass.
 *
 * <p>Every child here starts the way a bridged one does: `shell: false`, `windowsHide: true`, and the `env` object `bridgedSshEnv(process.env,
 * 'win32')` answers. WN3 starts its child through `runBounded`, the production spawner.</p>
 */
import * as assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, type TestContext } from 'node:test';
import { clientVerdict } from '../bridgedSshClient';
import { BRIDGED_ENV_BLANKED_WINDOWS, BRIDGED_ENV_RUNTIME_ADDED_WINDOWS, BRIDGED_ENV_WINDOWS, bridgedSshEnv } from '../bridgedSshEnv';
import { runBounded } from '../sshExecRunner';

const SKIPPED_OFF_WINDOWS = process.platform === 'win32' ? false : 'skipped: PW1 observes Windows (ssh.exe, the runtime\'s environment, the database clients) and runs on windows-latest only';
const BOUND_MS = 30_000;
const CLIPPED = 400;

/** The environment of a bridged child, as the module builds it today. */
const requested = (): NodeJS.ProcessEnv => bridgedSshEnv(process.env, 'win32');

const sshExe = (): string => path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');

const firstLine = (text: string): string => text.split(/\r?\n/, 1)[0];

const clip = (text: string): string => JSON.stringify(text.length > CLIPPED ? `${text.slice(0, CLIPPED)}...` : text);

/** One child started the way a bridged one is. */
function runUnder(program: string, args: readonly string[], env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(program, args, { shell: false, windowsHide: true, env, encoding: 'utf8', timeout: BOUND_MS });
}

/** What a child answered, in one line a person can paste: the exit code (or the spawn error), and both streams, clipped. */
function describe(answer: SpawnSyncReturns<string>): string {
  return `exit ${answer.status}${spawnErrorOf(answer)}; stdout ${clip(answer.stdout ?? '')}; stderr ${clip(answer.stderr ?? '')}`;
}

/** `; spawn error <code>` when the child did not start (or was ended by the bound), else nothing. */
function spawnErrorOf(answer: SpawnSyncReturns<string>): string {
  const error = answer.error as NodeJS.ErrnoException | undefined;
  return error === undefined ? '' : `; spawn error ${error.code ?? error.message}`;
}

/** The first of `PATH`'s folders that holds `<name>.exe`, or undefined. */
function onPath(name: string): string | undefined {
  const folders = (process.env.PATH ?? '').split(path.delimiter).filter((folder) => folder !== '');
  return folders.map((folder) => path.join(folder, `${name}.exe`)).find((file) => fs.existsSync(file));
}

test('WN1: ssh.exe -V under the requested environment exits 0, says OpenSSH_for_Windows_ and meets the floor', { skip: SKIPPED_OFF_WINDOWS }, (t: TestContext) => {
  const env = requested();
  const answer = runUnder(sshExe(), ['-V'], env);
  const line = firstLine(answer.stderr ?? '');

  t.diagnostic(`PW1 WN1 node ${process.version}; ssh.exe -V first line of stderr: ${JSON.stringify(line)}; ${describe(answer)}`);
  t.diagnostic(`PW1 WN1 the names the child was given (${Object.keys(env).length}): ${Object.keys(env).join(', ')}`);
  assert.equal(answer.status, 0, `ssh.exe -V did not exit 0 under ${Object.keys(env).join(', ')}: ${describe(answer)}`);
  assert.match(line, /^OpenSSH_for_Windows_/);
  // The floor (Y3, Q12) is checked against what this image prints: the real constant, through the module's own reading of the answer.
  const verdict = clientVerdict(answer.status, answer.stdout ?? '', answer.stderr ?? '', 'win32');
  t.diagnostic(`PW1 WN1 clientVerdict on that answer (win32): ${JSON.stringify(verdict)}`);
  assert.equal(verdict.ok, true, `the OpenSSH that windows-latest ships is below the Win32-OpenSSH floor, or is not read as a version: ${JSON.stringify(verdict)}`);
});

test('WN2: the same without PROGRAMDATA is recorded, not asserted', { skip: SKIPPED_OFF_WINDOWS }, (t: TestContext) => {
  const withoutProgramData = Object.fromEntries(Object.entries(requested()).filter(([name]) => name.toUpperCase() !== 'PROGRAMDATA'));
  const answer = runUnder(sshExe(), ['-V'], withoutProgramData);

  t.diagnostic(`PW1 WN2 ssh.exe -V with no PROGRAMDATA (${Object.keys(withoutProgramData).length} names): ${describe(answer)}`);
});

/** The child of WN3: it prints each name of its own environment with whether the value is empty, as JSON, and nothing of any value. */
const NAMES_CHILD = 'process.stdout.write(JSON.stringify(Object.entries(process.env).map(([name, value]) => [name, value === ""])))';
/** What WN3 puts into the TEST process: neither may reach the child, in any letter case. */
const PARENT_ONLY = ['BRIDGE_TEST_SECRET', 'SSH_AUTH_SOCK'] as const;

/** The names of the child's environment and whether each holds an empty value, read from what the child printed. */
function namesOf(printed: string): Array<[string, boolean]> {
  return JSON.parse(printed) as Array<[string, boolean]>;
}

/** Whether `wanted` (upper case) is printed with an empty value: `true`, `false`, or `absent` when the child has no such name. */
function emptinessOf(names: Array<[string, boolean]>, wanted: string): string {
  const found = names.find(([name]) => name.toUpperCase() === wanted);
  return found === undefined ? 'absent' : String(found[1]);
}

/** Runs `body` with `PARENT_ONLY` set in this process, and puts the process's own environment back. */
async function withParentOnlyNames<T>(body: () => Promise<T>): Promise<T> {
  const before = PARENT_ONLY.map((name): [string, string | undefined] => [name, process.env[name]]);
  for (const name of PARENT_ONLY) {
    process.env[name] = `${name}-of-the-test-process`;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/** Every name of `names` that is in none of `known` (compared in upper case). */
const outsideOf = (names: Array<[string, boolean]>, known: readonly string[]): string[] => names.map(([name]) => name).filter((name) => !known.includes(name.toUpperCase()));

test('WN3: a child of node started by runBounded under the requested environment prints no parent-only name, only names of the lists, and the three blanked names empty', { skip: SKIPPED_OFF_WINDOWS }, async (t: TestContext) => {
  // Through the production spawner (`runBounded`, Y2), so the runner's own pass-through is observed and not only the request.
  const answer = await withParentOnlyNames(() => runBounded(process.execPath, ['-e', NAMES_CHILD], false, { env: requested(), timeoutMs: BOUND_MS }));
  assert.equal(answer.exitCode, 0, `the child of node did not run: exit ${answer.exitCode}; stderr ${clip(answer.stderr)}`);
  const names = namesOf(answer.stdout);
  const upper = names.map(([name]) => name.toUpperCase());
  const known: readonly string[] = [...BRIDGED_ENV_WINDOWS, ...BRIDGED_ENV_BLANKED_WINDOWS, ...BRIDGED_ENV_RUNTIME_ADDED_WINDOWS];

  t.diagnostic(`PW1 WN3 the child printed ${names.length} names: ${names.map(([name, empty]) => (empty ? `${name}=""` : name)).join(', ')}`);
  t.diagnostic(`PW1 WN3 names the runtime added beside the seven: ${outsideOf(names, BRIDGED_ENV_WINDOWS).join(', ')}`);
  for (const name of PARENT_ONLY) {
    assert.equal(upper.includes(name), false, `${name} reached the child, in some letter case`);
  }
  assert.deepEqual(outsideOf(names, known), [], 'every printed name is one of the seven, the three blanked or the runtime\'s eleven');
  for (const name of BRIDGED_ENV_BLANKED_WINDOWS) {
    assert.equal(emptinessOf(names, name), 'true', `${name} is printed, with an empty value (Q14)`);
  }
});

/** The client programs WN4 looks for, each with the flag that makes it print its version and exit. `sqlcmd` has no `--version` in its ODBC build: `-?` prints its banner. */
const CLIENTS: ReadonlyArray<readonly [string, string]> = [['psql', '--version'], ['mysql', '--version'], ['sqlcmd', '-?']];

for (const [client, flag] of CLIENTS) {
  test(`WN4: ${client} ${flag} under the requested environment exits 0 (not measured when ${client} is not on PATH)`, { skip: SKIPPED_OFF_WINDOWS }, (t: TestContext) => {
    const found = onPath(client);
    if (found === undefined) {
      t.diagnostic(`PW1 WN4 ${client}: not measured (no ${client}.exe on PATH)`);
      t.skip(`not measured: ${client}.exe is not on PATH`);
      return;
    }
    const answer = runUnder(found, [flag], requested());

    t.diagnostic(`PW1 WN4 ${client} ${flag} (${found}): first line ${JSON.stringify(firstLine(`${answer.stdout ?? ''}${answer.stderr ?? ''}`))}; ${describe(answer)}`);
    assert.equal(answer.status, 0, `${client} ${flag} did not exit 0: ${describe(answer)}`);
  });
}
