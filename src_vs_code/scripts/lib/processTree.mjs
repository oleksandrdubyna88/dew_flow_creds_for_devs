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

/** A child-like emitter for a supervised run: `exit` or `error` once, `stop()` ends the whole tree. */
function startInJob(command, args, { env, stdio }) {
  const job = new EventEmitter();
  const control = new AbortController();
  job.stop = () => control.abort();
  const inherit = stdio === 'ignore' ? 'ignore' : 'inherit';
  run(command, args, { env, stdout: inherit, timeoutMs: MAX_TIMER_MS, maxOutputBytes: SUPERVISOR_MAX_OUTPUT_BYTES, containTree: true, signal: control.signal }).then((result) => {
    if (inherit === 'inherit' && result.err !== '') process.stderr.write(result.err);
    if (result.spawnFailed) job.emit('error', new Error(`the supervised start failed (${result.spawnError})`));
    else if (result.overflow) job.emit('error', new Error(`the supervisor wrote more than ${SUPERVISOR_MAX_OUTPUT_BYTES} bytes; the whole tree was ended`));
    else job.emit('exit', result.code, result.signal);
  });
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

/** How many members of the POSIX group `pgid` the process table still shows (1 when it cannot be counted). */
function groupMembers(pgid) {
  const table = spawnSync('ps', ['-A', '-o', 'pgid='], { encoding: 'utf8' });
  if (table.status !== 0 || typeof table.stdout !== 'string') return 1;
  return Math.max(1, table.stdout.split('\n').filter((line) => Number(line.trim()) === pgid).length);
}

/** How many members of the group are alive: 0 once it has ended (`ESRCH`). */
export function aliveInTree(tree) {
  try {
    process.kill(-tree.root, 0);
  } catch (error) {
    return error?.code === 'EPERM' ? 1 : 0;
  }
  return groupMembers(tree.root);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until no member of the tree is alive, or `timeoutMs` passes: `{ ended: true, alive: 0 }`, or `{ ended: false, alive: <n> }`.
 * The question is repeated with a backoff (`stepMs` doubling to `maxStepMs`), and the last wait is cut to what the bound leaves, so
 * the whole poll stays inside `timeoutMs` [E2.1 code 5]. `ask`, `now` and `pause` are seams for tests.
 *
 * With no handle on the tree — a supervised run, whose job has no pid, or a fake — there is nothing to ask, and the answer is NOT
 * "ended": `{ ended: false, alive: 0, reason: 'no-handle' }` [E2.1 risk 2]. A confirmation that cannot confirm is not a confirmation.
 */
export async function confirmTreeEnded(tree, { timeoutMs = CONFIRM_TIMEOUT_MS, stepMs = CONFIRM_STEP_MS, maxStepMs = CONFIRM_MAX_STEP_MS, ask = aliveInTree, now = Date.now, pause: wait = pause } = {}) {
  if (tree === undefined) return { ended: false, alive: 0, reason: 'no-handle' };
  const deadline = now() + timeoutMs;
  let step = stepMs;
  let alive = ask(tree);
  while (alive > 0 && now() < deadline) {
    await wait(Math.min(step, deadline - now()));
    step = Math.min(step * 2, maxStepMs);
    alive = ask(tree);
  }
  return { ended: alive === 0, alive };
}

/** The process table as `[pid, ppid]` rows. Throws when it cannot be read: a table that is not there is not an empty one. */
function processTable() {
  const table = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  if (table.error || table.status !== 0 || typeof table.stdout !== 'string') throw new Error('the process table could not be read');
  return table.stdout.split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter((row) => row.length === 2 && row.every(Number.isSafeInteger));
}

/** Everything the parent-pid chain reaches below `root`. */
function chainBelow(root, rows) {
  const found = [root];
  for (const pid of found) for (const [child, parent] of rows) if (parent === pid && !found.includes(child)) found.push(child);
  return found.slice(1);
}

/** Linux: the processes whose environment carries `TESTSTODELETE_RUN=<record>` — this run's children and theirs, whatever session they are in. */
function markedByRecord(record) {
  const entry = Buffer.from(`\0TESTSTODELETE_RUN=${record}\0`);
  const marked = [];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^[1-9][0-9]*$/.test(name)) continue;
    try {
      if (Buffer.concat([Buffer.from('\0'), fs.readFileSync(`/proc/${name}/environ`), Buffer.from('\0')]).includes(entry)) marked.push(Number(name));
    } catch {
      // gone since the listing, or not ours to read: not a process of this run
    }
  }
  return marked;
}

/**
 * The processes of this run that are still alive after its group was killed [E2.1 code 1]: the parent-pid chain below `rootPid`
 * (`ps -A -o pid=,ppid=`), and on Linux every process carrying the run's record in its environment. Never this process. Windows
 * answers nothing: its job ends them. Throws when the process table cannot be read, which the caller treats as "cannot confirm".
 */
export function findSurvivors({ rootPid, record, platform = process.platform }) {
  if (platform === 'win32') return [];
  const found = new Set();
  if (Number.isSafeInteger(rootPid) && rootPid > 0) for (const pid of chainBelow(rootPid, processTable())) found.add(pid);
  if (platform === 'linux' && typeof record === 'string' && record !== '') for (const pid of markedByRecord(record)) found.add(pid);
  found.delete(process.pid);
  return [...found];
}

function killPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/** End every survivor and ask again, with the same backoff, until none is left or `timeoutMs` passes. */
async function settle({ rootPid, record, survivors, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let step = CONFIRM_STEP_MS;
  let found = await survivors({ rootPid, record });
  while (found.length > 0) {
    for (const pid of found) killPid(pid);
    if (Date.now() >= deadline) break;
    await pause(Math.min(step, deadline - Date.now()));
    step = Math.min(step * 2, CONFIRM_MAX_STEP_MS);
    found = await survivors({ rootPid, record });
  }
  return found.length === 0 ? { ended: true, alive: 0 } : { ended: false, alive: found.length };
}

/**
 * End the tree of `child` and report whether that is PROVEN: snapshot, kill the group, confirm it is empty, then look for what
 * left it and end that too. Never throws: anything that goes wrong is "cannot confirm" (`reason: 'unknown'`), because a cleanup
 * that throws would hide the suite's own verdict and a confirmation that failed is not one [E2.1 code 4]. `confirm` and
 * `survivors` are seams for tests.
 */
export async function endTree(child, { confirm = confirmTreeEnded, survivors = findSurvivors, record, settleTimeoutMs = CONFIRM_TIMEOUT_MS } = {}) {
  try {
    const tree = snapshotTree(child);
    killWholeTree(child, tree);
    const group = await confirm(tree);
    if (!group.ended) return group;
    return await settle({ rootPid: child?.pid, record, survivors, timeoutMs: settleTimeoutMs });
  } catch (error) {
    return { ended: false, alive: 0, reason: 'unknown', cause: String(error?.message ?? error) };
  }
}
