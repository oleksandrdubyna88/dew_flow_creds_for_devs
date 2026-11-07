// Every scenario harness this platform can run, in one command, with exit codes captured.
//
//   npm run itest:all                        every harness this machine can run
//   npm run itest:all -- agent git mcp       a named subset
//   npm run itest:all -- --with-server       include the one that needs a server started by hand
//
// Why this exists: a reviewer asked for it and was right. The harnesses were run by whoever
// remembered them, one at a time, and on 2026-09-06 one of them turned out to have been unable to
// START for long enough that git history was the only way to date it. A person running nine
// commands by hand can miss a crash among the passes; a runner that collects exit codes cannot.
//
// It does NOT replace CI. Four of these cannot run on the Ubuntu runner and the reasons are in
// research/module_tests.md — this is the command for the machine that can run them.
//
// Nothing is skipped silently: a harness whose prerequisites are missing prints its own SKIP line
// with the command that fixes it, and that is reported as a skip rather than a pass. Output streams
// as it arrives rather than appearing when the child exits, because a harness that waits on a socket
// looks identical to a hung one when its output is held back.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { platform, argv, stdout, exit, execPath } from 'node:process';
import * as fs from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** How long any one harness may take. The WSL ones build a .NET project on first run. */
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Every harness, with the script it is and what it needs.
 *
 * <p>The script is named rather than the npm alias, and `node` is spawned on it directly. A reviewer
 * asked for `shell: false` and was right about the smell — but the mechanical fix, dropping `shell`
 * while still calling `npm`, fails on Windows with `EINVAL`: since the CVE-2024-27980 mitigation
 * Node refuses to spawn a `.cmd` without a shell, and `npm` on Windows IS `npm.cmd`. Going straight
 * to `node` avoids the shell AND the alias, and compiles once instead of nine times, because every
 * `itest:*` script begins with its own `npm run compile`.</p>
 */
const HARNESSES = [
  { name: 'agent', script: 'agent-broker-itest.cjs', needs: 'nothing', windows: false },
  { name: 'git', script: 'git-transport-itest.cjs', needs: 'git', windows: false },
  { name: 'cli', script: 'creds-cli-itest.cjs', needs: 'the .NET CLI built — dotnet build src_cli/src/CredsCli.csproj', windows: false },
  { name: 'mcp', script: 'creds-mcp-itest.cjs', needs: 'creds-mcp built — dotnet build src_mcp/src/CredsMcp.csproj', windows: false },
  { name: 'masked-run', script: 'masked-run-itest.cjs', needs: 'nothing', windows: false },
  {
    // The one harness outside this directory: it drives the SERVER binary, so it lives in the
    // server's tree and runs on the server's CI path filter. `itest:all` still covers it, because a
    // catalogue with a hole in it is how a harness comes to prove nothing.
    name: 'backup-archive',
    script: '../../src_minimalapi_server/scripts/backup-archive-itest.cjs',
    needs: 'the server built - dotnet build src_minimalapi_server/src/CredVaultServer.csproj',
    windows: false,
  },
  { name: 'ssh-agent', script: 'ssh-agent-itest.cjs', needs: 'OpenSSH; its subject is the Windows named-pipe path', windows: true },
  { name: 'mcp-wsl', script: 'creds-mcp-wsl-itest.cjs', needs: 'a WSL distribution with the .NET SDK, node and python3 inside it', windows: true },
  { name: 'wsl-relay', script: 'wsl-agent-relay-itest.cjs', needs: 'a WSL distribution with the .NET SDK, python3 and OpenSSH inside it', windows: true },
  {
    name: 'server',
    script: 'server-transport-itest.cjs',
    needs: 'a running Cred Vault Server on 127.0.0.1:5113 with the Local auth scheme',
    windows: false,
    // Not in the default set, and a reviewer was right about why: an "all tests" command that
    // always exits 1 on a freshly built checkout cannot be the routine health check it advertises.
    // `--with-server` opts in; without it the harness is reported as skipped, not as passing.
    optIn: true,
    probe: { host: '127.0.0.1', port: 5113 },
  },
];

/** Is something listening? Used only to tell "no server" from "the harness is broken". */
function reachable({ host, port }) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

/** A span of time as the kill line says it: whole minutes when it is, else seconds. */
function spanOf(ms) {
  return ms % 60000 === 0 ? `${ms / 60000} minutes` : `${ms / 1000} seconds`;
}

/**
 * One harness, streamed and bounded.
 *
 * <p>`spawn` rather than `spawnSync` for two reasons a reviewer named: a synchronous call has no way
 * to stream, so a slow harness is indistinguishable from a hung one, and it has no way to be killed,
 * so a deadlock inside a harness deadlocks the runner.</p>
 *
 * <p>And `node` rather than `npm run`, with no shell at all. A reviewer asked for `shell: false` and
 * was right about the smell; the mechanical version of that fix — dropping `shell` while still
 * calling `npm` — fails on Windows with `EINVAL`, because since the CVE-2024-27980 mitigation Node
 * refuses to spawn a `.cmd` without a shell, and `npm` on Windows IS `npm.cmd`. Measured here before
 * this comment was written. Naming the script directly avoids the shell and the alias together.</p>
 */
