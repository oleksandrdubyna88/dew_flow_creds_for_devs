'use strict';

/**
 * What a WSL itest run started, on both sides of the bridge, and nothing else.
 *
 * <p><b>Why this exists.</b> Two integration scripts assert that no half of their bridge outlives the client —
 * `creds-mcp-wsl-itest.cjs` and `wsl-agent-relay-itest.cjs`. They used to ask globally, `ps | grep creds-mcp`,
 * which failed on a process an earlier run left behind and on a developer running the real thing in another
 * window — neither a defect in the code under test (measured 2026-09-11). And the leftovers were the scripts'
 * own: a run that failed partway handed its processes to the next one.</p>
 *
 * <p><b>Since E5 (PLAN_wsl_bridge_outlives_its_client.md) the question is asked by EXECUTABLE PATH.</b> Each run
 * starts only binaries it copied into its own run directory (`wslRun.cjs`), so a watch can say "processes of
 * this image whose executable lies under this run's directory" and be certain they are this run's. And it asks
 * on the Windows side as well — the side the leak was on: every `creds-mcp.exe` and `creds.exe relay-pipe` the
 * bridge starts is a Windows process.</p>
 *
 * <p><b>The parent is never a criterion.</b> A Windows process started through WSL interop is not parented to
 * the test's `wsl.exe`; the WSL service starts it.</p>
 *
 * <p><b>A sweep stops by pid through a held handle, never by name.</b> On Windows the process is opened, its path
 * read through that handle and the kill sent to it — Windows does not reuse a pid while a handle to it is open.
 * Inside the distribution `wslProcs.py` does the same with a pidfd. Both re-check the path immediately before
 * the stop (E5 plan gate, finding 1). The Linux side is swept FIRST: a relay or wrapper still alive could start
 * one more Windows child after a Windows sweep (own review of E5).</p>
 */

const fs = require('node:fs');
const path = require('node:path');
const { asLinux, run, wslExec } = require('./wslRun.cjs');

const WSL_PROCS = asLinux(path.join(__dirname, 'wslProcs.py'));
const POLL_MS = 250;

/** PowerShell by its fixed path — 7 where it is installed, Windows PowerShell 5.1 otherwise — never through PATH. */
const PWSH = path.join(process.env.ProgramFiles ?? String.raw`C:\Program Files`, 'PowerShell', '7', 'pwsh.exe');
const WINDOWS_POWERSHELL = path.join(process.env.SystemRoot ?? String.raw`C:\Windows`, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const powershell = () => (fs.existsSync(PWSH) ? PWSH : WINDOWS_POWERSHELL);

const pidsIn = (stdout) => stdout.split(/\s+/).filter((pid) => /^\d+$/.test(pid));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `read()` every 250 ms until `done(value)` holds or `ms` has passed; answers the last value read. */
async function pollUntil(read, done, ms) {
  const deadline = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await sleep(POLL_MS);
    value = await read();
  }
  return value;
}

