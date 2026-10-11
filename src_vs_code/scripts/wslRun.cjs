'use strict';

/**
 * Where a WSL itest run keeps the binaries it starts — on both sides of the bridge, and never shared.
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

function run(exe, args, options = {}) {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: 300_000, maxBuffer: 16 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** One command inside the default distribution, as a login shell so PATH is a person's PATH. */
const wsl = (script) => run('wsl.exe', ['-e', 'bash', '-lc', script]);

/** A program inside the distribution with these exact arguments — no shell anywhere between. */
const wslExec = (args, options = {}) => run('wsl.exe', ['-e', ...args], options);

/** A Windows path as the distribution sees it. */
const asLinux = (winPath) =>
  winPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');

/** A path that may be written into a `bash -lc` line: no quote, no `$`, no backtick, no space. */
function plainPath(value) {
  if (!/^[A-Za-z0-9/_.:-]+$/.test(value)) {
    throw new Error(`refusing to put ${JSON.stringify(value)} into a shell line`);
  }
  return value;
}

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

/** The repo-relative inputs of one Linux build: the projects' sources plus the shared build files. */
function buildInputs(projects) {
  const files = ['Directory.Build.props', 'Directory.Packages.props', 'nuget.config', 'contract/broker-v1.json'];
  for (const project of projects) {
    const dir = path.join(REPO, project, 'src');
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.cs') || name.endsWith('.csproj')) {
        files.push(plainPath(`${project}/src/${name}`));
      }
    }
  }
  return files;
}

/** The build directory for exactly these inputs: a hash of their names and bytes. */
function buildDirectory(kind, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(REPO, file))).update('\0');
  }
  return `${LINUX_PREFIX}build-${kind}-${hash.digest('hex').slice(0, 12)}`;
}

/**
 * Build `project` for Linux inside the distribution, once per set of inputs, then copy its output into this
 * run's Linux directory. Answers the copied executable, or undefined when the build failed (its tail printed).
 */
async function linuxBinary(dirs, { kind, project, projects, exe }) {
  const files = buildInputs(projects);
  const build = plainPath(buildDirectory(kind, files));
  const output = `${build}/${project}/src/bin/Debug/net10.0`;
  const repo = plainPath(asLinux(REPO));
  const built = await wsl(`test -x ${output}/${exe} && echo yes`);
  if (!built.stdout.includes('yes')) {
    console.log(`      building the Linux ${exe} inside WSL into ${build} (once per change, a minute or so)…`);
    const dirsToMake = [...new Set(files.map((f) => `${build}/${path.posix.dirname(f)}`))].join(' ');
    const copies = files.map((f) => `cp ${repo}/${f} ${build}/${f}`).join(' && ');
    // No AOT: the distribution has the SDK but not necessarily a native linker, and the code under test is
    // identical either way — only the packaging differs.
    const result = await wsl(
      `mkdir -p ${dirsToMake} && ${copies} && cd ${build}/${project}/src && dotnet build -c Debug -p:PublishAot=false 2>&1 | tail -5`,
    );
    if (!(await wsl(`test -x ${output}/${exe} && echo yes`)).stdout.includes('yes')) {
      console.log(result.stdout.trim());
      return undefined;
    }
  }
  const target = `${plainPath(dirs.linux)}/${kind}`;
  await wsl(`mkdir -p ${target} && cp -r ${output}/. ${target}/`);
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
  const kept = await wsl(`du -sch ${LINUX_PREFIX}* 2>/dev/null | tail -1`);
  console.log(`      inside WSL, ${LINUX_PREFIX}* now holds ${kept.stdout.trim().split(/\s+/)[0] || 'nothing'} — never removed by a harness; clear it by hand, or let the next boot empty /tmp`);
}

module.exports = {
  RUN_ID,
  REPO,
  run,
  wsl,
  wslExec,
  asLinux,
  plainPath,
  windowsBuild,
  runDirectories,
  copyWindowsBinary,
  linuxBinary,
  finishRun,
};
