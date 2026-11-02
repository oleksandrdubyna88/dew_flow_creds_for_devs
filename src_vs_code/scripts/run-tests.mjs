// `npm test`: `node --test` with a worker cap that never RAISES a small machine — the shape the shared rule
// common/local-cpu-budget.md asks of a runner script — wrapped in the lifecycle of common/test-leftovers.md.
//
//   node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/*.test.js"
//
// What this runner does, in order:
//
//   1. loads the leftovers helper (`scripts/lib/leftovers.cjs`, a wrapper over the MOUNTED reference). No mount, no run:
//      one line naming `git submodule update --init .claude/rules/shared`, and `node --test` is never started;
//   2. sweeps what a KILLED earlier run left (rule section 4), in BOTH roots when the socket root differs from the temp
//      root; it reports and never changes the exit code;
//   3. exports the run's record ONCE, as `TESTSTODELETE_RUN=<record>` in the child's environment (rule section 3), and
//      holds that exact string: every test-file process claims with it, and the audit compares it as a string, never a
//      record recomputed afterwards [E2.1 plan gate 0];
//   4. starts `node --test` in a tree of its own, and when the coordinator has exited (or the timeout is reached) ends
//      the WHOLE tree and CONFIRMS that no descendant is alive [cadence e2d20eab 1] (`lib/processTree.mjs`);
//      The wait is bounded: 60 minutes by default (`RUN_TESTS_TIMEOUT_MS` or the `timeoutMs` seam overrides it); when it is
//      reached the runner says so, ends the whole tree, and still audits. One run at a time per process: the record is the
//      process's own, so an overlapping call would audit the other's folders, and it is refused;
//   5. only then audits: every owner-form folder and orphan claim of both roots whose claim is EXACTLY the exported record
//      is a folder this run made and never removed. It is removed, and a passing suite becomes exit 1 naming it. Any other
//      record's folder (a concurrent run, a harness, a C# run) is never touched and never counted. A tree that cannot be
//      confirmed ended removes nothing: the audit lists, fails the run and leaves the folders to a later sweep.
//
// Where the collection guarantee holds. "A killed run's leftovers are collected by the next run" holds for the runners
// that sweep: `npm test`, `npm run itest:all` and the xUnit executables. A direct `node --test out/test/<file>.test.js`
// still makes and removes its own scratch through the helper on every unwinding path, but it does not sweep old
// leftovers: the next runner run, or the janitor, does. On Windows the Node sweep COLLECTS NOTHING until F16 closes: the
// reference lists `unverified:` there (the owner SID is not read); the collector on Windows is the C# sweep of the xUnit
// executables or the janitor once armed. The audit of step 5 is not that sweep: it removes only this run's own record.
// On Windows and macOS the record carries no start time, so a dead run's pid that was reused could match it; the audit runs only
// while THIS runner is alive (its own pid cannot be a reused one), and later sweeps rely on the reference's liveness rules.
// On Windows the audit removes nothing at all for now: the reference's job supervisor gives no acknowledgment that its job is empty.
//
// The preload (`--import`) lowers THIS process, and the `node --test` child inherits the priority (the Windows priority
// class and the POSIX nice value are both inherited). The script computes `min(8, CPUs - 1)` workers, which is node's own
// default wherever that is already at most 8; the old exact `--test-concurrency=8` raised a 4-vCPU CI runner.
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { availableParallelism, constants } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The family cap. */
export const CAP = 8;

/** `node --test`'s worker count for a machine with `threads` hardware threads: its own default, never above the cap. */
export function testConcurrency(threads = availableParallelism()) {
  return Math.max(1, Math.min(CAP, threads - 1));
}

/** The argument list of the one `node --test` this runner starts. */
export function testArgs(extra = [], threads = availableParallelism()) {
  return ['--test', `--test-concurrency=${testConcurrency(threads)}`, ...extra];
}

/** The longest delay a timer honours (2^31 - 1 ms): a platform limit, not a rule of the reference. */
const MAX_TIMER_MS = 2_147_483_647;

/** The longest a suite may run before the runner ends its whole tree [E2.1 code 9/13]. */
export const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

/** The timeout: `RUN_TESTS_TIMEOUT_MS` when set, else the default. An unknown value is refused naming the legal ones, never replaced silently. */
export function timeoutFrom(env = process.env) {
  const raw = env.RUN_TESTS_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_TIMEOUT_MS;
  const ms = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(ms) || ms < 1 || ms > MAX_TIMER_MS) {
    throw new Error(`RUN_TESTS_TIMEOUT_MS must be a positive whole number of milliseconds, at most ${MAX_TIMER_MS}; got ${JSON.stringify(raw)}`);
  }
  return ms;
}

