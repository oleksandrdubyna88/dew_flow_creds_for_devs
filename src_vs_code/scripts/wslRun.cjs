'use strict';

/**
 * Where a WSL itest run keeps the binaries it starts — on both sides of the bridge, and never shared — and how
 * it runs anything inside the distribution.
 *
 * <p><b>Why a run directory.</b> The two WSL harnesses assert that nothing they started outlives its client,
 * and they sweep what did. Both questions are only safe if "what this run started" can be told apart from
 * everything else on the machine — another developer's real `creds-mcp.exe`, a second harness, an earlier run.
 * So each run copies the binaries it will start into a directory named for the run, on Windows
 * (`%TEMP%\creds-itest-<run>`) and inside the distribution (`/tmp/creds-itest-<run>`), and every watch filters
 * by executable path under it (PLAN_wsl_bridge_outlives_its_client.md, E5.S1; plan gate round 1, finding 1).</p>
 *
 * <p><b>Nothing is deleted inside the distribution</b> — a machine rule since 2026-10-07, when a cleanup sent
 * through `wsl.exe` removed parts of a home directory. The Linux build goes into a directory named by a hash of
 * its inputs, so a changed input means a new directory and a stale build is never reused; what accumulates in
 * `/tmp` is listed at the end of every run for the person to clear (the distribution's next boot empties `/tmp`
 * on a systemd distribution). The Windows run directory is removed at the end, from Windows, by its exact
 * name.</p>
 *
 * <p><b>Exe + argv, never a shell string</b> (security.md; E5 code round, findings 0 and 1). Every step inside
 * the distribution is `wsl.exe -e bash -l wslSteps.sh NAME=value... -- verb args...`: the script is constant and
 * checked in, the exports and every path travel as argv entries, and the one place a composed shell line runs
 * is the relay harness's check of the line the product itself composes. Every call is bounded by a timeout; a
 * `wsl.exe` ended by it delivers SIGHUP to what it started, and the harness's sweep stops by pid whatever is
 * still there (`wslStrays.cjs`).</p>
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const LINUX_PREFIX = '/tmp/creds-itest-';
const WINDOWS_PREFIX = 'creds-itest-';

/** A name for this run: time and pid, so two harnesses started in the same second still differ. */
const RUN_ID = `${Date.now().toString(36)}-${process.pid}`;

/** A Windows path as the distribution sees it. */
const asLinux = (winPath) =>
  winPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');

/** The constant script every step inside the distribution goes through. */
const STEPS = asLinux(path.join(__dirname, 'wslSteps.sh'));

/**
 * One process to its end: exit code, stdout, stderr — never a throw. `input`, when given, is written to its
 * stdin and the stream closed; the timeout (5 min by default) ends the process.
 */
