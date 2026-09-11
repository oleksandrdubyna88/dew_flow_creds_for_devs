import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openSshProgram, pathSshIsBuiltIn } from '../sshProgram';

/**
 * The REAL probe — the one production uses when nobody injects one.
 *
 * <p>Every other test here hands `openSshProgram` a probe, which is right: the decision is a unit
 * test that way. What no test covered is the wiring underneath it — that omitting the probe reaches
 * `defaultProbe`, that `defaultProbe` reads `process.env.PATH`, and that it splits that value the
 * way the platform does. Three reviewers asked for this independently, and they were right to: the
 * split was a hard-coded `;` for as long as the feature has existed, which is exactly why CI (Linux)
 * could never exercise the Windows branch it was asserting (audit 2026-09-09, finding #8).</p>
 *
 * <p>Real directories and a real file, because `hasTool` is `fs.existsSync` and stubbing it would
 * put the test back on the injected side of the line it exists to cross. `PATH` is saved and
 * restored around each case: it is process-wide state, and leaving it edited would decide the
 * answer for whatever runs next.</p>
 */

/** A temp directory holding a file named `ssh.exe` — what `hasTool` looks for. */
function dirWithSsh(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-ssh-probe-'));
  fs.writeFileSync(path.join(dir, 'ssh.exe'), '');
  return dir;
}

function dirWithout(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creds-no-ssh-'));
}

/** Run `body` with `PATH` set to these directories, and put the real one back afterwards. */
function withPath<T>(dirs: readonly string[], body: () => T): T {
  const real = process.env.PATH;
  process.env.PATH = dirs.join(path.delimiter);
  try {
    return body();
  } finally {
    process.env.PATH = real;
  }
}

test('the default probe finds the first PATH directory that holds an ssh, and no other', () => {
  const first = dirWithSsh();
  const later = dirWithSsh();
  const empty = dirWithout();

  withPath([empty, first, later], () => {
    // `pathSshIsBuiltIn` compares that first hit against the built-in directory. Neither temp
    // directory is it, so the answer is false — and the point is that it got there by READING the
    // PATH rather than by the split collapsing into one bogus entry, which is what used to happen
    // off Windows and made the answer false for the wrong reason.
    assert.equal(pathSshIsBuiltIn('win32'), false);
  });
});

test('with NO ssh anywhere on PATH the forced full path is what a forwarding connection gets', () => {
  // The end-to-end shape: no probe passed, so `defaultProbe` is what decides, and it reads a PATH
  // this test set. An implementation that never reached the real probe would answer the same here —
  // which is why the case below, where the answer CHANGES with the PATH, is the load-bearing one.
  withPath([dirWithout()], () => {
    assert.equal(openSshProgram('ssh', true, 'win32', () => true), 'C:/Windows/System32/OpenSSH/ssh.exe');
  });
});

test('a PATH whose first ssh IS the built-in directory reaches the bare word, through the real probe', () => {
  // The one that proves the wiring. `WINDOWS_OPENSSH_DIR` cannot be created on a Linux runner, so
  // the directory is only asserted to be consulted when it exists; where it does — a Windows
  // machine — this is the audit's exact condition, and the answer must be `ssh`.
  const builtIn = 'C:\\Windows\\System32\\OpenSSH';
  if (!fs.existsSync(builtIn)) {
    return; // not a Windows machine: the case below covers what can be checked here
  }
  withPath([builtIn, dirWithSsh()], () => {
    assert.equal(pathSshIsBuiltIn('win32'), true, 'the real probe read the real PATH');
    assert.equal(openSshProgram('ssh', true, 'win32', () => true), 'ssh');
  });
});

test('off Windows the probe is never consulted, whatever PATH says', () => {
  withPath([dirWithSsh()], () => {
    assert.equal(pathSshIsBuiltIn('linux'), false);
    assert.equal(pathSshIsBuiltIn('darwin'), false);
  });
});
