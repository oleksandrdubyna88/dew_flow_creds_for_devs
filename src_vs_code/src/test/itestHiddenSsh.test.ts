// `scripts/itestHiddenSsh.cjs` (G1 E3.S10): runs a command with the person's `~/.ssh` hidden behind an owned, empty folder (bwrap).
//
// Every test runs on a SCRATCH folder, never the real `~/.ssh`: the script takes its target from `CREDS_HIDE_SSH_TARGET`, a variable for these tests only
// (a real run never sets it). The scratch target holds a file the command must not see; the record before and after is an `lstat` of each entry.
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Scope } from '../../scripts/lib/leftovers.cjs';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { record, verdict } from '../../scripts/itestHiddenSsh.cjs';
import { SRC_VS_CODE } from './runnerWorld';

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

function hide(target: string, command: string[], extra: { env?: NodeJS.ProcessEnv } = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, '--', ...command], {
    encoding: 'utf8',
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
  // The end-to-end FAIL cannot be provoked from inside the wrapper (a descriptor does not cross the script's spawn, /proc/<pid>/cwd is refused in the
  // user namespace), so the record and the verdict are driven in-process on a scratch folder.
  const target = scratchTarget(t);
  const before = record(target);
  assert.deepEqual([...before.keys()], ['.', 'keep', 'sub', path.join('sub', 'inner')], 'the folder, each entry and each entry of a subfolder');
  assert.deepEqual(verdict(before, record(target)), { ok: true, line: "ok   the person's ~/.ssh was hidden for the run and is unchanged: 3 entries, the same lstat records before and after" });
  fs.writeFileSync(path.join(target, 'leak'), 'x');
  const changed = verdict(before, record(target));
  assert.equal(changed.ok, false);
  assert.match(changed.line, /^FAIL the person's ~\/\.ssh differs after the run \(\d+ records\): .*leak: absent -> file /);
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
