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
// with the command that fixes it, and that is reported as a skip rather than a pass. On Linux and macOS
// output streams as it arrives rather than appearing when the child exits, because a harness that waits
// on a socket looks identical to a hung one when its output is held back. On Windows the output appears
// when the harness ends: the reference's `run` holds it so that it can end the whole job (below).
//
// The lifecycle of common/test-leftovers.md, in the order this runner does it:
//
//   1. loads the helpers (`scripts/lib/leftovers.cjs`, `scripts/lib/processTree.mjs` and the mounted `proc.mjs`) fail-closed. No
//      mount: one line naming `git submodule update --init .claude/rules/shared`, no harness started, exit 1;
//   2. sweeps what a KILLED earlier run left, in BOTH roots (the temp root and the short socket root), through the wiring of
//      `run-tests.mjs`. It reports and never changes the exit code (its lines start `run-itests:`). It is a start-of-run sweep: a
//      single `itest:*` alias, or a harness started directly, does NOT sweep. A HARNESS makes and removes its own scratch through
//      `scripts/lib/harnessScope.cjs`, and the next runner run (`npm test`, `npm run itest:all`) or the janitor collects what a kill left.
//      On Windows the Node sweep COLLECTS NOTHING until F16 closes: it lists `unverified:` there;
//   3. exports the run's record ONCE as `TESTSTODELETE_RUN=<record>` to every harness, whatever the ambient environment held. A
//      folder a harness claims therefore belongs to this run (rule section 3);
//   4. ends the WHOLE tree of a harness that does not exit in time (15 minutes). POSIX: the harness starts in a process group of its
//      own and `endTree` asks whether the group and every process with this run's record are gone; a tree not confirmed ended is one
//      more phrase in that harness's FAIL line. Windows: the harness runs through the reference's `run` with `containTree`, and the
//      timeout closes its job. A harness that writes more than 32 MiB there is ended and fails;
//   5. a SIGINT, SIGTERM or SIGHUP stops the run, from the moment the runner starts (before the helpers load and the sweep): the signal goes
//      to the running compile or harness (its group, or its job on Windows), no further harness starts, the summary is printed (also when the
//      signal came during the compile), and the exit code is 128 + the signal's number. A harness that exits but leaves a descendant holding
//      its output is waited for 30 seconds, not for ever. On Windows the runner prints one line before each harness that its output is held
//      until it ends.
//
// There is NO harness-wide end audit here, unlike `npm test`. A harness's children may still be ending when it exits, and a removal
// by the run's record would remove a folder they use (D4). The summary names each harness's output size in bytes.
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import * as fs from 'node:fs';
import { constants } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { platform, argv, stdout, exit, execPath } from 'node:process';
import { HARD_BOUND_MS, canonicalRoots, forwardSignals, rootsOf, sweepAll, sweepFor } from './run-tests.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** How long any one harness may take. The WSL ones build a .NET project on first run. */
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * The most output one harness may write on Windows, where the reference's `run` holds it all until the harness ends. The default of
 * `run` is 4 MiB. The Linux run records each harness's output size (the summary names it), and 32 MiB is far above those.
 */
export const WINDOWS_OUTPUT_BUDGET_BYTES = 32 * 1024 * 1024;

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

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

/** The environment of a child: ours, and the run's record whatever the ambient environment held. */
const envOf = (run) => ({ ...process.env, TESTSTODELETE_RUN: run.record });

/**
 * One child on POSIX, streamed and bounded, in a process group of its own.
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
 *
 * <p>The group is what lets the timeout end the harness's WHOLE tree: `child.kill()` reaches the direct child only, and a grandchild
 * (`sshd`, `creds-mcp`) would run on.</p>
 */
