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
// one), when `$HOME` is not the passwd home, or when the path inside the wrapper does not show the owned folder (checked by device and inode before the command runs); (2) takes a
// STAT-ONLY record of the real `~/.ssh` (`lstat` of the folder and of each entry, one level into subfolders; no file there is opened or read);
// (3) runs the command (stdout and stderr inherited, stdin closed) as the root of a process tree of its own, with a LIMIT, and passes its exit code through; when the
// limit passes the whole tree is ended and a `FAIL the wrapped command did not end within ...` line is printed (exit 1); (4) takes the record again and prints
// `ok   ... unchanged` or `FAIL ...` with the difference; (5) prints `info  what the run wrote in place of ~/.ssh: ...`; (6) removes the owned folder.
//
// NOT wrapped, by decision: M10 runs in its own `wslc` container with its own home, and M13 runs `ssh.exe -G` on Windows, which this namespace does not reach.
//
// The target is `<the passwd home>/.ssh` (`os.userInfo().homedir`), because `ssh` and `sshd` read the passwd home and never `$HOME`; when `$HOME` names another folder the
// wrapper refuses (exit 2): it would hide a folder the run does not use.
//
// Two variables are for the unit tests ONLY, on a scratch folder; a real run never sets either:
//   `CREDS_HIDE_SSH_TARGET=<dir>` replaces `~/.ssh` as the folder that is hidden (and turns the `$HOME` check off);
//   `CREDS_HIDE_SSH_LIMIT_MS=<ms>` replaces the limit of the wrapped command.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

/** How long the wrapped command may run: it must exceed the longest wrapped run (the rig takes about 8 minutes). The unit tests shorten it with `CREDS_HIDE_SSH_LIMIT_MS`. */
const WRAPPED_LIMIT_MS = 30 * 60 * 1000;

/** The limit of each of the two short checks that run before the command (`bwrap --version`, the `stat` inside the wrapper). */
const CHECK_LIMIT_MS = 30_000;

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

/** The bwrap argv. `--die-with-parent`: when this process ends by any way (a SIGKILL included) the wrapped command is killed with it. */
const wrapped = (owned, target, command) => ['--die-with-parent', '--dev-bind', '/', '/', '--bind', owned, target, '--', ...command];

/**
 * Runs the command as the root of a process tree of its own (`lib/processTree.mjs`, the launcher of the runners), for at most `limitMs`. Resolves to
 * `{ code, timedOut, ended }`: the exit code (a signal is 128 + its number; a command that cannot start is 127), whether the limit passed, and, then, the
 * answer of `endTree` (`ended` true only when no process of the tree is left). The scope ends the tree on any other way out too (a signal, an error).
 */
