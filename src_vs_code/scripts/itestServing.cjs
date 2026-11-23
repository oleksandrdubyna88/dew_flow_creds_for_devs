// The serving launcher of the real runs (G1, E3.S2; decision 16 of `todo/PLAN_person_roads_pin_host_key.md`): the ONE starter of every
// counterpart of a row of E3, moved here from `itestPinnedRoads.cjs` (section 10) so that every row file reaches it and its stops.
//
// `startServingSshd` starts one `sshd -D -e`, which serves EVERY connection, with the run's executable and config lines (`RUN` of
// `itestSshd.cjs`, read from `lib/sshdRun.cjs`) and, after them, the caller's own lines. It records the program the listener runs
// (`/proc/<pid>/exe`: path and SHA-256) in `program.json` beside the config, for the record of identities (`itestIdentities.cjs`).
// Two ends: `stopListener` ends the LISTENER alone, by its own pid, and leaves alive what it forked for a session (a master connection
// outlives it: the instrument of M3); `endServer` ends a server and everything it forked, and stays the end of a leg.
//
// Linux only: the process identities read `/proc`. Every pid is signalled only while its start time is the recorded one.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, RUN, launch, endChild, freePort, listeningFailure } = require('./itestSshd.cjs');
const { within } = require('./itestNoSharing.cjs');
const { servingConfig } = require('./lib/sshdRun.cjs');

/** One start of the listener, waited for (10 s) by its "Server listening" line; once it listens, the program it runs is recorded. */
async function startOnce(rig, dir, hostKey, given) {
  const { port, penalties, extra } = given;
  const config = path.join(dir, 'sshd_config');
  fs.writeFileSync(config, servingConfig(RUN, { port, hostKey, authorizedKeys: rig.authorizedKeys, pidFile: path.join(dir, 'sshd.pid'), penalties, extra }));
  const sshd = launch(rig.scope, SSHD, ['-D', '-e', '-f', config]);
  // The listener's identity, taken at once: the pid and the start time it has from the fork on. Once `sshd.exited` its pid may be another process's.
  const identity = { pid: sshd.child.pid, start: startOf(sshd.child.pid) };
  const listening = new RegExp(String.raw`Server listening on 127\.0\.0\.1 port ${port}`);
  const failure = await listeningFailure(sshd, listening, Date.now() + 10_000);
  return { sshd, identity, port, failure, program: failure === undefined ? recordProgram(dir, identity) : undefined };
}

/**
 * The program a process runs, as the kernel answers it: the path of `/proc/<pid>/exe` and the SHA-256 of its bytes (read through that link, so
 * a wrapper that `exec`s sshd answers sshd). Only while `one` (`{ pid, start }`) is the same process, before the read and after it; else
 * `undefined`. Never throws.
 */
function programOf(one) {
  if (!alive(one)) {
    return undefined;
  }
  try {
    const exe = fs.readlinkSync(`/proc/${one.pid}/exe`);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(`/proc/${one.pid}/exe`)).digest('hex');
    return alive(one) ? { exe, sha256 } : undefined;
  } catch {
    return undefined;
  }
}

/** The listener's program, written as `program.json` beside its config (the record of identities reads it), and answered. */
function recordProgram(dir, identity) {
  const program = { pid: identity.pid, start: identity.start, ...(programOf(identity) ?? { exe: null, sha256: null }) };
  fs.writeFileSync(path.join(dir, 'program.json'), `${JSON.stringify(program)}\n`);
  return program;
}

/**
 * One `sshd -D -e` that serves EVERY connection to 127.0.0.1:`port` (a free port when none is given), in a folder `name` of its own: the
 * serving launcher, the one starter of every counterpart of a row (`startSshd` of `itestSshd.cjs` runs `sshd -d`, which serves one
 * connection). Its config is `servingConfig` of `lib/sshdRun.cjs`: the run's lines, then `extra`, the caller's own (a row's forced command).
 * Once more without `PerSourcePenalties no` when this sshd does not know the word, and once more after 300 ms when the port is still held
 * (K2 on K1's port: the same port; a free port taken here: a fresh one). `launch` registers the listener's end with the scope; `endServer` is
 * the leg's own, first.
 */
async function startServingSshd(rig, name, hostKey, port, extra = []) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  let given = { port: port ?? (await freePort()), penalties: true, extra };
  let started = await startOnce(rig, dir, hostKey, given);
  if (started.failure !== undefined && /PerSourcePenalties/.test(started.sshd.stderr)) {
    console.log(`info  ${name}: this sshd does not know PerSourcePenalties (before 9.8 it has none); started without the line`);
    await endChild(started.sshd);
    given = { ...given, penalties: false };
    started = await startOnce(rig, dir, hostKey, given);
  }
  if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
    await endChild(started.sshd);
    await new Promise((resolve) => setTimeout(resolve, 300));
    given = { ...given, port: port ?? (await freePort()) };
    started = await startOnce(rig, dir, hostKey, given);
  }
  return started;
}

