// The process-tree completion policy of a runner: start `node --test` in a tree of its own, end the WHOLE tree when the
// coordinator has exited or the timeout is reached, and CONFIRM that no descendant is alive before anything is removed.
//
// Why. `spawnSync` waits for the coordinator only. A test's grandchild that outlives it keeps using folders its run
// claimed, and a removal that follows would remove them in use. So the audit that removes may run only after the run has
// PROVED its tree ended (decision [cadence e2d20eab 1] of `todo/PLAN_test_leftovers_E2.md`, D4).
//
// Nothing here re-implements the mechanism: the reference's `tools/lib/proc.mjs` (imported, not copied) owns both halves.
//
//   POSIX    the child is started with `detached: true`, so it leads a process GROUP whose id is its pid. `killTree` signals
//            the group with SIGKILL, and a signal-0 group probe answers `ESRCH` once no member is left (a killed process stays
//            in the table for a moment until its parent or init collects it, so the answer is polled). Where nothing collects it (a
//            container with no init) the kill keeps saying "alive" for a zombie, so on Linux, and only when the kill says "alive",
//            `/proc/*/stat` is read once: a group whose every member is in state `Z` is ended; a scan that cannot be done keeps the
//            answer "alive" [E2.1 code2 7, refined]. A descendant that made
//            a group of its own (`setsid`) is outside this reach; none of this repository's tests does.
//            A descendant that DID leave the group is looked for after the group is gone [E2.1 code 1]: on Linux every process whose
//            environment carries this run's record (`TESTSTODELETE_RUN=<record>`, which every child inherits) is a survivor,
//            wherever it sits in the table; everywhere, `ps -A -o pid=,ppid=` walked from the root gives the processes still
//            parented to it. Survivors are ended with SIGKILL (each bound to its start time and re-verified before it is
//            signalled) and asked about again; what cannot be accounted for keeps the audit at list-and-fail.
//            **macOS (and any POSIX that is not Linux) fails closed** [E2.1 Opus 1]: a detached grandchild whose parent died is
//            reparented to launchd, the parent-pid walk finds nothing, and there is no environment to read — so the scan always
//            adds the entry `no environment scan on this OS`, and nothing is ever removed there. The answer has the reason `no-scan`: a
//            run that claimed a folder lists it and fails; a run that claimed none leaves with the suite's own code, because failing every
//            macOS run for a confirmation the platform cannot give would make the suite unusable there. That entry beside any other, or a
//            live survivor, is still a failure.
//            **A survivor is signalled only with a start time bound** [E2.1 code4 12]: a pid with none (never captured, or already going)
//            cannot be told from a reused number, so it is never killed and, while it is alive, keeps the answer at "not ended".
//            On non-Linux `startOf` is always undefined, so a chain-walk survivor there is no longer killed either; that platform
//            already answers `no-scan` (`no environment scan on this OS`), so nothing is removed there.
//            **What the Linux scan cannot see** [E2.1 Opus]: a descendant that cleared its environment (`env -i`, `execve` with
//            another one) no longer carries the marker, and a non-dumpable or set-uid descendant has an environment the kernel
//            will not show — the latter is a doubt (it fails the run) only when it started after the runner did; the former is
//            invisible. Both are outside what this repository's tests do.
//   Windows  `run(..., { containTree: true })` starts the child under the reference's supervisor (`process-job.ps1`, PowerShell
//            7): a job object with KILL_ON_JOB_CLOSE, so the descendants end when the supervisor leaves, even those whose
//            parent died first (a process-table walk from a dead coordinator would miss exactly those). The reference gives no
//            acknowledgment that the job is EMPTY, and a job has no pid to probe, so `confirmTreeEnded` has nothing to confirm
//            with and answers "not confirmed" (`no-handle`): the audit removes nothing on Windows until the reference offers
//            that acknowledgment (a follow-up, recorded in the plan). The Windows CI leg of `ci-extension.yml`
//            (`runner lifecycle · windows`) observes that the descendant is dead.
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { processProbe } from '../../../.agents/conventions/tools/lib/owned.mjs';
import { MAX_TIMER_MS, killTree, run } from '../../../.agents/conventions/tools/lib/proc.mjs';

