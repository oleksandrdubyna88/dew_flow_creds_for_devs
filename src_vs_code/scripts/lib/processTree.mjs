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
//            in the table for a moment until its parent or init collects it, so the answer is polled). A descendant that made
//            a group of its own (`setsid`) is outside this reach; none of this repository's tests does.
//            A descendant that DID leave the group is looked for after the group is gone [E2.1 code 1]: on Linux every process whose
//            environment carries this run's record (`TESTSTODELETE_RUN=<record>`, which every child inherits) is a survivor,
//            wherever it sits in the table; everywhere, `ps -A -o pid=,ppid=` walked from the root gives the processes still
//            parented to it. Survivors are ended with SIGKILL and asked about again; what cannot be accounted for keeps the
//            audit at list-and-fail. Not seen: on macOS a session-leader whose parent died is reparented to launchd and carries
//            no marker `ps` can read cheaply — recorded in the plan as an open point.
//   Windows  `run(..., { containTree: true })` starts the child under the reference's supervisor (`process-job.ps1`, PowerShell
//            7): a job object with KILL_ON_JOB_CLOSE, so the descendants end when the supervisor leaves, even those whose
//            parent died first (a process-table walk from a dead coordinator would miss exactly those). The reference gives no
//            acknowledgment that the job is EMPTY, and a job has no pid to probe, so `confirmTreeEnded` has nothing to confirm
//            with and answers "not confirmed" (`no-handle`): the audit removes nothing on Windows until the reference offers
//            that acknowledgment (a follow-up, recorded in the plan). The Windows CI leg of `ci-extension.yml`
//            (`runner lifecycle · windows`) observes that the descendant is dead.
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { MAX_TIMER_MS, killTree, run } from '../../../.claude/rules/shared/tools/lib/proc.mjs';

/** How long the confirmation waits for the tree to disappear, how often it first asks, and the longest it waits between two questions [E2.1 code 5]. */
export const CONFIRM_TIMEOUT_MS = 5000;
export const CONFIRM_STEP_MS = 50;
export const CONFIRM_MAX_STEP_MS = 1000;

/** The most output the Windows supervisor's stderr may hold before the reference ends the run [E2.1 code 7]: a bound, not "no limit". */
export const SUPERVISOR_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

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

/** How many members of the POSIX group `pgid` the process table shows (1 when it cannot be counted). Spawns `ps`: only for an answer that must say how many. */
function groupMembers(pgid) {
  const table = spawnSync('ps', ['-A', '-o', 'pgid='], { encoding: 'utf8' });
  if (table.status !== 0 || typeof table.stdout !== 'string') return 1;
  return Math.max(1, table.stdout.split('\n').filter((line) => Number(line.trim()) === pgid).length);
}

/** Is anyone in the group? One `kill(-pgid, 0)`, no process listing: `ESRCH` is the empty group [E2.1 code2 7]. */
function groupAlive(tree) {
  try {
    process.kill(-tree.root, 0);
  } catch (error) {
    return error?.code === 'EPERM';
  }
  return true;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until no member of the tree is alive, or `timeoutMs` passes: `{ ended: true, alive: 0 }`, or `{ ended: false, alive: <n> }`.
 * The question is a bare probe, repeated with a backoff (`stepMs` doubling to `maxStepMs`) whose last wait is cut to what the bound
 * leaves; members are counted (`count`, a `ps`) only for the answer that is not "ended" [E2.1 code 5, code2 7]. `probe`, `count`,
 * `now` and `pause` are seams for tests.
 *
 * With no handle on the tree — a supervised run, whose job has no pid, or a fake — there is nothing to ask, and the answer is NOT
 * "ended": `{ ended: false, alive: 0, reason: 'no-handle' }` [E2.1 risk 2]. A confirmation that cannot confirm is not a confirmation.
 */
export async function confirmTreeEnded(tree, { timeoutMs = CONFIRM_TIMEOUT_MS, stepMs = CONFIRM_STEP_MS, maxStepMs = CONFIRM_MAX_STEP_MS, probe = () => groupAlive(tree), count = () => groupMembers(tree.root), now = Date.now, pause: wait = pause } = {}) {
  if (tree === undefined) return { ended: false, alive: 0, reason: 'no-handle' };
  const deadline = now() + timeoutMs;
  let step = stepMs;
  let alive = probe();
  while (alive && now() < deadline) {
    await wait(Math.min(step, deadline - now()));
    step = Math.min(step * 2, maxStepMs);
    alive = probe();
  }
  return alive ? { ended: false, alive: count() } : { ended: true, alive: 0 };
}

/** The process table as one adjacency map `ppid -> [pid]`, read ONCE per scan. Throws when it cannot be read: a table that is not there is not an empty one. */
function childrenByParent() {
  const table = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  if (table.error || table.status !== 0 || typeof table.stdout !== 'string') throw new Error('the process table could not be read');
  const children = new Map();
  for (const line of table.stdout.split('\n')) {
    const [pid, parent, ...rest] = line.trim().split(/\s+/).map(Number);
    if (rest.length === 0 && Number.isSafeInteger(pid) && Number.isSafeInteger(parent)) children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  return children;
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
function isOurs(procRoot, name) {
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

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Read one environment: the block, `'gone'` for a process that is not (or is no longer) there, or `'unreadable'` after a few tries (a process in the middle of an exec is unreadable for a moment). */
function readEnviron(procRoot, name) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return fs.readFileSync(`${procRoot}/${name}/environ`);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ESRCH' || isDefunct(procRoot, name)) return 'gone';
      if (attempt < 3) sleepMs(5);
    }
  }
  return 'unreadable';
}

/** Linux: `{ pids, unverified }` — the processes whose environment carries exactly `TESTSTODELETE_RUN=<record>`, and what could not be looked at. */
function markedByRecord(record, procRoot, { since, startOf }) {
  const entry = Buffer.from(`TESTSTODELETE_RUN=${record}`);
  const found = { pids: [], unverified: [] };
  let names;
  try {
    names = fs.readdirSync(procRoot);
  } catch (error) {
    return { pids: [], unverified: [`${procRoot} cannot be listed (${error?.code ?? 'error'})`] };
  }
  for (const name of names) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    const block = readEnviron(procRoot, name);
    if (block === 'gone') continue;
    if (block === 'unreadable') {
      if (isOurs(procRoot, name) && !startedBeforeRun(name, since, startOf)) found.unverified.push(`${procRoot}/${name}/environ cannot be read`);
    } else if (holdsEntry(block, entry)) {
      found.pids.push(Number(name));
    }
  }
  return found;
}

