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
//   Windows  `run(..., { containTree: true })` starts the child under the reference's supervisor (`process-job.ps1`, PowerShell
//            7): a job object with KILL_ON_JOB_CLOSE, so the descendants end when the supervisor leaves, even those whose
//            parent died first (a process-table walk from a dead coordinator would miss exactly those). There is no pid to
//            probe a job by, so the confirmation there is the job's own guarantee; the Windows CI leg of
//            `ci-extension.yml` (`runner lifecycle · windows`) is what observes it on a real descendant.
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { MAX_TIMER_MS, killTree, run } from '../../../.claude/rules/shared/tools/lib/proc.mjs';

/** How long the confirmation waits for the tree to disappear, and how often it asks. */
export const CONFIRM_TIMEOUT_MS = 5000;
export const CONFIRM_STEP_MS = 50;

const WINDOWS = process.platform === 'win32';

/** A child-like emitter for a supervised run: `exit` or `error` once, `stop()` ends the whole tree. */
function startInJob(command, args, { env, stdio }) {
  const job = new EventEmitter();
  const control = new AbortController();
  job.stop = () => control.abort();
  const inherit = stdio === 'ignore' ? 'ignore' : 'inherit';
  run(command, args, { env, stdout: inherit, timeoutMs: MAX_TIMER_MS, maxOutputBytes: Number.MAX_SAFE_INTEGER, containTree: true, signal: control.signal }).then((result) => {
    if (inherit === 'inherit' && result.err !== '') process.stderr.write(result.err);
    if (result.spawnFailed) job.emit('error', new Error(`the supervised start failed (${result.spawnError})`));
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
 * Wait until no member of the tree is alive, or `timeoutMs` passes. `{ ended: true, alive: 0 }`, or `{ ended: false, alive: <n> }`.
 * No tree to ask about (a supervised run, whose job is closed when it returns; a fake) is ended.
 */
export async function confirmTreeEnded(tree, { timeoutMs = CONFIRM_TIMEOUT_MS, stepMs = CONFIRM_STEP_MS } = {}) {
  if (tree === undefined) return { ended: true, alive: 0 };
  const deadline = Date.now() + timeoutMs;
  let alive = aliveInTree(tree);
  while (alive > 0 && Date.now() < deadline) {
    await pause(stepMs);
    alive = aliveInTree(tree);
  }
  return { ended: alive === 0, alive };
}

/**
 * End the tree of `child` and report whether that is PROVEN: snapshot, kill, confirm. `confirm` is a seam for tests (the answer
 * "one descendant alive" is otherwise unreachable without a process the kill cannot reach).
 */
export async function endTree(child, { confirm = confirmTreeEnded } = {}) {
  const tree = snapshotTree(child);
  killWholeTree(child, tree);
  return confirm(tree);
}