function run(exe, args, options = {}) {
  const { input, ...rest } = options;
  return new Promise((resolve) => {
    const child = execFile(exe, args, { timeout: 300_000, maxBuffer: 16 * 1024 * 1024, ...rest }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

/** `NAME=value` entries, one per variable. */
const pairs = (env) => Object.entries(env).map(([name, value]) => `${name}=${value}`);

/** The argv (after `wsl.exe`) of one step: the exports, then the verb and its arguments. */
const stepArgv = (env, verb, args = []) => ['-e', 'bash', '-l', STEPS, ...pairs(env), '--', verb, ...args];

/** One step inside the default distribution, to its end. */
const wslStep = (env, verb, args = [], options = {}) => run('wsl.exe', stepArgv(env, verb, args), options);

/** A program inside the distribution with these exact arguments — no shell anywhere between. */
const wslExec = (args, options = {}) => run('wsl.exe', ['-e', ...args], options);

/** This run's directories, created now. */
function runDirectories() {
  const windows = path.join(fs.realpathSync.native(os.tmpdir()), `${WINDOWS_PREFIX}${RUN_ID}`);
  fs.mkdirSync(windows, { recursive: true });
  return { windows, linux: `${LINUX_PREFIX}${RUN_ID}`, logs: path.join(windows, 'logs') };
}

/** The Windows build output of `project` (`src_mcp`, `src_cli`). */
const windowsBuild = (project) => path.join(REPO, project, 'src', 'bin', 'Debug', 'net10.0');

/** Copy a Windows build output folder into the run directory as `kind`; answers the copied executable. */
function copyWindowsBinary(dirs, { kind, project, exe }) {
  const target = path.join(dirs.windows, kind);
  fs.cpSync(windowsBuild(project), target, { recursive: true });
  return path.join(target, exe);
}

/** A source file of a project, wherever it sits below `src/` — never a build output. */
const isSource = (relative) =>
  (relative.endsWith('.cs') || relative.endsWith('.csproj')) && !/^(bin|obj)[\\/]/.test(relative);

/**
 * The repo-relative inputs of one Linux build: the projects' sources (recursively, so a future subfolder changes
 * the hash rather than being silently left out) plus the shared build files — `Directory.Build.rsp` among them,
 * which is what switches MSBuild node reuse off, and `global.json`, which pins the SDK (own review of E5).
 */
function buildInputs(projects) {
  const files = [
    'Directory.Build.props',
    'Directory.Build.rsp',
    'Directory.Packages.props',
    'global.json',
    'nuget.config',
    'contract/broker-v1.json',
  ];
  for (const project of projects) {
    const dir = path.join(REPO, project, 'src');
    for (const name of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
      if (isSource(name)) {
        files.push(`${project}/src/${name.replace(/\\/g, '/')}`);
      }
    }
  }
  return files;
}

/** Stop a run before it starts anything, loudly: `runAndSweep` prints the reason and the fix and exits 0. */
function skip(reason, fix) {
  throw Object.assign(new Error(reason), { skip: true, fix });
}

/** The build directory for exactly these inputs: a hash of their names and bytes. */
function buildDirectory(kind, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(REPO, file))).update('\0');
  }
  return `${LINUX_PREFIX}build-${kind}-${hash.digest('hex').slice(0, 12)}`;
}

const isBuilt = async (executable) => (await wslStep({}, 'exists', [executable])).stdout.includes('yes');

/**
 * Build `project` for Linux inside the distribution, once per set of inputs, then copy its output into this
 * run's Linux directory. Answers the copied executable, or undefined when the build failed (its tail printed).
 */
async function linuxBinary(dirs, { kind, project, projects, exe }) {
  const files = buildInputs(projects);
  const build = buildDirectory(kind, files);
  const output = `${build}/${project}/src/bin/Debug/net10.0`;
  if (!(await isBuilt(`${output}/${exe}`))) {
    console.log(`      building the Linux ${exe} inside WSL into ${build} (once per change, a minute or so)…`);
    const result = await wslStep({}, 'build', [build, asLinux(REPO), project, ...files]);
    if (!(await isBuilt(`${output}/${exe}`))) {
      console.log(result.stdout.trim());
      return undefined;
    }
  }
  const target = `${dirs.linux}/${kind}`;
  await wslStep({}, 'copy-build', [output, target]);
  return `${target}/${exe}`;
}

/**
 * Remove this run's Windows directory — from Windows, by its exact name, and only that. Inside the distribution
 * nothing is removed; what this harness family keeps in `/tmp` is listed instead, with its size.
 */
async function finishRun(dirs) {
  const root = fs.realpathSync.native(os.tmpdir());
  if (path.dirname(dirs.windows) === root && path.basename(dirs.windows) === `${WINDOWS_PREFIX}${RUN_ID}`) {
    try {
      fs.rmSync(dirs.windows, { recursive: true, force: true });
    } catch (error) {
      console.log(`      left ${dirs.windows}: ${error.message}`);
    }
  }
  const kept = await wslStep({}, 'disk-usage');
  console.log(`      inside WSL, ${LINUX_PREFIX}* now holds ${kept.stdout.trim().split(/\s+/)[0] || 'nothing'} — never removed by a harness; clear it by hand, or let the next boot empty /tmp`);
}

module.exports = {
  RUN_ID,
  REPO,
  run,
  stepArgv,
  wslStep,
  wslExec,
  asLinux,
  skip,
  windowsBuild,
  runDirectories,
  copyWindowsBinary,
  linuxBinary,
  finishRun,
};