function runInGroup(args, label, run) {
  return new Promise((resolve) => {
    const child = run.tree.startInOwnTree(
      execPath,
      args,
      { cwd: join(HERE, '..'), stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: envOf(run) },
      run.spawn,
    );
    const stopForwarding = forwardSignals(child, { signals: run.signals });
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
      run.tree.killWholeTree(child, run.tree.snapshotTree(child));
      if (!Number.isSafeInteger(child.pid)) child.kill();
    }, run.timeoutMs);

    // `error` fires instead of `close` when the command itself cannot be spawned, and then `status`
    // is null. Checking only the status reported that as a harness failure and lost the reason.
    let settled = false;
    let bound;
    const settle = async (code, openAfterMs) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(bound);
      stopForwarding();
      if (openAfterMs !== undefined) {
        child.stdout.destroy(); // nothing more is read from a pipe the runner has given up on
        child.stderr.destroy();
      }
      if (openAfterMs !== undefined) run.write(`${label}: its output was still open ${openAfterMs} ms after it exited — not waited for\n`);
      const note = openAfterMs === undefined ? '' : `; its output was still open ${openAfterMs} ms after it exited`;
      const failure = killedAt === '' ? (code === 0 ? '' : `exit ${code}`) : killedAt + note + (await treeNote(child, run));
      resolve({ text, failure });
    };
    child.once('error', (error) => {
      settled = true;
      clearTimeout(timer);
      clearTimeout(bound);
      stopForwarding();
      resolve({ text, failure: `could not start the harness (${error.message})` });
    });
    // The verdict is decided on `exit`. `close` also needs every holder of the output pipes to let go, and a descendant that left the
    // group can hold them for ever: so after `exit` the runner waits a bounded time for `close`, as `run-tests.mjs` does.
    child.once('exit', (code) => {
      bound = setTimeout(() => settle(code, run.closeBoundMs), run.closeBoundMs);
    });
    child.once('close', (code) => settle(code));
  });
}

/** After a timeout: ask whether the whole tree ended. A tree not confirmed ended is one more phrase for the FAIL detail; nothing is removed, because there is no audit. */
async function treeNote(child, run) {
  const ended = await run.tree.endTree(child, { confirm: run.confirm, survivors: run.survivors, record: run.record, platform: run.platform });
  if (ended.ended) return '';
  return `; the end of its process tree is not confirmed (${ended.alive > 0 ? `${ended.alive} still alive` : (ended.reason ?? 'unknown')})`;
}

/** The failure line of a contained run that did not end well: a start that failed, a stop by a signal, an overflow, the timeout, or the exit code. */
function containedFailure(answer, label, run) {
  if (answer.spawnFailed) return `could not start the harness (${answer.spawnError})`;
  if (answer.cancelled) return `${label}: stopped by ${run.signal ?? 'a signal'}`;
  if (answer.overflow) return `${label}: wrote more than ${WINDOWS_OUTPUT_BUDGET_BYTES} bytes — the tree was ended`;
  if (answer.timedOut) return `${label}: no exit within ${spanOf(run.timeoutMs)} — killed`;
  return answer.code === 0 ? '' : `exit ${answer.code}`;
}

/**
 * One child on Windows (Q1): the reference's `run` with `containTree: true` starts it under a job object and captures its output. Its
 * timeout closes the job, so the whole tree ends. The output appears when the child ends, not as it runs.
 */
async function runInJob(args, label, run) {
  const abort = new AbortController();
  run.abort = abort;
  const answer = await run.proc.run(execPath, args, {
    cwd: join(HERE, '..'),
    env: envOf(run),
    timeoutMs: run.timeoutMs,
    maxOutputBytes: WINDOWS_OUTPUT_BUDGET_BYTES,
    containTree: true,
    signal: abort.signal,
  });
  run.abort = undefined;
  const text = `${answer.out}${answer.err}`;
  if (text !== '') run.write(text);
  return { text, failure: containedFailure(answer, label, run) };
}

/** One child, streamed and bounded, whole tree contained: the group on POSIX, the job on Windows. */
const runNode = (args, label, run) => (run.platform === 'win32' ? runInJob(args, label, run) : runInGroup(args, label, run));

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
  const compiled = await runNode(run.compileArgs ?? [tsc, '-p', './'], 'compile', run);
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
  if (run.platform === 'win32') run.write(`itest:${harness.name} started — on Windows its output is held under the job until it ends\n`);
  const { text, failure } = await runNode([pathResolve(HERE, harness.script)], harness.name, run);
  const verdict = verdictOf(text, failure);
  return { ...harness, ...verdict, detail: `${verdict.detail}${verdict.detail === '' ? '' : ' '}(${Buffer.byteLength(text)} bytes of output)` };
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

/** The helpers, loaded on their own so that a failure to load them is ONE line and no start: the wrapper, the tree policy and the reference's launcher. The mount is imported at load by the last two, so a static `import` would crash before any refusal line. */
async function loadHelpers() {
  const helper = createRequire(import.meta.url)('./lib/leftovers.cjs');
  const tree = await import('./lib/processTree.mjs');
  const proc = await import(pathToFileURL(join(helper.REFERENCE_LIB, 'proc.mjs')).href);
  return { helper, tree, proc };
}