/** Run a CONSTANT script; every value it reads arrives through its environment, never through its text. */
function ps(script, env) {
  return run(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
}

/** The run directory with exactly one trailing separator, whatever the environment handed over. */
const DIR_LINE = String.raw`$dir = $env:CREDS_ITEST_DIR.TrimEnd('\') + '\'`;

const LIST_WINDOWS = [
  DIR_LINE,
  'Get-CimInstance Win32_Process -Filter ("Name = \'" + $env:CREDS_ITEST_IMAGE + "\'") |',
  '  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } |',
  '  ForEach-Object { $_.ProcessId }',
].join('\n');

// A pid that is already gone is not a failure (the process left on its own); anything else that stops the stop —
// a path that could not be read, a kill refused, a process still there after the kill — is said on stderr and
// makes the script exit 1, so the sweep reports it instead of a clean run (checkpoint round, finding 3).
const STOP_WINDOWS = [
  DIR_LINE,
  '$failed = 0',
  "foreach ($id in $env:CREDS_ITEST_PIDS.Split(',')) {",
  '  try { $p = [System.Diagnostics.Process]::GetProcessById([int]$id) } catch { continue }',
  '  try {',
  '    $null = $p.Handle',
  '    if ($p.MainModule.FileName.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase)) {',
  '      $p.Kill()',
  '      if ($p.WaitForExit(5000)) { "$id" } else { $failed += 1; [Console]::Error.WriteLine("pid $id is still running 5 s after the kill") }',
  '    }',
  '  } catch { $failed += 1; [Console]::Error.WriteLine("pid $id could not be stopped: $($_.Exception.Message)") } finally { $p.Dispose() }',
  '}',
  'exit $(if ($failed -gt 0) { 1 } else { 0 })',
].join('\n');

/** The Windows pids of `image` whose executable lies under `exePath`. */
async function windowsPids(image, exePath) {
  if (!/^[A-Za-z0-9_.-]+\.exe$/.test(image)) {
    throw new Error(`not an image name: ${image}`);
  }
  const listed = await ps(LIST_WINDOWS, { CREDS_ITEST_IMAGE: image, CREDS_ITEST_DIR: exePath });
  if (listed.code !== 0) {
    throw new Error(`could not list Windows processes: ${listed.stderr.trim()}`);
  }
  return new Set(pidsIn(listed.stdout));
}

/** A watch over pids answered by `list`, stopped by `stop`, for the length of one run. */
function watch(list, stop, what) {
  let before = new Set();
  const survivors = async () => [...(await list())].filter((pid) => !before.has(pid));
  return {
    what,
    /** Take the baseline. In a run directory nothing should match yet; anything that does is not asserted on. */
    async start() {
      before = await list();
      return [...before];
    },
    /** The pids that appeared during this run and are still alive. */
    survivors,
    /** Poll until no survivor is left or `ms` has passed; answers whoever is still there. */
    goneWithin: (ms) => pollUntil(survivors, (left) => left.length === 0, ms),
    /** Poll until at least `count` survivors are alive or `ms` has passed — the positive control before an ending. */
    seenWithin: (count, ms) => pollUntil(survivors, (alive) => alive.length >= count, ms),
    /** Stop these pids of this run — by pid, the path re-read through the held handle first; answers the stopped. */
    stop,
    /** Stop whatever this run started and left behind — called from a `finally`, so no run hands its processes on. */
    async sweep() {
      const left = await survivors();
      return left.length === 0 ? [] : stop(left);
    },
    describe(pids) {
      return `${what} this run started and did not take down: ${pids.join(', ')}`;
    },
  };
}

/**
 * The Windows processes of `image` this run started from `exePath` (a folder of its Windows run directory).
 *
 * <p>`survivors()` is the set difference against the baseline; `goneWithin(5000)` is the plan's "polled up to
 * 5 s"; `sweep()` stops each survivor by pid through a held handle after re-reading its path.</p>
 */
function watchWindowsPids(image, exePath, what = image) {
  const stop = async (pids) => {
    const stopped = await ps(STOP_WINDOWS, { CREDS_ITEST_DIR: exePath, CREDS_ITEST_PIDS: pids.join(',') });
    if (stopped.code !== 0) {
      throw new Error(`not every ${what} could be stopped: ${stopped.stderr.trim()}`);
    }
    return pidsIn(stopped.stdout);
  };
  return watch(() => windowsPids(image, exePath), stop, what);
}

/**
 * The Linux processes whose executable lies under `linuxDir` (this run's directory inside the distribution).
 *
 * <p>`fdCount(pid)` is the relay harness's baseline — how many descriptors that process of this run holds
 * (`/proc/<pid>/fd`, read-only); a process not from the run directory is refused and answers NaN.</p>
 */
function watchLinuxPids(linuxDir, what) {
  const list = async () => new Set(pidsIn((await wslExec(['python3', WSL_PROCS, 'list', linuxDir])).stdout));
  const stop = async (pids) => {
    const stopped = await wslExec(['python3', WSL_PROCS, 'stop', linuxDir, ...pids]);
    if (stopped.code !== 0) {
      throw new Error(`not every ${what} could be stopped: ${stopped.stderr.trim()}`);
    }
    return pidsIn(stopped.stdout);
  };
  const fdCount = async (pid) => Number.parseInt((await wslExec(['python3', WSL_PROCS, 'fds', linuxDir, String(pid)])).stdout, 10);
  return { ...watch(list, stop, what), fdCount };
}

/** Start a watch, in one call. */
async function started(watchToStart) {
  await watchToStart.start();
  return watchToStart;
}

async function sweepAll(strays) {
  for (const strayWatch of strays) {
    try {
      const swept = await strayWatch.sweep();
      if (swept.length > 0) {
        console.log(`swept ${swept.length} process(es) this run left behind: ${swept.join(', ')}`);
      }
    } catch (error) {
      console.log(`      the sweep of ${strayWatch.what} failed: ${error}`);
    }
  }
}

/**
 * Run a harness, sweep whatever it left behind on either side, finish the run, and exit with its verdict.
 *
 * <p>A harness that cannot run here throws `skip(...)` from `wslRun.cjs`: the reason is printed as a SKIP, the
 * sweep and the finish still run (a run directory may already exist), and the exit code is 0 — a skip is not a
 * failure, and it is never silent.</p>
 *
 * @param main the harness; it may throw, and a throw counts as one more failure
 * @param strays a getter answering every watch started so far, Linux side first (the watches start partway through `main`)
 * @param failures a getter for the harness's own count
 * @param finish what ends the run once the sweep is done (removing the Windows run directory)
 * @param label what to call this run in the closing line
 */
function runAndSweep({ main, strays, failures, finish, label }) {
  let threw = false;
  let skipped = false;
  void main()
    .catch((error) => {
      if (error?.skip === true) {
        skipped = true;
        console.log(`SKIP — ${error.message}`);
        if (error.fix !== undefined) {
          console.log(`      ${error.fix}`);
        }
        return;
      }
      console.log(`FAIL the ${label} harness threw: ${error?.stack ?? error}`);
      threw = true;
    })
    .finally(async () => {
      await sweepAll(strays());
      await finish().catch((error) => console.log(`      finishing the run failed: ${error}`));
      const count = failures() + (threw ? 1 : 0);
      const passed = skipped ? `${label}: skipped` : `all ${label} checks passed`;
      const verdict = count === 0 ? passed : `${count} check(s) failed`;
      console.log('');
      console.log(verdict);
      process.exit(count === 0 ? 0 : 1);
    });
}

module.exports = { pollUntil, watchWindowsPids, watchLinuxPids, windowsPids, started, runAndSweep };
