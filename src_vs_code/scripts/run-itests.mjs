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
import { dirname, join } from 'node:path';
import { platform, argv, stdout, exit, execPath } from 'node:process';

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
    name: 'backup-archive',
    script: 'backup-archive-itest.cjs',
    needs: 'the server built - dotnet build src_minimalapi_server/src/CredVaultServer.csproj',
    windows: false,
  },
  { name: 'ssh-agent', script: 'ssh-agent-itest.cjs', needs: 'OpenSSH; its subject is the Windows named-pipe path', windows: true },
  { name: 'mcp-wsl', script: 'creds-mcp-wsl-itest.cjs', needs: 'a WSL distribution with the .NET SDK inside it', windows: true },
  { name: 'wsl-relay', script: 'wsl-agent-relay-itest.cjs', needs: 'a WSL distribution with the .NET SDK inside it', windows: true },
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

const args = argv.slice(2);
const withServer = args.includes('--with-server');
const selectors = args.filter((a) => !a.startsWith('-'));

/** An unknown name is refused by NAME, because a typo that runs nothing must not exit 0. */
const unknown = selectors.filter((s) => !HARNESSES.some((h) => h.name === s));
if (unknown.length > 0) {
  stdout.write(
    `unknown harness: ${unknown.join(', ')}\nlegal names: ${HARNESSES.map((h) => h.name).join(', ')}\n`,
  );
  exit(2);
}

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
function runNode(args, label) {
  return new Promise((resolve) => {
    const child = spawn(execPath, args, {
      cwd: join(HERE, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let text = '';
    let killedAt = '';
    const collect = (chunk) => {
      text += chunk;
      stdout.write(chunk);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(() => {
      killedAt = `${label}: no exit within ${TIMEOUT_MS / 60000} minutes — killed`;
      child.kill();
    }, TIMEOUT_MS);

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

// Once, not once per harness: every `itest:*` alias begins with `npm run compile`, so nine of them
// compile the same tree nine times. This calls the compiler itself, then the scripts.
stdout.write('===== compile =====\n');
const TSC = join(HERE, '..', 'node_modules', 'typescript', 'bin', 'tsc');
const compiled = await runNode([TSC, '-p', './'], 'compile');
if (compiled.failure !== '') {
  stdout.write(`\ncompile FAILED — ${compiled.failure}\n`);
  exit(1);
}

const wanted = HARNESSES.filter(
  (h) => (selectors.length === 0 ? !h.optIn || withServer : selectors.includes(h.name)),
);
const results = [];

for (const harness of wanted) {
  if (harness.windows && platform !== 'win32') {
    results.push({ ...harness, state: 'not-here', detail: `Windows only — ${harness.needs}` });
    continue;
  }
  if (harness.probe !== undefined && !(await reachable(harness.probe))) {
    results.push({ ...harness, state: 'skipped', detail: `nothing on ${harness.probe.port} — ${harness.needs}` });
    continue;
  }
  stdout.write(`\n===== itest:${harness.name} =====\n`);
  const { text, failure } = await runNode([join(HERE, harness.script)], harness.name);
  results.push({ ...harness, ...verdictOf(text, failure) });
}

stdout.write('\n===== summary =====\n');
for (const r of results) {
  stdout.write(`${r.state.padEnd(9)} itest:${r.name.padEnd(12)} ${r.detail}\n`);
}
const failed = results.filter((r) => r.state === 'FAIL');
const count = (state) => results.filter((r) => r.state === state).length;
stdout.write(
  failed.length === 0
    ? `\n${count('pass')} passed, ${count('skipped')} skipped, ${count('not-here')} not runnable here\n`
    : `\n${failed.length} harness(es) FAILED: ${failed.map((r) => r.name).join(', ')}\n` +
        'their output is above, streamed as it ran — research/module_tests.md has the cleanup for each\n',
);
exit(failed.length === 0 ? 0 : 1);
