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
 * the stop (E5 plan gate, finding 1).</p>
 */

const path = require('path');
const { asLinux, run, wslExec } = require('./wslRun.cjs');

const WSL_PROCS = asLinux(path.join(__dirname, 'wslProcs.py'));
const POLL_MS = 250;

const pidsIn = (stdout) => stdout.split(/\s+/).filter((pid) => /^\d+$/.test(pid));

let shell;
/** PowerShell 7 first, Windows PowerShell 5.1 only where pwsh is absent. */
async function powershell() {
  if (shell === undefined) {
    const probe = await run('pwsh', ['-NoProfile', '-Command', 'exit 0'], { timeout: 20_000 });
    shell = probe.code === 0 ? 'pwsh' : 'powershell.exe';
  }
  return shell;
}

/** Run a CONSTANT script; every value it reads arrives through its environment, never through its text. */
async function ps(script, env) {
  return run(await powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
}

const LIST_WINDOWS = [
  "$dir = $env:CREDS_ITEST_DIR.TrimEnd('\\') + '\\'",
  'Get-CimInstance Win32_Process -Filter ("Name = \'" + $env:CREDS_ITEST_IMAGE + "\'") |',
  '  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } |',
  '  ForEach-Object { $_.ProcessId }',
].join('\n');

const STOP_WINDOWS = [
  "$dir = $env:CREDS_ITEST_DIR.TrimEnd('\\') + '\\'",
  "foreach ($id in $env:CREDS_ITEST_PIDS.Split(',')) {",
  '  try { $p = [System.Diagnostics.Process]::GetProcessById([int]$id) } catch { continue }',
  '  try {',
  '    $null = $p.Handle',
  '    if ($p.MainModule.FileName.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase)) {',
  '      $p.Kill(); $null = $p.WaitForExit(5000); "$id"',
  '    }',
  '  } catch { } finally { $p.Dispose() }',
  '}',
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
    /** Take the baseline. In a run directory nothing should match yet; anything that does is not asserted on. */
    async start() {
      before = await list();
      return [...before];
    },
    /** The pids that appeared during this run and are still alive. */
    survivors,
    /** Poll until no survivor is left or `ms` has passed; answers whoever is still there. */
    async goneWithin(ms) {
      const deadline = Date.now() + ms;
      let left = await survivors();
      while (left.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        left = await survivors();
      }
      return left;
    },
    /** Poll until `count` survivors are alive or `ms` has passed — the positive control before an ending. */
    async seenWithin(count, ms) {
      const deadline = Date.now() + ms;
      let alive = await survivors();
      while (alive.length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        alive = await survivors();
      }
      return alive;
    },
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
  const stop = async (pids) =>
    pidsIn((await ps(STOP_WINDOWS, { CREDS_ITEST_DIR: exePath, CREDS_ITEST_PIDS: pids.join(',') })).stdout);
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
  const stop = async (pids) => pidsIn((await wslExec(['python3', WSL_PROCS, 'stop', linuxDir, ...pids])).stdout);
  const fdCount = async (pid) => Number.parseInt((await wslExec(['python3', WSL_PROCS, 'fds', linuxDir, String(pid)])).stdout, 10);
  return { ...watch(list, stop, what), fdCount };
}

/** Start a watch, in one call. */
async function started(watchToStart) {
  await watchToStart.start();
  return watchToStart;
}

/**
 * Run a harness, sweep whatever it left behind on either side, finish the run, and exit with its verdict.
 *
 * @param main the harness; it may throw, and a throw counts as one more failure
 * @param strays a getter answering every watch started so far (the watches start partway through `main`)
 * @param failures a getter for the harness's own count
 * @param finish what ends the run once the sweep is done (removing the Windows run directory)
 * @param label what to call this run in the closing line
 */
function runAndSweep({ main, strays, failures, finish, label }) {
  let threw = false;
  void main()
    .catch((error) => {
      console.error(error);
      threw = true;
    })
    .finally(async () => {
      for (const strayWatch of strays()) {
        const swept = await strayWatch.sweep().catch((error) => [String(error)]);
        if (swept.length > 0) {
          console.log(`swept ${swept.length} process(es) this run left behind: ${swept.join(', ')}`);
        }
      }
      await finish().catch((error) => console.log(`      finishing the run failed: ${error}`));
      const count = failures() + (threw ? 1 : 0);
      console.log(`\n${count === 0 ? `all ${label} checks passed` : `${count} check(s) failed`}`);
      process.exit(count === 0 ? 0 : 1);
    });
}

module.exports = { watchWindowsPids, watchLinuxPids, windowsPids, started, runAndSweep };