/**
 * Listen for SIGINT, SIGTERM and SIGHUP while the runner runs. The first one is remembered, and the harness that runs is told (the
 * group on POSIX through `forwardSignals`, the job on Windows through its abort signal). The runner starts no further harness. Because
 * a listener is registered, Node's default exit for these signals does not happen: the runner prints its summary and leaves with 128 + n.
 */
function watchSignals(signals, run) {
  const handlers = SIGNALS.map((name) => [name, () => {
    run.signal ??= name;
    run.abort?.abort();
  }]);
  for (const [name, handler] of handlers) signals.on(name, handler);
  return () => {
    for (const [name, handler] of handlers) signals.removeListener(name, handler);
  };
}

/** The code to leave with: 128 + the signal's number when a signal stopped the run, else the summary's. */
const codeOf = (run, code) => (run.signal === undefined ? code : 128 + (constants.signals[run.signal] ?? 0));

/** The start-of-run sweep of both roots, through the wiring `run-tests.mjs` uses. A sweep never changes the exit code. */
async function sweepRoots(seams, helper, write) {
  const line = (text) => write(`${text}\n`);
  const roots = seams.roots === undefined ? rootsOf(helper) : canonicalRoots(seams.roots);
  const sweep = await sweepFor(seams, helper, line, 'run-itests');
  if (sweep !== undefined) sweepAll({ sweep, options: seams.sweepOptions, roots, write: line, label: 'run-itests' });
}

/**
 * The compile and then each wanted harness, in order. Once a signal came nothing more is started, and the summary is still printed
 * (with the harnesses that ran, if any), so a stopped run says what it did. A compile that failed for another reason ends the run at once.
 */
async function runAll(harnesses, args, run, seams) {
  if (run.signal === undefined && seams.compile !== false && !(await compile(run)) && run.signal === undefined) return { results: [], code: 1 };
  const results = [];
  for (const harness of wantedOf(harnesses, args)) {
    if (run.signal !== undefined) break;
    results.push(await runOne(harness, run));
  }
  return { results };
}

/**
 * Run the harnesses `args` name and return the code to leave with. The seams are for tests: `spawn` (starts a child on POSIX), `run`
 * (the reference's `run`, on Windows), `loadHelpers`, `sweep`, `sweepOptions`, `roots`, `record`, `timeoutMs`, `write` (one chunk of text),
 * `signals` (what the runner listens on; the process by default), `platform`, `harnesses` (the catalogue), `compile` (`false` skips it),
 * `reachable`, `compileArgs` (the compiler's arguments), `closeBoundMs` (how long to wait for the output pipes after a harness exits), and `confirm` and `survivors` (the tree end's seams).
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
    spawn: seams.spawn,
    write,
    platform: seams.platform ?? platform,
    timeoutMs: seams.timeoutMs ?? TIMEOUT_MS,
    closeBoundMs: seams.closeBoundMs ?? HARD_BOUND_MS,
    compileArgs: seams.compileArgs,
    reachable: seams.reachable ?? reachable,
    signals: seams.signals ?? process,
    confirm: seams.confirm,
    survivors: seams.survivors,
    signal: undefined,
    abort: undefined,
  };
  // Listening starts here, before the helpers load and before the sweep: a signal at any later point is remembered, and nothing starts after it.
  const unwatch = watchSignals(run.signals, run);
  try {
    return await runWith(harnesses, args, run, seams);
  } finally {
    unwatch();
  }
}

/** The part of a run that needs the helpers: load them, sweep, then the compile and the harnesses. */
async function runWith(harnesses, args, run, seams) {
  let helpers;
  try {
    helpers = await (seams.loadHelpers ?? loadHelpers)();
  } catch (error) {
    run.write(`run-itests: ${String(error?.message ?? error).split('\n')[0]}\n`);
    return 1;
  }
  await sweepRoots(seams, helpers.helper, run.write);
  run.tree = helpers.tree;
  run.proc = seams.run === undefined ? helpers.proc : { run: seams.run };
  run.record = seams.record ?? helpers.helper.formatOwner(helpers.helper.thisOwner()); // held ONCE: every child gets this string
  const { results, code } = await runAll(harnesses, args, run, seams);
  return codeOf(run, code ?? summarize(results, run.write));
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