/** How long the confirmation waits for the tree to disappear, how often it first asks, and the longest it waits between two questions [E2.1 code 5]. */
export const CONFIRM_TIMEOUT_MS = 5000;
export const CONFIRM_STEP_MS = 50;
export const CONFIRM_MAX_STEP_MS = 1000;

/** The most output the Windows supervisor's stderr may hold before the reference ends the run [E2.1 code 7]: a bound, not "no limit". */
export const SUPERVISOR_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Every `ps` the scan launches has a ceiling and is killed with SIGKILL when it is reached [E2.1 code3 9]: a timeout is "cannot confirm". */
export const PS_TIMEOUT_MS = 5000;

/** The one entry the scan adds on a POSIX that is not Linux, where there is no environment to read [E2.1 Opus 1]. */
export const NO_ENV_SCAN = 'no environment scan on this OS';

const WINDOWS = process.platform === 'win32';

/**
 * A child-like emitter for a supervised run: `exit` or `error` once, `stop()` ends the whole tree. A start that fails — the
 * supervisor cannot be launched, or the promise rejects — is an `error` too, so the caller's wait always settles [E2.1 code2 5].
 * `runFn` is a seam for tests (the reference's `run`).
 */
export function startInJob(command, args, { env, stdio }, runFn = run) {
  const job = new EventEmitter();
  const control = new AbortController();
  job.stop = () => control.abort();
  const inherit = stdio === 'ignore' ? 'ignore' : 'inherit';
  (async () => runFn(command, args, { env, stdout: inherit, timeoutMs: MAX_TIMER_MS, maxOutputBytes: SUPERVISOR_MAX_OUTPUT_BYTES, containTree: true, signal: control.signal }))()
    .then((result) => {
      if (inherit === 'inherit' && result.err !== '') process.stderr.write(result.err);
      if (result.spawnFailed) job.emit('error', new Error(`the supervised start failed (${result.spawnError})`));
      else if (result.overflow) job.emit('error', new Error(`the supervisor wrote more than ${SUPERVISOR_MAX_OUTPUT_BYTES} bytes; the whole tree was ended`));
      else job.emit('exit', result.code, result.signal);
    })
    .catch((error) => job.emit('error', error instanceof Error ? error : new Error(String(error))));
  return job;
}

/**
 * Start `command` as the root of a tree of its own. `spawnFn` is a seam for tests: given, it starts the child (a fake, or a
 * process the test shapes) and is handed `detached` as it would have been used.
 */
export function startInOwnTree(command, args, options, spawnFn) {
  if (spawnFn !== undefined) return spawnFn(command, args, { ...options, detached: !WINDOWS, windowsHide: true });
  if (WINDOWS) return startInJob(command, args, options);
  return spawn(command, args, { ...options, detached: true });
}

/** What the tree is: the group id on POSIX (the child's pid). Nothing for a child with no pid (a supervised run, a fake). */
export function snapshotTree(child) {
  return Number.isSafeInteger(child?.pid) ? { root: child.pid } : undefined;
}

/** Kill the whole tree. Never throws: a tree that is already gone is the goal. */
export function killWholeTree(child, tree) {
  if (typeof child?.stop === 'function') child.stop(); // the supervised run: closing its job ends every descendant
  else if (tree !== undefined) killTree(child);
}

/**
 * The output of one `ps`, through the shared launcher (`run` of the reference: one launcher, and its timeout ends the whole tree
 * [E2.1 code4 9]). Throws — "cannot confirm" — when it cannot be launched, exits non-zero or passes its ceiling.
 */