/**
 * The processes of this run that are still alive after its group was killed, read ONCE: `{ pids, unverified }` [E2.1 code 1,
 * code2 4, 6/11]. The parent-pid chain below `rootPid` (one `ps -A -o pid=,ppid=`), and on Linux every process whose environment
 * carries the run's record as a whole entry. Never this process. `unverified` names what could not be looked at (an unreadable
 * /proc or process table, a process of ours that started after `since` (the run's start, in seconds; `startOf(pid)` dates a pid) and
 * whose environment cannot be read); it never throws, and the other half of the scan still runs. Windows answers nothing: its job ends them.
 */
export function findSurvivors({ rootPid, record, platform = process.platform, procRoot = '/proc', since, startOf }) {
  const result = { pids: new Set(), unverified: [] };
  if (platform === 'win32') return { pids: [], unverified: [] };
  if (Number.isSafeInteger(rootPid) && rootPid > 0) {
    try {
      for (const pid of chainBelow(rootPid, childrenByParent())) result.pids.add(pid);
    } catch (error) {
      result.unverified.push(String(error?.message ?? error));
    }
  }
  if (platform === 'linux' && typeof record === 'string' && record !== '') {
    const marked = markedByRecord(record, procRoot, { since, startOf });
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

/** Is `pid` a process? `ESRCH` says no; a refusal (`EPERM`) says there is one. */
function pidAliveDefault(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Scan for survivors ONCE, end the ones found, and poll only those pids (with the same backoff) until they are dead or
 * `timeoutMs` passes. Anything the scan could not look at keeps the answer at "cannot confirm".
 */
async function settle({ rootPid, record, since, startOf, survivors, pidAlive, timeoutMs }) {
  const { pids, unverified } = await survivors({ rootPid, record, since, startOf });
  const deadline = Date.now() + timeoutMs;
  let step = CONFIRM_STEP_MS;
  let remaining = pids;
  while (remaining.length > 0) {
    for (const pid of remaining) killPid(pid);
    remaining = remaining.filter((pid) => pidAlive(pid));
    if (remaining.length === 0 || Date.now() >= deadline) break;
    await pause(Math.min(step, deadline - Date.now()));
    step = Math.min(step * 2, CONFIRM_MAX_STEP_MS);
  }
  if (remaining.length > 0) return { ended: false, alive: remaining.length };
  if (unverified.length > 0) return { ended: false, alive: 0, reason: 'unknown', cause: unverified.join('; ') };
  return { ended: true, alive: 0 };
}

/**
 * End the tree of `child` and report whether that is PROVEN: snapshot, kill the group, confirm it is empty, then look once for
 * what left it and end that too. Never throws: anything that goes wrong is "cannot confirm" (`reason: 'unknown'`), because a cleanup
 * that throws would hide the suite's own verdict and a confirmation that failed is not one [E2.1 code 4]. `confirm`, `survivors`
 * and `pidAlive` are seams for tests.
 */
export async function endTree(child, { confirm = confirmTreeEnded, survivors = findSurvivors, pidAlive = pidAliveDefault, record, since, startOf, settleTimeoutMs = CONFIRM_TIMEOUT_MS } = {}) {
  try {
    const tree = snapshotTree(child);
    killWholeTree(child, tree);
    const group = await confirm(tree);
    if (!group.ended) return group;
    return await settle({ rootPid: child?.pid, record, since, startOf, survivors, pidAlive, timeoutMs: settleTimeoutMs });
  } catch (error) {
    return { ended: false, alive: 0, reason: 'unknown', cause: String(error?.message ?? error) };
  }
}
