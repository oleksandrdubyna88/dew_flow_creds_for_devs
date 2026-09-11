'use strict';

/**
 * What a run started inside WSL, and nothing else.
 *
 * <p><b>Why this exists.</b> Two integration scripts assert that no half of their bridge outlives
 * the client — `creds-mcp-wsl-itest.cjs` and `wsl-agent-relay-itest.cjs` — and both asked the
 * question globally: `ps -eo args | grep '[c]reds-mcp'`, is ANYTHING matching alive. That is the
 * wrong question twice over. It fails on a process some earlier run left behind, and it fails on a
 * developer who happens to be running the real thing in another window — neither of which is a
 * defect in the code under test. Measured on this machine 2026-09-11: both scripts failed that one
 * check identically on `main` and on a feature branch, for leftovers.</p>
 *
 * <p>And the leftovers are the scripts' own: when a check fails partway, the run stops without
 * taking its processes down, so the NEXT run inherits them and fails the same check for the same
 * reason. A loop that gets louder rather than quieter.</p>
 *
 * <p>So: record what is alive BEFORE, assert on the difference, and sweep the difference at the
 * end whatever happened. A stray from somebody else's session is neither asserted on nor killed —
 * this run did not start it, and it is not this run's to remove.</p>
 *
 * <p>Shared rather than copied because a second copy of a process-killing heuristic is a thing to
 * update that nothing notices was missed.</p>
 */

/**
 * The pids whose command line matches, as WSL sees them.
 *
 * <p>`pattern` goes inside a bracket expression by the caller — `[c]reds-mcp` — which is the
 * standard way to stop `grep` from matching its own command line.</p>
 */
async function matchingPids(wsl, pattern) {
  const listed = await wsl(`ps -eo pid=,args= | grep '${pattern}' || true`);
  return new Set(
    listed.stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((pid) => /^\d+$/.test(pid)),
  );
}

/**
 * A watch over one kind of process for the length of one run.
 *
 * @param wsl a function running a command inside the distribution and answering `{ stdout }`
 * @param pattern the grep pattern, with its first character already bracketed
 * @param what how to name these in a failure message
 */
function watchStrays(wsl, pattern, what) {
  let before = new Set();
  return {
    /** Take the baseline. Everything alive now belongs to somebody else. */
    async start() {
      before = await matchingPids(wsl, pattern);
      return [...before];
    },

    /** The pids that appeared during this run and are still alive. */
    async survivors() {
      const now = await matchingPids(wsl, pattern);
      return [...now].filter((pid) => !before.has(pid));
    },

    /**
     * Take down whatever this run started and left behind.
     *
     * <p>Called from a `finally`, so a run that fails halfway does not hand its processes to the
     * next one. `SIGTERM` and nothing harsher: these exit on it, and a `-9` here would hide a
     * process that had stopped answering — which is a defect worth seeing.</p>
     */
    async sweep() {
      const left = await this.survivors();
      if (left.length > 0) {
        await wsl(`kill ${left.join(' ')} 2>/dev/null || true`);
      }
      return left;
    },

    /** What to print when the assertion fails, so a reader knows whose processes these are. */
    describe(pids) {
      return `${what} this run started and did not take down: ${pids.join(', ')}`;
    },
  };
}

/**
 * Start watching, in one call.
 *
 * <p>The two lines this replaces were identical in both harnesses, which is the same argument that
 * put the watch here in the first place.</p>
 */
async function startWatch(wsl, pattern, what) {
  const strays = watchStrays(wsl, pattern, what);
  await strays.start();
  return strays;
}

/**
 * Run a harness, sweep whatever it left behind, and exit with its verdict.
 *
 * <p>Here rather than at the bottom of each script because the two tails were near-identical, which
 * is what SonarCloud called duplication on the very change that extracted the watch — fair, and the
 * fix is to finish the extraction rather than to argue about a threshold.</p>
 *
 * <p>The sweep is in a `finally`, which is the whole point: a run that fails partway must not hand
 * its processes to the next one.</p>
 *
 * @param main the harness; it may throw, and a throw counts as one more failure
 * @param strays a getter, because the watch starts partway through `main`
 * @param failures a getter for the harness's own count
 * @param label what to call this run in the closing line
 */
function runAndSweep({ main, strays, failures, label }) {
  let threw = false;
  void main()
    .catch((error) => {
      console.error(error);
      threw = true;
    })
    .finally(async () => {
      const watch = strays();
      const swept = watch === undefined ? [] : await watch.sweep();
      if (swept.length > 0) {
        console.log(`swept ${swept.length} process(es) this run left behind`);
      }
      const count = failures() + (threw ? 1 : 0);
      const verdict = count === 0 ? `all ${label} checks passed` : `${count} check(s) failed`;
      console.log(`\n${verdict}`);
      process.exit(count === 0 ? 0 : 1);
    });
}

module.exports = { watchStrays, matchingPids, startWatch, runAndSweep };
