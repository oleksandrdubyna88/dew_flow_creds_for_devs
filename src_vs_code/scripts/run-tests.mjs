// `npm test`: `node --test` with a worker cap that never RAISES a small machine — the shape the shared
// rule common/local-cpu-budget.md asks of a runner script.
//
//   node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/*.test.js"
//
// The script used to pass `--test-concurrency=8` directly. That switch is EXACT: on a 4-vCPU CI runner, where
// node's own default is 3, it made 8. A script can compute `min(8, CPUs - 1)`, which is node's own default
// wherever that is already at most 8. The preload (`--import`) lowers THIS process, and the `node --test` child
// inherits the priority (the Windows priority class and the POSIX nice value are both inherited). Under CI,
// or without the shared-rules mount, the preload lowers nothing. This file needs no mount, so CI runs it.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { availableParallelism, constants } from 'node:os';
import { fileURLToPath } from 'node:url';

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

/**
 * Run the suite and return the code to leave with: the child's own, or 128 + the signal's number when a signal
 * ended it (never a plain 1 that a caller could not tell from a failing test), or 1 when the spawn itself failed.
 * `spawn` is a seam for tests.
 */
export function runTests(extra = [], spawn = spawnSync) {
  const result = spawn(process.execPath, testArgs(extra), { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write(`run-tests: ${result.error.message}\n`);
    return 1;
  }
  if (result.signal) {
    return 128 + (constants.signals[result.signal] ?? 0);
  }
  return result.status ?? 1;
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exit(runTests(process.argv.slice(2)));
}