async function psOutput(args, timeoutMs) {
  const answer = await run('ps', args, { timeoutMs });
  if (answer.timedOut) throw new Error(`ps timed out after ${timeoutMs} ms`);
  if (answer.spawnFailed || answer.code !== 0 || typeof answer.out !== 'string') throw new Error('the process table could not be read');
  return answer.out;
}

/** How many members of the POSIX group `pgid` the process table shows (1 when it cannot be counted). Runs `ps`: only for an answer that must say how many. */
async function groupMembers(pgid) {
  try {
    return Math.max(1, (await psOutput(['-A', '-o', 'pgid='], PS_TIMEOUT_MS)).split('\n').filter((line) => Number(line.trim()) === pgid).length);
  } catch {
    return 1;
  }
}

/**
 * Is every member of the group `pgid` a zombie? Reads `<procRoot>/<pid>/stat` once per process. A zombie is dead and holds nothing; it
 * stays in the table, and so keeps the group "alive" for `kill(-pgid, 0)`, until its parent or init collects it — a container with no
 * init never does. Fails closed: `false` unless at least one member was seen and every member seen is in state `Z`. A table that
 * cannot be listed, a `stat` that cannot be read (other than a process that just left) or understood, and a group with no member in
 * the table (the scan is blind, or the group ended a moment ago, which the next probe says) are all "not only zombies".
 */
function onlyZombies(pgid, procRoot) {
  let names;
  try {
    names = fs.readdirSync(procRoot);
  } catch {
    return false;
  }
  let members = 0;
  for (const name of names) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    let stat;
    try {
      stat = fs.readFileSync(`${procRoot}/${name}/stat`, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ESRCH') continue; // it left between the listing and the read
      return false;
    }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // state, ppid, pgrp, ...: cut after the LAST `)`, the name may hold one
    if (stat.lastIndexOf(')') === -1 || !/^[A-Za-z]$/.test(fields[0]) || !/^[0-9]+$/.test(fields[2] ?? '')) return false;
    if (Number(fields[2]) !== pgid) continue;
    if (fields[0] !== 'Z') return false;
    members += 1;
  }
  return members > 0;
}

/**
 * Is anyone in the group? One `kill(-pgid, 0)`, no process listing: `ESRCH` is the empty group [E2.1 code2 7]. Only on Linux, and only
 * when that kill says "alive", `/proc` is read ONCE: a group of zombies only is ended (this REFINES [E2.1 code2 7], it does not
 * replace it: the kill stays the cheap common answer). Another OS keeps the kill's answer. `platform` and `procRoot` are seams.
 */