/** The code to leave with: the child's own, 128 + the signal's number when a signal ended it, or 1 when the spawn itself failed. */
export function exitCodeOf({ status, signal, error }) {
  if (error) return 1;
  if (signal) return 128 + (constants.signals[signal] ?? 0);
  return status ?? 1;
}

/** The helper and the tree policy, or the one line that says why neither can be had (a missing mount is a refusal, not a pass). */
async function loadHelpers() {
  const helper = createRequire(import.meta.url)('./lib/leftovers.cjs');
  const tree = await import('./lib/processTree.mjs');
  return { helper, tree };
}

/** The roots a sweep and the audit read: the temp root, and the short socket root when it is another folder. */
export function rootsOf(helper) {
  const roots = [helper.tempRoot(), helper.shortSocketRoot()];
  return roots.filter((root, index) => roots.findIndex((other) => path.resolve(other) === path.resolve(root)) === index);
}

/** The start-of-run sweep is not wired to this repository's token yet (the mounted sweep serves the reference's own token only). */
export function sweepNotWired() {
  throw new Error("the mounted sweep serves the token 'conventions' only, so it cannot collect 'creds' folders — see todo/PLAN_test_leftovers_E2.md");
}

/** One report line only when the sweep found something; a thrown sweep is one line; never the exit code. */
function sweepAll({ sweep, roots, write }) {
  for (const tmp of roots) {
    try {
      const { removed = [], preserved = [], errors = [], listed = [] } = sweep({ repo: REPO_ROOT, tmp });
      if (removed.length + preserved.length + errors.length + listed.length === 0) continue;
      write(`run-tests: leftovers in ${tmp} — removed ${removed.length}, preserved ${preserved.length}`);
      for (const line of listed) write(`run-tests: ${line}`);
      for (const error of errors) write(`run-tests: leftovers error: ${error}`);
    } catch (error) {
      write(`run-tests: leftovers sweep failed (${error?.message ?? error})`);
    }
  }
}

/** The entries of `root` that are this repository's, this caller's, in the owner form: `{ folder, name }` for each folder AND each orphan claim. */
function candidates(helper, root) {
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const pattern = helper.ownedPattern();
  const folders = new Set(names.filter((name) => pattern.test(name) && !name.endsWith('.owner')));
  for (const name of names) {
    if (pattern.test(name) && name.endsWith('.owner')) folders.add(name.slice(0, -'.owner'.length)); // an orphan claim names its folder
  }
  return [...folders].map((name) => path.join(root, name));
}

function isDirectory(target) {
  try {
    return fs.lstatSync(target).isDirectory();
  } catch {
    return false; // not there: an orphan claim
  }
}

/**
 * What the run left. `claimed`: every folder and orphan claim whose claim is EXACTLY `record` and whose folder passes the
 * kernel-owner key; `unmarked`: owner-form folders with no claim, which nobody's helper knows (listed, never touched). A claim
 * of any other record — another run, a harness, a C# executable — is in neither list.
 */
export function auditRoots(helper, roots, record) {
  const claimed = [];
  const unmarked = [];
  for (const root of roots) {
    for (const target of candidates(helper, root)) {
      const there = fs.existsSync(target);
      if (there && (!isDirectory(target) || !helper.isMine(target))) continue;
      const owner = helper.readOwner(target, 'folder');
      if (owner === null) {
        if (there) unmarked.push(target);
      } else if (owner.unreadable !== true && helper.formatOwner(owner) === record) {
        claimed.push(target);
      }
    }
  }
  return { claimed, unmarked };
}

/** Remove what the run claimed, by its exact name; the helper never throws and says once when it gives up. */
function removeClaimed(helper, claimed) {
  for (const target of claimed) helper.removeQuietly(target);
}

/** Why nothing was removed, in the audit's one line. */
function refusalOf(ended) {
  if (ended.alive > 0) return ` (not removed: ${ended.alive} descendant(s) still alive)`;
  if (ended.reason === 'no-handle') return ' (not removed: the supervisor gives no acknowledgment that its job is empty)';
  return ' (not removed: the end of the process tree could not be confirmed)';
}

/**
 * The audit's whole effect: remove (only with the tree PROVEN ended), report, and return the code to leave with. A tree that is
 * not proven ended fails the run when something is claimed, or when a descendant is known alive or the check itself failed. The one
 * exception is a tree with no handle (Windows) and nothing claimed: there is nothing to remove or list, and failing every Windows
 * run for a confirmation the platform cannot give would make the suite unusable there.
 */
