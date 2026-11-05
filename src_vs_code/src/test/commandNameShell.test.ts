import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { resolveCommand, shownCommandLine } from '../commandLine';
import { substituteName } from '../commandName';
import { EntityMetadata } from '../types';
import { ACCEPTED, REFUSED, REFUSED_MORE } from './commandNameTable';

/**
 * `{name}` against a REAL shell (parent `PLAN_terminal_folder_run.md` §1, story S2): no stub. An accepted name
 * reaches bash byte for byte, a refused name is never substituted, and a control proves the test can fail: the
 * hostile name, substituted without the guard, really creates a file.
 */

/**
 * Until PR #294's helper lands: the inline form the existing tests use (`sshAgentServer.test.ts:71`), removed by this test on every
 * exit path. A sweep only LISTS a folder under this prefix; it removes nothing it cannot prove its own.
 */
function shellDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-shell-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      // Left under its prefix, listed by the sweep; a teardown never fails a test, and never goes unsaid.
      t.diagnostic(`left behind ${dir}: ${String(error)}`);
    }
  });
  return dir;
}

/** Every shell this suite starts is given this long: a hung one fails its test with `ETIMEDOUT` instead of the suite. */
const SHELL_TIMEOUT_MS = 20_000;

function has(program: string, args: string[]): boolean {
  try {
    execFileSync(program, args, { stdio: 'ignore', timeout: SHELL_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/** A Linux or macOS machine without bash FAILS; only a Windows machine without it skips. */
const NO_BASH = process.platform === 'win32' && !has('bash', ['-c', 'true']) ? 'no bash on this Windows machine' : false;

function E(name: string, command: string): EntityMetadata {
  return { id: 'e1', name, isSshEnabled: false, isTerminal: true, command };
}

/** `line` run by bash in `dir`, its stdout as bytes. */
function bash(line: string, dir: string): Buffer {
  const run = spawnSync('bash', ['-c', line], { cwd: dir, timeout: SHELL_TIMEOUT_MS });
  assert.equal(run.error, undefined, String(run.error));
  return run.stdout;
}

const P = 'printf %s {name}';

test('bash_receives_every_accepted_name_byte_exact', { skip: NO_BASH }, (t) => {
  const dir = shellDir(t);
  for (const name of [...ACCEPTED, 'x\u0301']) {
    const resolved = resolveCommand(E(name, P));
    assert.equal(resolved.kind, 'ready', JSON.stringify(name));
    const line = resolved.kind === 'ready' ? resolved.line : '';
    assert.ok(bash(line, dir).equals(Buffer.from(name, 'utf8')), JSON.stringify(name));
  }
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing was created');
});

test('the_control_an_unguarded_hostile_name_really_creates_a_file', { skip: NO_BASH }, (t) => {
  const dir = shellDir(t);
  bash(substituteName(P, 'x;touch pwned'), dir);
  assert.ok(fs.existsSync(path.join(dir, 'pwned')), 'the control must be able to fail: without the guard the name IS shell syntax');
});

test('no_refused_name_reaches_bash', { skip: NO_BASH }, (t) => {
  const dir = shellDir(t);
  for (const name of [...REFUSED, ...REFUSED_MORE]) {
    assert.equal(resolveCommand(E(name, P)).kind, 'refused', JSON.stringify(name));
    assert.equal(bash(shownCommandLine(E(name, P)), dir).toString('utf8'), '{name}', JSON.stringify(name));
  }
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing was created');
});

test('the_literal_form_prints_the_token_and_is_not_substituted', { skip: NO_BASH }, (t) => {
  const dir = shellDir(t);
  const entry = E('alert', "printf %s {na''me}");
  assert.equal(shownCommandLine(entry), "printf %s {na''me}");
  assert.equal(bash(shownCommandLine(entry), dir).toString('utf8'), '{name}');
});

test('the_exact_match_form_stays_one_word', { skip: NO_BASH }, (t) => {
  const dir = shellDir(t);
  assert.equal(bash(shownCommandLine(E('alert', "printf %s '={name}'")), dir).toString('utf8'), '=alert');
});

/** On Windows the console code page is not what these prove: only the ASCII names. */
const asciiOnWindows = (names: readonly string[]): string[] => (process.platform === 'win32' ? names.filter((n) => /^[\x20-\x7e]+$/.test(n)) : [...names]);

test('pwsh_receives_the_accepted_names', { skip: has('pwsh', ['-NoProfile', '-Command', '1']) ? false : 'no pwsh on this machine' }, (t) => {
  const dir = shellDir(t);
  for (const name of asciiOnWindows(ACCEPTED)) {
    const line = shownCommandLine(E(name, 'Write-Output {name}'));
    const run = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', line], { cwd: dir, encoding: 'utf8', timeout: SHELL_TIMEOUT_MS });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.stdout.trim(), name, JSON.stringify(name));
  }
});

test('cmd_receives_the_accepted_names', { skip: process.platform === 'win32' ? false : 'cmd.exe runs only on Windows here' }, (t) => {
  const dir = shellDir(t);
  for (const name of asciiOnWindows(ACCEPTED)) {
    const line = shownCommandLine(E(name, 'echo {name}'));
    const run = spawnSync('cmd.exe', ['/d', '/s', '/c', line], { cwd: dir, encoding: 'utf8', timeout: SHELL_TIMEOUT_MS });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.stdout.trim(), name, JSON.stringify(name));
  }
});
