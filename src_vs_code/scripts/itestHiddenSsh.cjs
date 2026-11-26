'use strict';
// Run a command with the person's real `~/.ssh` hidden behind an owned, empty folder (G1 E3.S10, item 3 of the stories document).
//
//   node scripts/itestHiddenSsh.cjs -- <command> [args...]
//
// Why: the `sshd` the rig starts runs as the person, so its passwd home is the real home. OpenSSH 10.2p1 stats `~/.ssh/rc` in every session
// and, in a ForwardAgent leg, binds its forwarded-agent socket in `~/.ssh/agent`; 10.x has no option to move either (an owner-approved strace,
// 2026-11-25). `bwrap --dev-bind / / --bind <owned> <~/.ssh> -- <command>` shows the owned folder at that path, as the same user with the same
// passwd home, so whatever the run reads or writes there lands in the owned folder. It needs no root.
//
// What it does: (1) refuses to start, with exit 2 and a named line, when `bwrap` is missing, when `~/.ssh` is not a directory (it never creates
// one), or when the path inside the wrapper does not show the owned folder (checked by device and inode before the command runs); (2) takes a
// STAT-ONLY record of the real `~/.ssh` (`lstat` of the folder and of each entry, one level into subfolders; no file there is opened or read);
// (3) runs the command with stdio inherited and passes its exit code through; (4) takes the record again and prints
// `ok   ... unchanged` or `FAIL ...` with the difference; (5) prints `info  what the run wrote in place of ~/.ssh: ...`; (6) removes the owned folder.
//
// NOT wrapped, by decision: M10 runs in its own `wslc` container with its own home, and M13 runs `ssh.exe -G` on Windows, which this namespace does not reach.
//
// `CREDS_HIDE_SSH_TARGET=<dir>` replaces `~/.ssh` as the folder that is hidden. It is for the unit tests ONLY, on a scratch folder; a real run never sets it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

const say = (text) => process.stdout.write(`${text}\n`);
const refuse = (text) => {
  process.stderr.write(`refused: ${text}\n`);
  return 2;
};

const typeOf = (st) => (st.isDirectory() ? 'dir' : st.isSymbolicLink() ? 'symlink' : st.isSocket() ? 'socket' : st.isFile() ? 'file' : 'other');
const fact = (st) => `${typeOf(st)} size=${st.size} mode=${(Number(st.mode) & 0o7777).toString(8)} mtime=${st.mtimeNs} ctime=${st.ctimeNs} ino=${st.ino}`;

/** The stat-only record of a folder: name -> facts, for the folder, each entry and each entry of a subfolder. Only `lstat` and a folder listing. */
function record(dir) {
  const rows = new Map([['.', fact(fs.lstatSync(dir, { bigint: true }))]]);
  const walk = (relative, depth) => {
    for (const name of fs.readdirSync(path.join(dir, relative)).sort()) {
      const rel = path.join(relative, name);
      const st = fs.lstatSync(path.join(dir, rel), { bigint: true });
      rows.set(rel, fact(st));
      if (st.isDirectory() && depth < 1) walk(rel, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}

/** The lines that differ between two records. */
function difference(before, after) {
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  return names.filter((name) => before.get(name) !== after.get(name)).map((name) => `${name}: ${before.get(name) ?? 'absent'} -> ${after.get(name) ?? 'absent'}`);
}

/** Every name under a folder with its type, relative: what the run wrote in place of the hidden folder. */
function listing(dir, relative = '') {
  return fs.readdirSync(path.join(dir, relative)).sort().flatMap((name) => {
    const rel = path.join(relative, name);
    const st = fs.lstatSync(path.join(dir, rel));
    return [`${rel} (${typeOf(st)})`, ...(st.isDirectory() ? listing(dir, rel) : [])];
  });
}

const wrapped = (owned, target, command) => ['--dev-bind', '/', '/', '--bind', owned, target, '--', ...command];

/** Runs the command; resolves to its exit code (a signal is 128 + its number). */
const execute = (args) => new Promise((resolve) => {
  const child = spawn('bwrap', args, { stdio: 'inherit' });
  child.on('error', () => resolve(127));
  child.on('exit', (code, signal) => resolve(code ?? 128 + (os.constants.signals[signal] ?? 0)));
});

/** The check line and whether it passed: `ok` when the two records are the same, else `FAIL` with the difference. */
function verdict(before, after) {
  const changes = difference(before, after);
  return changes.length === 0
    ? { ok: true, line: `ok   the person's ~/.ssh was hidden for the run and is unchanged: ${before.size - 1} entries, the same lstat records before and after` }
    : { ok: false, line: `FAIL the person's ~/.ssh differs after the run (${changes.length} records): ${changes.join('; ')}` };
}

const main = async (scope) => {
  const at = process.argv.indexOf('--');
  const command = at < 0 ? [] : process.argv.slice(at + 1);
  if (command.length === 0) return refuse('usage: node scripts/itestHiddenSsh.cjs -- <command> [args...]; no command was given');
  if (process.platform !== 'linux') return refuse(`only Linux has bwrap; this is ${process.platform}`);
  if (spawnSync('bwrap', ['--version'], { stdio: 'ignore' }).status !== 0) return refuse('bwrap is missing or does not run (on Debian or Ubuntu: apt install bubblewrap)');
  const target = process.env.CREDS_HIDE_SSH_TARGET ?? path.join(os.homedir(), '.ssh');
  let before;
  try {
    if (!fs.lstatSync(target).isDirectory()) return refuse('the folder to hide is not a directory (a link or a file is not hidden by this wrapper)');
    before = record(target);
  } catch (error) {
    return refuse(error.code === 'ENOENT' ? 'the folder to hide (~/.ssh) does not exist; it is never created' : `the folder to hide cannot be recorded (${error.code ?? error.message})`);
  }
  const owned = ownedDir(scope, 'hidden-ssh');
  fs.chmodSync(owned, 0o700);
  const seen = spawnSync('bwrap', wrapped(owned, target, ['stat', '-c', '%d:%i', target]), { encoding: 'utf8' });
  const mine = fs.statSync(owned);
  if (seen.status !== 0 || seen.stdout.trim() !== `${mine.dev}:${mine.ino}`) {
    return refuse(`inside the wrapper the hidden path does not show the owned folder (saw ${seen.stdout.trim() || seen.stderr.trim()}, wanted ${mine.dev}:${mine.ino})`);
  }
  say(`info  the hidden folder is shown as an owned, empty folder (device:inode ${mine.dev}:${mine.ino}) for the run of: ${path.basename(command[0])}`);
  const code = await execute(wrapped(owned, target, command));
  const checked = verdict(before, record(target));
  say(checked.line);
  const wrote = listing(owned);
  say(`info  what the run wrote in place of ~/.ssh: ${wrote.length === 0 ? 'nothing' : wrote.join(', ')}`);
  return code !== 0 ? code : checked.ok ? 0 : 1;
};

if (require.main === module) harnessScope.run(main);
module.exports = { record, difference, verdict };
