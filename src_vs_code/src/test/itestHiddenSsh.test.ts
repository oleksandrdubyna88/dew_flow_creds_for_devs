// `scripts/itestHiddenSsh.cjs` (G1 E3.S10): runs a command with the person's `~/.ssh` hidden behind an owned, empty folder (bwrap).
//
// Every test runs on a SCRATCH folder, never the real `~/.ssh`: the script takes its target from `CREDS_HIDE_SSH_TARGET`, a variable for these tests only
// (a real run never sets it), and the limit of the wrapped command from `CREDS_HIDE_SSH_LIMIT_MS`, another variable for these tests ONLY. The scratch target holds a file the command must not see; the record before and after is an `lstat` of each entry.
import assert from 'node:assert/strict';
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Scope } from '../../scripts/lib/leftovers.cjs';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { record, verdict, wrapped } from '../../scripts/itestHiddenSsh.cjs';
import { SRC_VS_CODE, isAlive } from './runnerWorld';

const SCRIPT = path.join(SRC_VS_CODE, 'scripts', 'itestHiddenSsh.cjs');
const hasBwrap = spawnSync('bwrap', ['--version'], { stdio: 'ignore' }).status === 0 && process.platform === 'linux';
const skip = hasBwrap ? false : 'bwrap is not installed (or this is not Linux): the wrapper needs it';

/** A scratch target with a file and a subfolder in it, as a stand-in for the person's `~/.ssh`. */
function scratchTarget(scope: Scope): string {
  const target = ownedDir(scope, 'hide-target');
  fs.writeFileSync(path.join(target, 'keep'), 'not for the run to see');
  fs.mkdirSync(path.join(target, 'sub'));
  fs.writeFileSync(path.join(target, 'sub', 'inner'), 'x');
  return target;
}

/** The lstat record of a folder, one level into subfolders: what the script compares before and after. */
function lstatRecord(dir: string): string[] {
  const rows: string[] = [];
  const walk = (relative: string): void => {
    for (const name of fs.readdirSync(path.join(dir, relative)).sort()) {
      const rel = path.join(relative, name);
      const st = fs.lstatSync(path.join(dir, rel), { bigint: true });
      rows.push(`${rel} ${st.mode} ${st.size} ${st.mtimeNs} ${st.ctimeNs} ${st.ino}`);
      if (st.isDirectory()) walk(rel);
    }
  };
  walk('');
  return [`. ${fs.lstatSync(dir, { bigint: true }).mtimeNs}`, ...rows];
}

/** Every wrapper run here is bounded: a wrapper that does not end (the old one, with a command that waits) fails the test instead of hanging the suite. */
const RUN_LIMIT_MS = 60_000;

function hide(target: string, command: string[], extra: { env?: NodeJS.ProcessEnv; limitMs?: number } = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, '--', ...command], {
    encoding: 'utf8',
    timeout: extra.limitMs ?? RUN_LIMIT_MS,
    killSignal: 'SIGKILL',
    env: { ...process.env, CREDS_HIDE_SSH_TARGET: target, ...extra.env },
  });
}

test('the command sees an empty folder where the target is', { skip }, (t) => {
  const target = scratchTarget(t);
  const run = hide(target, ['sh', '-c', 'ls -A "$1" | wc -l', 'sh', target]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^0$/m, 'the command listed an empty folder');
  assert.ok(fs.existsSync(path.join(target, 'keep')), 'the real target still holds its file');
});