function groupAlive(tree, { platform = process.platform, procRoot = '/proc' } = {}) {
  try {
    process.kill(-tree.root, 0);
  } catch (error) {
    return error?.code === 'EPERM';
  }
  return !(platform === 'linux' && onlyZombies(tree.root, procRoot));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until no member of the tree is alive, or `timeoutMs` passes: `{ ended: true, alive: 0 }`, or `{ ended: false, alive: <n> }`.
 * The question is a bare probe, repeated with a backoff (`stepMs` doubling to `maxStepMs`) whose last wait is cut to what the bound
 * leaves; members are counted (`count`, a `ps`) only for the answer that is not "ended" [E2.1 code 5, code2 7]. `probe`, `count`,
 * `now`, `pause`, `platform` and `procRoot` are seams for tests.
 *
 * With no handle on the tree — a supervised run, whose job has no pid, or a fake — there is nothing to ask, and the answer is NOT
 * "ended": `{ ended: false, alive: 0, reason: 'no-handle' }` [E2.1 risk 2]. The same on Windows even when a pid is given (a spawn
 * seam): `kill(-pid, 0)` proves nothing there. A confirmation that cannot confirm is not a confirmation.
 */
export async function confirmTreeEnded(tree, { timeoutMs = CONFIRM_TIMEOUT_MS, stepMs = CONFIRM_STEP_MS, maxStepMs = CONFIRM_MAX_STEP_MS, platform = process.platform, procRoot = '/proc', probe = () => groupAlive(tree, { platform, procRoot }), count = () => groupMembers(tree.root), now = Date.now, pause: wait = pause } = {}) {
  if (tree === undefined || platform === 'win32') return { ended: false, alive: 0, reason: 'no-handle' };
  const deadline = now() + timeoutMs;
  let step = stepMs;
  let alive = probe();
  while (alive && now() < deadline) {
    await wait(Math.min(step, deadline - now()));
    step = Math.min(step * 2, maxStepMs);
    alive = probe();
  }
  return alive ? { ended: false, alive: await count() } : { ended: true, alive: 0 };
}

/** The process table, read ONCE per scan: `children` is `ppid -> [pid]` (each list built once and pushed to), `known` every pid listed. Throws when it cannot be read. */
async function readTable(timeoutMs) {
  const children = new Map();
  const known = new Set();
  for (const line of (await psOutput(['-A', '-o', 'pid=,ppid='], timeoutMs)).split('\n')) {
    const [pid, parent, ...rest] = line.trim().split(/\s+/).map(Number);
    if (rest.length !== 0 || !Number.isSafeInteger(pid) || !Number.isSafeInteger(parent)) continue;
    known.add(pid);
    const list = children.get(parent);
    if (list === undefined) children.set(parent, [pid]);
    else list.push(pid);
  }
  return { children, known };
}

/** Everything the parent-pid chain reaches below `root`, from one adjacency map. */
function chainBelow(root, children) {
  const found = [root];
  for (const pid of found) for (const child of children.get(pid) ?? []) if (!found.includes(child)) found.push(child);
  return found.slice(1);
}

/** Does the NUL-separated environment `block` hold `entry` as one WHOLE entry? Searched in place: nothing is concatenated or copied. */
function holdsEntry(block, entry) {
  for (let start = 0; start <= block.length; ) {
    const stop = block.indexOf(0, start);
    const end = stop === -1 ? block.length : stop;
    if (end - start === entry.length && block.compare(entry, 0, entry.length, start, end) === 0) return true;
    start = end + 1;
  }
  return false;
}

/** Whether `/proc/<pid>` belongs to the caller: only a process of ours is one whose unreadable environment leaves a doubt. */
function isOursDefault(procRoot, name) {
  try {
    return fs.statSync(`${procRoot}/${name}`).uid === process.getuid();
  } catch {
    return false;
  }
}

/**
 * Can a process that started before the run have been started BY it? No: so an unreadable environment of such a process (a
 * hardened daemon of the same user — `systemd --user` is one) leaves no doubt. With no way to date it, it does.
 */
function startedBeforeRun(name, since, startOf) {
  if (since === undefined || typeof startOf !== 'function') return false;
  const start = startOf(Number(name));
  return start !== undefined && start < since;
}

/** Is `/proc/<name>` a zombie or already dead? It holds no folder, and its environment is unreadable by the kernel's own rule. */
function isDefunct(procRoot, name) {
  try {
    const stat = fs.readFileSync(`${procRoot}/${name}/stat`, 'utf8');
    return /^[ZXx]/.test(stat.slice(stat.lastIndexOf(')') + 2));
  } catch {
    return false;
  }
}

/**
 * Read one environment: the block; `'gone'` for a process that is not (or no longer) there; `'foreign'` for one that is not ours
 * (checked BEFORE any retry [E2.1 code3 11]); or `'unreadable'` after a few awaited retries (a process in the middle of an exec is
 * unreadable for a moment). The wait is a promise, never a blocking sleep [E2.1 code3 3/6].
 */
async function readEnviron(procRoot, name, { ours, wait }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return fs.readFileSync(`${procRoot}/${name}/environ`);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ESRCH' || isDefunct(procRoot, name)) return 'gone';
      if (!ours(name)) return 'foreign';
      if (attempt < 3) await wait(5);
    }
  }
  return 'unreadable';
}