function runNode(args, label, run) {
  return new Promise((resolve) => {
    const child = run.spawn(execPath, args, {
      cwd: join(HERE, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let text = '';
    let killedAt = '';
    const collect = (chunk) => {
      text += chunk;
      run.write(chunk);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(() => {
      killedAt = `${label}: no exit within ${spanOf(run.timeoutMs)} — killed`;
      child.kill();
    }, run.timeoutMs);

    // `error` fires instead of `close` when the command itself cannot be spawned, and then `status`
    // is null. Checking only the status reported that as a harness failure and lost the reason.
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ text, failure: `could not start node: ${error.message}` });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ text, failure: killedAt || (code === 0 ? '' : `exit ${code}`) });
    });
  });
}

/**
 * What one run amounts to: the harness said SKIP, or it exited well, or it did not.
 *
 * <p>A skip WINS over an exit code, because a harness that says "no WSL here, install it" and then
 * exits 0 must not be counted as a pass — the whole point of this runner is that nothing is green
 * for a reason nobody read.</p>
 */
function verdictOf(text, failure) {
  const said = (text.match(/^SKIP — (.*)$/m) ?? [])[1];
  if (said !== undefined) {
    return { state: 'skipped', detail: said };
  }
  return failure === '' ? { state: 'pass', detail: '' } : { state: 'FAIL', detail: failure };
}

/** The harnesses this call wants: the named ones, or the default set (the opt-in ones only with `--with-server`). */
function wantedOf(harnesses, args) {
  const withServer = args.includes('--with-server');
  const selectors = args.filter((a) => !a.startsWith('-'));
  return harnesses.filter((h) => (selectors.length === 0 ? !h.optIn || withServer : selectors.includes(h.name)));
}

/** An unknown name is refused by NAME, because a typo that runs nothing must not exit 0. The line to write, or `undefined`. */
function refusalOf(harnesses, args) {
  const unknown = args.filter((a) => !a.startsWith('-')).filter((s) => !harnesses.some((h) => h.name === s));
  if (unknown.length === 0) return undefined;
  return `unknown harness: ${unknown.join(', ')}\nlegal names: ${harnesses.map((h) => h.name).join(', ')}\n`;
}

/** Once, not once per harness: every `itest:*` alias begins with `npm run compile`, so nine of them compile the same tree nine times. This calls the compiler itself, then the scripts. */
async function compile(run) {
  run.write('===== compile =====\n');
  const tsc = join(HERE, '..', 'node_modules', 'typescript', 'bin', 'tsc');
  const compiled = await runNode([tsc, '-p', './'], 'compile', run);
  if (compiled.failure === '') return true;
  run.write(`\ncompile FAILED — ${compiled.failure}\n`);
  return false;
}

/** One harness: its result row. A harness that cannot run here, or whose server is not there, is a row without a start. */
async function runOne(harness, run) {
  if (harness.windows && run.platform !== 'win32') {
    return { ...harness, state: 'not-here', detail: `Windows only — ${harness.needs}` };
  }
  if (harness.probe !== undefined && !(await run.reachable(harness.probe))) {
    return { ...harness, state: 'skipped', detail: `nothing on ${harness.probe.port} — ${harness.needs}` };
  }
  run.write(`\n===== itest:${harness.name} =====\n`);
  const { text, failure } = await runNode([pathResolve(HERE, harness.script)], harness.name, run);
  return { ...harness, ...verdictOf(text, failure) };
}

/** The summary, and the code to leave with. */
function summarize(results, write) {
  write('\n===== summary =====\n');
  for (const r of results) {
    write(`${r.state.padEnd(9)} itest:${r.name.padEnd(12)} ${r.detail}\n`);
  }
  const failed = results.filter((r) => r.state === 'FAIL');
  const count = (state) => results.filter((r) => r.state === state).length;
  write(
    failed.length === 0
      ? `\n${count('pass')} passed, ${count('skipped')} skipped, ${count('not-here')} not runnable here\n`
      : `\n${failed.length} harness(es) FAILED: ${failed.map((r) => r.name).join(', ')}\n` +
          'their output is above, streamed as it ran — research/module_tests.md has the cleanup for each\n',
  );
  return failed.length === 0 ? 0 : 1;
}

/**
 * Run the harnesses `args` name and return the code to leave with. The seams are for tests: `spawn` (starts a child),
 * `write` (one chunk of text), `platform`, `timeoutMs`, `harnesses` (the catalogue), `compile` (`false` skips the compile).
 */
export async function runHarnesses(args, seams = {}) {
  const harnesses = seams.harnesses ?? HARNESSES;
  const write = seams.write ?? ((text) => stdout.write(text));
  const refusal = refusalOf(harnesses, args);
  if (refusal !== undefined) {
    write(refusal);
    return 2;
  }
  const run = {
    spawn: seams.spawn ?? spawn,
    write,
    platform: seams.platform ?? platform,
    timeoutMs: seams.timeoutMs ?? TIMEOUT_MS,
    reachable: seams.reachable ?? reachable,
  };
  if (seams.compile !== false && !(await compile(run))) return 1;
  const results = [];
  for (const harness of wantedOf(harnesses, args)) results.push(await runOne(harness, run));
  return summarize(results, write);
}

const invokedDirectly = (() => {
  try {
    return Boolean(argv[1]) && fs.realpathSync(argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  exit(await runHarnesses(argv.slice(2)));
}