test('what the run writes lands in the owned folder, not in the target, and the target record is unchanged', { skip }, (t) => {
  const target = scratchTarget(t);
  const before = lstatRecord(target);
  const script = 'require("node:net").createServer().listen(process.argv[1] + "/agent", () => { require("node:fs").writeFileSync(process.argv[1] + "/rc", "x"); process.exit(0); });';
  const run = hide(target, [process.execPath, '-e', script, target]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ok {3}the person's ~\/\.ssh was hidden for the run and is unchanged: 3 entries, the same lstat records before and after$/m);
  assert.match(run.stdout, /^info {2}what the run wrote in place of ~\/\.ssh: .*agent \(socket\)/m, 'the socket went to the owned folder');
  assert.match(run.stdout, /^info {2}what the run wrote in place of ~\/\.ssh: .*rc \(file\)/m, 'the file went to the owned folder');
  assert.deepEqual(lstatRecord(target), before, 'the target is the same before and after');
  assert.equal(fs.existsSync(path.join(target, 'agent')), false);
  assert.equal(fs.existsSync(path.join(target, 'rc')), false);
});

test('a run that writes nothing says so, and the info line names the hidden folder', { skip }, (t) => {
  const target = scratchTarget(t);
  const run = hide(target, ['true']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /what the run wrote in place of ~\/\.ssh: nothing$/m);
  const device = run.stdout.match(/device:inode (\d+:\d+)/)?.[1];
  assert.ok(device, 'the info line names the hidden folder by device and inode');
});

test('the exit code of the command passes through', { skip }, (t) => {
  const target = scratchTarget(t);
  assert.equal(hide(target, ['sh', '-c', 'exit 7']).status, 7);
  assert.equal(hide(target, ['true']).status, 0);
});

test('the record and its verdict: the same folder is ok, a change is FAIL and names it', (t) => {
  // The end-to-end FAIL is the next-but-two test (a writer outside the run); here the record and the verdict are driven in-process on a scratch folder.
  const target = scratchTarget(t);
  const before = record(target);
  assert.deepEqual([...before.keys()], ['.', 'keep', 'sub', path.join('sub', 'inner')], 'the folder, each entry and each entry of a subfolder');
  assert.deepEqual(verdict(before, record(target)), { ok: true, line: "ok   the person's ~/.ssh was hidden for the run and is unchanged: 3 entries, the same lstat records before and after" });
  fs.writeFileSync(path.join(target, 'leak'), 'x');
  const changed = verdict(before, record(target));
  assert.equal(changed.ok, false);
  assert.match(changed.line, /^FAIL the person's ~\/\.ssh changed during the run \(\d+ records; .*a writer outside the run.*\): .*leak: absent -> file /);
  const resized = record(target);
  fs.appendFileSync(path.join(target, 'keep'), 'more');
  assert.match(verdict(resized, record(target)).line, /keep: file size=22 .* -> file size=26 /);
});

test('without bwrap the script refuses with exit 2 and names it', { skip: process.platform === 'linux' ? false : 'the refusal text differs off Linux' }, (t) => {
  const target = scratchTarget(t);
  const empty = ownedDir(t, 'no-path');
  const run = hide(target, ['true'], { env: { PATH: empty } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /refused: bwrap is missing/);
});

test('a missing target is refused with exit 2 and is never created', { skip }, (t) => {
  const parent = ownedDir(t, 'hide-parent');
  const missing = path.join(parent, 'absent');
  const run = hide(missing, ['true']);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /refused: the folder to hide \(~\/\.ssh\) does not exist; it is never created/);
  assert.equal(fs.existsSync(missing), false);
});

test('a target that is a file, and a missing command, are refused with exit 2', { skip }, (t) => {
  const parent = ownedDir(t, 'hide-file');
  const file = path.join(parent, 'plain');
  fs.writeFileSync(file, 'x');
  const notDirectory = hide(file, ['true']);
  assert.equal(notDirectory.status, 2);
  assert.match(notDirectory.stderr, /is not a directory/);
  const noCommand = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, CREDS_HIDE_SSH_TARGET: parent } });
  assert.equal(noCommand.status, 2);
  assert.match(noCommand.stderr, /no command was given/);
});

/** The path of `bwrap` as the PATH names it: what a test links into a folder that is the whole PATH of a run. */
function bwrapPath(): string {
  const found = (process.env.PATH ?? '').split(path.delimiter).map((dir) => path.join(dir, 'bwrap')).find((candidate) => fs.existsSync(candidate));
  assert.ok(found, 'bwrap is on the PATH of this test');
  return found;
}

/** The pids in a file, one per line (a wrapped command writes its own and its helper's), and a kill of whichever still lives: the cleanup of a test whose script failed. */
function pidsIn(file: string): number[] {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => /^\d+$/.test(line)).map(Number) : [];
}
function killAll(pids: number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}
const eventually = async (what: () => boolean, ms = 5000): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 50))) if (what()) return true;
  return what();
};

test('the bwrap argv carries --die-with-parent', () => {
  assert.deepEqual(wrapped('/o', '/t', ['cmd', 'a']), ['--die-with-parent', '--dev-bind', '/', '/', '--bind', '/o', '/t', '--', 'cmd', 'a']);
});