/**
 * Linux: `{ pids, unverified }` — the processes whose environment carries exactly `TESTSTODELETE_RUN=<record>`, and what could not be
 * looked at. Only the pids the process table lists are read or dated [E2.1 code3 7]; with no table (`known` undefined) all are.
 */
async function markedByRecord(record, procRoot, { since, startOf, known, ours, wait }) {
  const entry = Buffer.from(`TESTSTODELETE_RUN=${record}`);
  const found = { pids: [], unverified: [] };
  let names;
  try {
    names = fs.readdirSync(procRoot);
  } catch (error) {
    return { pids: [], unverified: [`${procRoot} cannot be listed (${error?.code ?? 'error'})`] };
  }
  for (const name of names) {
    if (!/^[1-9][0-9]*$/.test(name) || (known !== undefined && !known.has(Number(name)))) continue;
    const block = await readEnviron(procRoot, name, { ours, wait });
    if (block === 'gone' || block === 'foreign') continue;
    if (block === 'unreadable') {
      if (!startedBeforeRun(name, since, startOf)) found.unverified.push(`${procRoot}/${name}/environ cannot be read`);
    } else if (holdsEntry(block, entry)) {
      found.pids.push(Number(name));
    }
  }
  return found;
}

/**
 * The processes of this run that are still alive after its group was killed, read ONCE: `{ pids, unverified }` [E2.1 code 1,
 * code2 4, 6/11]. The parent-pid chain below `rootPid` (from one `ps -A -o pid=,ppid=`), and on Linux every process whose
 * environment carries the run's record as a whole entry; on any other POSIX the scan has no environment to read and says so with a
 * fixed `unverified` entry, so nothing is removed and the answer is `no-scan` [E2.1 Opus 1]. Never this process. `unverified` names what could not be
 * looked at (a table that cannot be read or passed its `ps` ceiling, an unreadable /proc, a process of ours that started after
 * `since` and whose environment cannot be read); it never throws, and the other half of the scan still runs. Windows answers
 * nothing: its job ends them. `table`, `ours`, `pause`, `procRoot`, `platform` and `psTimeoutMs` are seams.
 */
export async function findSurvivors({ rootPid, record, platform = process.platform, procRoot = '/proc', since, startOf, psTimeoutMs = PS_TIMEOUT_MS, table = () => readTable(psTimeoutMs), ours = (name) => isOursDefault(procRoot, name), pause: wait = pause }) {
  if (platform === 'win32') return { pids: [], unverified: [] };
  const result = { pids: new Set(), unverified: [] };
  let known;
  try {
    const listed = await table();
    known = listed.known;
    if (Number.isSafeInteger(rootPid) && rootPid > 0) for (const pid of chainBelow(rootPid, listed.children)) result.pids.add(pid);
  } catch (error) {
    result.unverified.push(String(error?.message ?? error));
  }
  if (platform !== 'linux') {
    result.unverified.push(NO_ENV_SCAN);
  } else if (typeof record === 'string' && record !== '') {
    const marked = await markedByRecord(record, procRoot, { since, startOf, known, ours, wait });
    for (const pid of marked.pids) result.pids.add(pid);
    result.unverified.push(...marked.unverified);
  }
  result.pids.delete(process.pid);
  return { pids: [...result.pids], unverified: result.unverified };
}

function killPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/**
 * Is `pid` a live process? `ESRCH` says no; a refusal (`EPERM`) says there is one. On Linux a zombie answers the signal but runs nothing, so it
 * has ended, as in `groupAlive` and `readEnviron`; a `stat` that cannot be read keeps "alive" [E2.1 review 8].
 */