async function execute(scope, args, limitMs) {
  const tree = await import('./lib/processTree.mjs');
  const child = tree.startInOwnTree('bwrap', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  scope.after(() => tree.endTree(child));
  let timedOut = false;
  const exited = new Promise((resolve) => {
    child.once('error', () => resolve(127));
    child.once('exit', (code, signal) => resolve(code ?? 128 + (os.constants.signals[signal] ?? 0)));
  });
  const timer = setTimeout(() => {
    timedOut = true;
    tree.killWholeTree(child, tree.snapshotTree(child));
  }, limitMs);
  const code = await exited;
  clearTimeout(timer);
  return timedOut ? { code, timedOut, ended: (await tree.endTree(child)).ended } : { code, timedOut, ended: undefined };
}

/** The limit of the wrapped command: the constant, or the tests' `CREDS_HIDE_SSH_LIMIT_MS` (a whole number of milliseconds, 1 to 2^31-1). `undefined` when that is not one. */
function limitOf(env) {
  const given = env.CREDS_HIDE_SSH_LIMIT_MS;
  if (given === undefined) return WRAPPED_LIMIT_MS;
  const ms = Number(given);
  return /^[1-9][0-9]*$/.test(given) && ms <= 2_147_483_647 ? ms : undefined;
}

/** The FAIL line of a command that passed its limit. */
const timeoutLine = (limitMs, ended) => `FAIL the wrapped command did not end within ${limitMs} ms; its whole process tree was ended${ended ? ' and confirmed gone' : ' but the end is NOT confirmed'}`;

/** The check line and whether it passed: `ok` when the two records are the same, else `FAIL` with the difference. */
function verdict(before, after) {
  const changes = difference(before, after);
  return changes.length === 0
    ? { ok: true, line: `ok   the person's ~/.ssh was hidden for the run and is unchanged: ${before.size - 1} entries, the same lstat records before and after` }
    : { ok: false, line: `FAIL the person's ~/.ssh changed during the run (${changes.length} records; the run could not reach it, so a writer outside the run, such as the person's own ssh, may be the cause): ${changes.join('; ')}` };
}

const main = async (scope) => {
  const at = process.argv.indexOf('--');
  const command = at < 0 ? [] : process.argv.slice(at + 1);
  if (command.length === 0) return refuse('usage: node scripts/itestHiddenSsh.cjs -- <command> [args...]; no command was given');
  if (process.platform !== 'linux') return refuse(`only Linux has bwrap; this is ${process.platform}`);
  const limitMs = limitOf(process.env);
  if (limitMs === undefined) return refuse('CREDS_HIDE_SSH_LIMIT_MS (tests only) is not a whole number of milliseconds from 1 to 2147483647');
  const passwdHome = os.userInfo().homedir;
  if (process.env.CREDS_HIDE_SSH_TARGET === undefined && path.resolve(process.env.HOME ?? '') !== path.resolve(passwdHome)) {
    return refuse(`$HOME (${process.env.HOME ?? 'unset'}) is not the passwd home (${passwdHome}), and ssh and sshd read the passwd home: the folder this run uses is not the one that would be hidden`);
  }
  if (spawnSync('bwrap', ['--version'], { stdio: 'ignore', timeout: CHECK_LIMIT_MS, killSignal: 'SIGKILL' }).status !== 0) return refuse('bwrap is missing or does not run (on Debian or Ubuntu: apt install bubblewrap)');
  const target = process.env.CREDS_HIDE_SSH_TARGET ?? path.join(passwdHome, '.ssh');
  let before;
  try {
    if (!fs.lstatSync(target).isDirectory()) return refuse('the folder to hide is not a directory (a link or a file is not hidden by this wrapper)');
    before = record(target);
  } catch (error) {
    return refuse(error.code === 'ENOENT' ? 'the folder to hide (~/.ssh) does not exist; it is never created' : `the folder to hide cannot be recorded (${error.code ?? error.message})`);
  }
  const owned = ownedDir(scope, 'hidden-ssh');
  fs.chmodSync(owned, 0o700);
  const seen = spawnSync('bwrap', wrapped(owned, target, ['stat', '-c', '%d:%i', target]), { encoding: 'utf8', timeout: CHECK_LIMIT_MS, killSignal: 'SIGKILL' });
  const mine = fs.statSync(owned);
  if (seen.status !== 0 || seen.stdout.trim() !== `${mine.dev}:${mine.ino}`) {
    return refuse(`inside the wrapper the hidden path does not show the owned folder (saw ${seen.stdout.trim() || seen.stderr.trim()}, wanted ${mine.dev}:${mine.ino})`);
  }
  say(`info  the hidden folder is shown as an owned, empty folder (device:inode ${mine.dev}:${mine.ino}) for the run of: ${path.basename(command[0])}`);
  const outcome = await execute(scope, wrapped(owned, target, command), limitMs);
  const checked = verdict(before, record(target));
  if (outcome.timedOut) say(timeoutLine(limitMs, outcome.ended));
  say(checked.line);
  const wrote = listing(owned);
  say(`info  what the run wrote in place of ~/.ssh: ${wrote.length === 0 ? 'nothing' : wrote.join(', ')}`);
  if (outcome.timedOut) return 1;
  return outcome.code !== 0 ? outcome.code : checked.ok ? 0 : 1;
};

if (require.main === module) harnessScope.run(main);
module.exports = { record, difference, verdict, wrapped };
