import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultProbe, openSshProgram, pathSshIsBuiltIn } from '../sshProgram';

/**
 * The REAL probe — the one production uses when nobody injects one.
 *
 * <p>Every other SSH test hands `openSshProgram` a probe, which is right: the decision is a unit
 * test that way. What no test covered is the wiring underneath — that omitting the probe reaches
 * `defaultProbe`, that it reads `process.env.PATH`, and that it splits that value the way the
 * target platform does. Three reviewers asked for this independently, and they were right to: the
 * split was a hard-coded `;` for as long as the feature has existed, which is precisely why CI
 * (Linux) could never exercise the Windows branch it was asserting (audit 2026-09-09, finding #8).</p>
 *
 * <p><b>And the first version of this file had no teeth</b>, which the review gate also caught: it
 * asserted `pathSshIsBuiltIn === false` on a Linux runner, and `false` is what a probe that ignored
 * the environment entirely would answer too. So the probe is now asked what it SAW — the directories
 * it parsed out of `PATH`, and whether it found the file. Real directories and a real file, because
 * `hasTool` is `fs.existsSync`, and stubbing it would put the test back on the injected side of the
 * line it exists to cross.</p>
 */

const made: string[] = [];

after(() => {
  // The temp tree goes when the suite does. Left behind, these accumulate one `ssh.exe` per run on
  // a long-lived agent — raised by two reviewers, and cheaper to fix than to argue about.
  for (const dir of made) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function madeDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** A temp directory holding a file named `ssh.exe` — what `hasTool` looks for. */
function dirWithSsh(): string {
  const dir = madeDir('creds-ssh-probe-');
  fs.writeFileSync(path.join(dir, 'ssh.exe'), '');
  return dir;
}

/** Run `body` with `PATH` set to these directories, and put the real one back afterwards. */
function withPath<T>(dirs: readonly string[], body: () => T): T {
  const real = process.env.PATH;
  process.env.PATH = dirs.join(path.delimiter);
  try {
    return body();
  } finally {
    // Assigning `undefined` would leave the literal string "undefined" behind, which is worse than
    // the absence it was meant to restore — a reviewer's catch.
    if (real === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = real;
    }
  }
}

test('the default probe reads PATH and finds the file — not merely "returns false"', () => {
  // The teeth. A probe that ignored the environment would answer an empty `pathDirs` here, and a
  // probe that split on the wrong delimiter would answer ONE entry holding all of them.
  const first = dirWithSsh();
  const later = dirWithSsh();

  withPath([first, later], () => {
    const probe = defaultProbe(process.platform);

    assert.ok(probe.pathDirs.includes(first), `PATH was read: ${probe.pathDirs.join(' | ')}`);
    assert.ok(probe.pathDirs.includes(later));
    assert.equal(probe.hasTool(first), true, 'and the file it looks for is the file that is there');
    assert.equal(probe.hasTool(madeDir('creds-no-ssh-')), false);
  });
});

test('the delimiter follows the TARGET platform, not the host', () => {
  // `openSshProgram('ssh', true, 'win32', …)` on a Linux runner is a real call shape, and taking the
  // host's `:` there would split a Windows PATH into one bogus entry — this change's own bug, from
  // the other side.
  withPath([String.raw`C:\a`, String.raw`C:\b`], () => {
    assert.equal(defaultProbe('win32').pathDirs.length, process.platform === 'win32' ? 2 : 1);
    assert.deepEqual(defaultProbe('linux').pathDirs.length >= 1, true);
  });
});

test('with NO ssh anywhere on PATH a forwarding connection gets the forced full path', () => {
  // End to end, with no probe passed: `defaultProbe` is what decides, over a PATH this test set.
  withPath([madeDir('creds-no-ssh-')], () => {
    assert.equal(openSshProgram('ssh', true, 'win32', () => true), 'C:/Windows/System32/OpenSSH/ssh.exe');
  });
});

test('a PATH whose first ssh IS the built-in reaches the bare word, through the real probe', (t) => {
  // The one that proves the whole wiring, and it can only run where that directory exists — which
  // is a Windows machine, and is the audit's exact condition. Skipped rather than silently returning
  // somewhere it cannot be checked.
  const builtIn = String.raw`C:\Windows\System32\OpenSSH`;
  if (!fs.existsSync(builtIn)) {
    t.skip('not a Windows machine: no built-in OpenSSH directory to put first');
    return;
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