function pidAliveDefault(pid) {
  try {
    process.kill(pid, 0);
    return !(process.platform === 'linux' && isDefunct('/proc', String(pid)));
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** The start of `pid` in Unix seconds, from the reference's probe (Linux only; `undefined` elsewhere and for a process that is not there). */
const startOfDefault = (pid) => processProbe(pid).start;

/**
 * Scan for survivors ONCE, bind each to its start time, end the ones found and poll only those pids (with the same backoff) until
 * they are dead or `timeoutMs` passes [E2.1 code3 10]: a pid whose start time changed since the scan is another process (the
 * number was reused) — never signalled, and no longer a survivor. Anything the scan could not look at keeps the answer at "cannot
 * confirm", and its causes are kept even when known survivors remain [E2.1 code3 5].
 */
async function settle({ rootPid, record, since, startOf, platform, survivors, pidAlive, kill, timeoutMs }) {
  const { pids, unverified } = await survivors({ rootPid, record, since, startOf, platform });
  const bound = new Map(pids.map((pid) => [pid, startOf(pid)]));
  // A pid is the run's survivor only while its start time still matches the one bound at the scan. A pid with NO bound start (it
  // was not captured, or the process was already going) can never be told from a reused number: it is never signalled, and while it
  // is alive it keeps the answer at "not ended" [E2.1 code4 12].
  const bounded = (pid) => bound.get(pid) !== undefined;
  const same = (pid) => bounded(pid) && startOf(pid) === bound.get(pid);
  const stillOurs = (pid) => pidAlive(pid) && (!bounded(pid) || same(pid));
  const deadline = Date.now() + timeoutMs;
  let step = CONFIRM_STEP_MS;
  let remaining = pids;
  while (remaining.length > 0) {
    for (const pid of remaining) if (same(pid)) kill(pid);
    remaining = remaining.filter(stillOurs);
    if (remaining.length === 0 || Date.now() >= deadline) break;
    await pause(Math.min(step, deadline - Date.now()));
    step = Math.min(step * 2, CONFIRM_MAX_STEP_MS);
  }
  const cause = unverified.length > 0 ? { cause: unverified.join('; ') } : {};
  if (remaining.length > 0) return { ended: false, alive: remaining.length, ...cause };
  // The fixed entry ALONE is not a failure of the scan: it is what this OS can never do. It has a reason of its own, so the runner can tell
  // it from a scan that broke (the entry beside any other one, or a known live survivor, still fails the run) [E2.1 Opus 1, refined].
  if (unverified.length > 0) return { ended: false, alive: 0, reason: unverified.every((entry) => entry === NO_ENV_SCAN) ? 'no-scan' : 'unknown', ...cause };
  return { ended: true, alive: 0 };
}

/**
 * End the tree of `child` and report whether that is PROVEN: snapshot, kill the group, confirm it is empty, then look once for
 * what left it and end that too. The group is signalled and the chain walked ONLY while the group still has members: once it is
 * gone its id (the coordinator's pid) may belong to somebody else [E2.1 code3 10]. Never throws: anything that goes wrong is "cannot
 * confirm" (`reason: 'unknown'`), because a cleanup that throws would hide the suite's own verdict [E2.1 code 4]. `confirm`,
 * `survivors`, `pidAlive`, `kill`, `killGroup`, `startOf` and `platform` are seams for tests.
 */
export async function endTree(child, { confirm = confirmTreeEnded, survivors = findSurvivors, pidAlive = pidAliveDefault, kill = killPid, killGroup = killWholeTree, record, since = startOfDefault(process.pid), startOf = startOfDefault, platform = process.platform, settleTimeoutMs = CONFIRM_TIMEOUT_MS } = {}) {
  try {
    const tree = snapshotTree(child);
    const groupLive = tree !== undefined && groupAlive(tree, { platform });
    if (groupLive || typeof child?.stop === 'function') killGroup(child, tree); // a supervised run is stopped through its job, which has no pid
    const group = await confirm(tree);
    if (!group.ended) return group;
    return await settle({ rootPid: groupLive ? child?.pid : undefined, record, since, startOf, platform, survivors, pidAlive, kill, timeoutMs: settleTimeoutMs });
  } catch (error) {
    return { ended: false, alive: 0, reason: 'unknown', cause: String(error?.message ?? error) };
  }
}