test('a writer OUTSIDE the run changes the target: the run ends with the FAIL line and exit 1, and says it may not be the run', { skip }, async (t) => {
  const target = scratchTarget(t);
  const flags = ownedDir(t, 'hide-flag');
  const release = path.join(flags, 'release');
  // The command waits for the test to release it, so the test writes to the REAL target (outside the namespace) while the command runs.
  const child = spawn(process.execPath, [SCRIPT, '--', 'sh', '-c', 'while [ ! -e "$1" ]; do sleep 0.1; done', 'sh', release], {
    env: { ...process.env, CREDS_HIDE_SSH_TARGET: target },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const status = new Promise<number | null>((resolve) => child.once('close', (code) => resolve(code)));
  assert.ok(await eventually(() => /the hidden folder is shown/.test(stdout), 20_000), `the command started: ${stdout} ${stderr}`);
  fs.writeFileSync(path.join(target, 'leak'), 'written outside the namespace');
  fs.writeFileSync(release, '');
  assert.equal(await status, 1, stderr);
  assert.match(stdout, /^FAIL the person's ~\/\.ssh changed during the run \(\d+ records; .*a writer outside the run.*\): .*leak: absent -> file /m);
  assert.doesNotMatch(stdout, /^ok /m, 'no ok line beside the FAIL');
});

test('when the wrapper cannot show the owned folder (no stat in the PATH of bwrap) it refuses with exit 2 before the command runs', { skip }, (t) => {
  const target = scratchTarget(t);
  const bin = ownedDir(t, 'hide-bin');
  fs.symlinkSync(bwrapPath(), path.join(bin, 'bwrap'));
  const marker = path.join(ownedDir(t, 'hide-marker'), 'ran');
  const run = hide(target, ['sh', '-c', 'echo x > "$1"', 'sh', marker], { env: { PATH: bin } });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /refused: inside the wrapper the hidden path does not show the owned folder \(saw .*, wanted \d+:\d+\)/);
  assert.equal(fs.existsSync(marker), false, 'the command did not run');
});

test('the owned folder is removed when the run ends', { skip }, (t) => {
  const target = scratchTarget(t);
  const temp = ownedDir(t, 'hide-temp');
  const run = hide(target, ['true'], { env: { TMPDIR: temp } });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /device:inode \d+:\d+/, 'the owned folder was made and shown');
  assert.deepEqual(fs.readdirSync(temp), [], 'nothing of the run is left in its temp folder');
});

test('when $HOME is not the passwd home and no test target is given, it refuses with exit 2 and names both', { skip: process.platform === 'linux' ? false : 'off Linux the script refuses first because there is no bwrap' }, (t) => {
  const home = ownedDir(t, 'hide-home');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  delete env.CREDS_HIDE_SSH_TARGET;
  const run = spawnSync(process.execPath, [SCRIPT, '--', 'true'], { encoding: 'utf8', env });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /^refused: \$HOME \(.+\) is not the passwd home \(.+\), and ssh and sshd read the passwd home/m);
  assert.ok(run.stderr.includes(home) && run.stderr.includes(os.userInfo().homedir), 'it names $HOME and the passwd home');
  assert.deepEqual(fs.readdirSync(home), [], 'nothing was created in the scratch home (no .ssh)');
});

test('the limit ends the whole tree of the wrapped command: its helper does not outlive it, and a FAIL line is printed (exit 1)', { skip }, async (t) => {
  const target = scratchTarget(t);
  const pidFile = path.join(ownedDir(t, 'hide-pids'), 'pids');
  // The command writes its own pid and its helper's, then waits for the helper: it never ends by itself.
  const script = 'sleep 300 >/dev/null 2>&1 & echo "$$" > "$1"; echo "$!" >> "$1"; wait';
  t.after(() => killAll(pidsIn(pidFile)));
  const run = hide(target, ['sh', '-c', script, 'sh', pidFile], { env: { CREDS_HIDE_SSH_LIMIT_MS: '1500' }, limitMs: 15_000 });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /^FAIL the wrapped command did not end within 1500 ms; its whole process tree was ended and confirmed gone$/m);
  const pids = pidsIn(pidFile);
  assert.equal(pids.length, 2, 'the command wrote its own pid and its helper');
  assert.ok(await eventually(() => !pids.some(isAlive)), `neither process is alive: ${JSON.stringify(pids.map((pid) => [pid, isAlive(pid)]))}`);
});

test('a limit that is not a whole number of milliseconds is refused with exit 2', { skip }, (t) => {
  const target = scratchTarget(t);
  for (const bad of ['0', '-5', '1.5', 'soon', '99999999999']) {
    const run = hide(target, ['true'], { env: { CREDS_HIDE_SSH_LIMIT_MS: bad } });
    assert.equal(run.status, 2, `${bad}: ${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /refused: CREDS_HIDE_SSH_LIMIT_MS \(tests only\)/);
  }
});