/** The start time of a running process (field 22 of `/proc/<pid>/stat`), or `undefined` when it does not run or is a zombie. */
function startOf(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // fields[0] is field 3, the state
    return fields[0] === 'Z' ? undefined : fields[19];
  } catch {
    return undefined;
  }
}

/** Whether `one` (`{ pid, start }`) still runs as the SAME process: a reused pid has another start time. */
const alive = (one) => one.start !== undefined && startOf(one.pid) === one.start;

/** Every pid below `pid` in the table `children` (parent → its children), each once. */
function below(children, pid) {
  return (children.get(pid) ?? []).flatMap((child) => [child, ...below(children, child)]);
}

/**
 * Every process below `root` now, with its start time: `ps -e -o pid=,ppid=`, walked from `root`. Answers `{ list, error }`: a `ps` that
 * failed is an `error` (the list is then empty and proves nothing), never a quiet empty list.
 */
async function descendantsOf(root) {
  const table = await new Promise((resolve) => {
    // The PATH lookup is on purpose, as `tool` does: `ps` of the machine the run is on.
    execFile('ps', ['-e', '-o', 'pid=,ppid='], { timeout: 5_000 }, (error, stdout) => resolve(error ? { error: String(error) } : { text: String(stdout) })); // NOSONAR: a CI rig
  });
  if (table.error !== undefined) {
    return { list: [], error: `ps failed: ${table.error}` };
  }
  const children = new Map();
  for (const line of table.text.trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  return { list: below(children, root).map((pid) => ({ pid, start: startOf(pid) })).filter((one) => one.start !== undefined), error: undefined };
}

/** A signal to every one of `list` that still runs as the same process. */
function signalAll(list, signal) {
  for (const one of list.filter(alive)) {
    try {
      process.kill(one.pid, signal);
    } catch {
      // it ended between the look and the signal
    }
  }
}

const noneAlive = (ms, list) => within(ms, () => !list.some(alive));

/**
 * What the listener of `server` forked, now, as `descendantsOf` answers: `{ list, error }`. Only while it is still the SAME listener: once its
 * `sshd` exited (its pid may be reused) nothing is listed, and a listener that was gone by the end of the `ps` snapshot (the table may then
 * be a foreign process's) gives an empty list too; the processes the leg recorded while it ran are the caller's `taken`.
 */
async function descendantsOfListener(server) {
  const same = () => !server.sshd.exited && alive(server.identity);
  if (!same()) {
    return { list: [], error: undefined };
  }
  const seen = await descendantsOf(server.identity.pid);
  return same() ? seen : { list: [], error: seen.error }; // a changed listener lists nothing, but a failed `ps` stays a failure
}

/**
 * Ends the LISTENER of a serving sshd ALONE, by its own pid (`endChild`: SIGTERM, then SIGKILL after 5 s), never by its process group, and
 * leaves alive what it forked for a session: the session of a master connection outlives it (the plan's *The stop of the listener alone*, M3).
 * What it forked is listed FIRST, while it is still its descendant: afterwards nothing this run holds has it below it. Answers
 * `{ taken, stopped }`: `taken` is that `{ list, error }`, which the leg hands to `endServer` when it has read what it needs; `stopped` is
 * true when the listener exited and its pid is no longer the same process. Never throws.
 */
async function stopListener(server) {
  const taken = await descendantsOfListener(server);
  await endChild(server.sshd);
  return { taken, stopped: server.sshd.exited && !alive(server.identity) };
}

/**
 * Ends a serving sshd and everything it forked, bounded: (a) its descendants are listed now (`descendantsOfListener`: never the descendants
 * of a pid that sshd no longer has), beside `taken` (a list made earlier, before a client was ended: afterwards a remote command is no
 * descendant any more); (b) the clients still running are ended by their recorded pids;
 * (c) at most 3 s for the rest to go with them; (d) TERM to what is left, at most 2 s, then KILL, at most 2 s, each only to a pid whose start
 * time is still the recorded one; (e) the listener, by `endChild`. `taken` is `{ list, error }` of an earlier `descendantsOf`. Answers
 * `{ list, error }`, for T21 and T39: an `error` of either listing makes the check fail. Never throws.
 */
async function endServer(server, clients, taken) {
  const now = await descendantsOfListener(server);
  const list = [...taken.list, ...now.list];
  const error = taken.error ?? now.error;
  signalAll(clients, 'SIGTERM');
  if (!(await noneAlive(3_000, list))) {
    signalAll(list, 'SIGTERM');
    if (!(await noneAlive(2_000, list))) {
      signalAll(list, 'SIGKILL');
      await noneAlive(2_000, list);
    }
  }
  await endChild(server.sshd);
  return { list, error };
}

module.exports = { startServingSshd, stopListener, endServer, startOf, alive, programOf, descendantsOfListener };