function finishAudit({ helper, roots, record, ended, code, write }) {
  const { claimed, unmarked } = auditRoots(helper, roots, record);
  for (const target of unmarked) write(`run-tests: unmarked: ${target} — an owner-form folder with no claim, left alone`);
  if (ended.ended) removeClaimed(helper, claimed);
  const failsAnyway = !ended.ended && ended.reason !== 'no-handle';
  if (claimed.length === 0 && !failsAnyway) return code;
  write(`run-tests: this run left ${claimed.length} folder(s) it claimed — a test made scratch outside a scope: ${claimed.join(', ')}${ended.ended ? '' : refusalOf(ended)}`);
  return code === 0 ? 1 : code;
}

/**
 * Wait for the coordinator to exit, or end its tree when `timeoutMs` passes (saying so first). Resolves once with
 * `{ status, signal, error, timedOut }`; the timer and both listeners are gone on every outcome [E2.1 code 3].
 */
function wait(child, { timeoutMs, tree, write }) {
  return new Promise((resolve) => {
    let timedOut = false;
    const finish = (result) => {
      clearTimeout(timer);
      child.off('error', onError);
      child.off('exit', onExit);
      resolve({ ...result, timedOut });
    };
    const onError = (error) => finish({ error });
    const onExit = (status, signal) => finish({ status, signal });
    const timer = setTimeout(() => {
      timedOut = true;
      write(`run-tests: the suite reached its timeout of ${timeoutMs} ms — ending the whole process tree`);
      tree.killWholeTree(child, tree.snapshotTree(child));
    }, timeoutMs);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

/** Forward a terminal's interrupt to the child's tree: it is in a group of its own, so the terminal no longer reaches it. Only a positive whole pid is ever signalled. */
function forwardSignals(child) {
  if (process.platform === 'win32' || !Number.isSafeInteger(child.pid) || child.pid <= 0) return () => undefined;
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // gone already
    }
  }]);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}

/** One runner at a time per process: the record is the process's own, so two overlapping runs would audit each other's folders. */
let active = false;

/**
 * Sweep, run the suite in a tree of its own, end the tree, audit, and return the code to leave with. The seams are for tests:
 * `spawn` (starts the coordinator), `sweep`, `roots`, `record` (the string exported as `TESTSTODELETE_RUN`), `confirm` (the
 * answer to "is the tree ended"), `survivors` (what is still alive outside the group), `settleTimeoutMs`, `timeoutMs`, `stdio`,
 * `write` (one line to stderr).
 */
export async function runWithAudit(extra = [], seams = {}) {
  const write = seams.write ?? ((line) => process.stderr.write(`${line}\n`));
  if (active) {
    write('run-tests: another run is already running in this process — refused, because both would audit the same record');
    return 1;
  }
  active = true;
  try {
    return await runOnce(extra, seams, write);
  } finally {
    active = false;
  }
}

async function runOnce(extra, seams, write) {
  let helpers;
  let timeoutMs;
  try {
    helpers = await loadHelpers();
    timeoutMs = seams.timeoutMs ?? timeoutFrom(process.env);
  } catch (error) {
    write(`run-tests: ${String(error?.message ?? error).split('\n')[0]}`);
    return 1;
  }
  const { helper, tree } = helpers;
  const roots = seams.roots ?? rootsOf(helper);
  sweepAll({ sweep: seams.sweep ?? sweepNotWired, roots, write });
  const record = seams.record ?? helper.formatOwner(helper.thisOwner()); // held ONCE: exported below, compared by the audit
  const env = { ...process.env, TESTSTODELETE_RUN: record };
  const child = tree.startInOwnTree(process.execPath, testArgs(extra), { stdio: seams.stdio ?? 'inherit', env }, seams.spawn);
  const stopForwarding = forwardSignals(child);
  const result = await wait(child, { timeoutMs, tree, write });
  stopForwarding();
  if (result.error) write(`run-tests: ${result.error.message}`);
  const ended = await tree.endTree(child, { confirm: seams.confirm, survivors: seams.survivors, record, settleTimeoutMs: seams.settleTimeoutMs });
  const code = exitCodeOf(result);
  return finishAudit({ helper, roots, record, ended, code: result.timedOut && code === 0 ? 124 : code, write });
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exit(await runWithAudit(process.argv.slice(2)));
}
