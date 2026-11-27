// The rig of `bridge-note-itest.cjs` (change 11.1, the 72-hour slice, S1 and S2): the laptop's broker with E1's wall, and connections of
// a Remote Bridge made as the product makes them, each with its OWN `sshd -d` (one serves one connection), its own listener (a fresh key),
// its own socket path, a real `ssh -R` from the product's argv, and a note published by the product's one-shot ssh into the rig's home.
// The product's `BridgeSession` (out/bridgeSession.js) drives them, so the reconnect, the Lock and the Close are the product's.
// POSIX only; the caller skips elsewhere.
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { launch, startSshd, endChild, checkedPinOf } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

const OUT = path.join(__dirname, '..', 'out');

function keygen(file) {
  return new Promise((resolve) => {
    // The PATH's ssh-keygen is the tool under test, as in `itestBridgedRig.cjs`.
    execFile('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], { timeout: 15_000 }, (error, _out, stderr) => { // NOSONAR: a CI rig, the PATH's ssh-keygen is the tool under test
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

/** Resolves `true` once `probe()` is, `false` after `ms`. Polls every 50 ms. */
async function within(ms, probe) {
  const deadline = Date.now() + ms;
  while (!(await probe())) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

/** Whether something accepts a connect on the unix socket at `file`. */
const answers = (file) =>
  new Promise((resolve) => {
    const socket = net.connect(file);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/** One run of a client binary: its exit code, stdout and stderr. Bounded: 30 s. */
function run(exe, args, env) {
  return new Promise((resolve) => {
    execFile(exe, args, { env, timeout: 30_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : String(error.code ?? error.signal)) : 0, stdout, stderr });
    });
  });
}

/**
 * A `creds-mcp` that stays up, as an agent's does: the handshake once, then `call(tool)` as often as asked, answered by id. Stdin stays
 * open (closing it ends the server). Ended with the scope.
 */
function mcpProcess(scope, exe, env) {
  const child = spawn(exe, [], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  scope.after(() => {
    child.stdin.end();
    child.kill();
  });
  const waiting = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let end = buffer.indexOf('\n');
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf('\n');
      try {
        const message = JSON.parse(line);
        waiting.get(message.id)?.(message);
        waiting.delete(message.id);
      } catch {
        /* not a JSON-RPC line */
      }
    }
  });
  let next = 1;
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const ask = (method, params) =>
    new Promise((resolve) => {
      const id = next;
      next += 1;
      const timer = setTimeout(() => resolve(undefined), 30_000);
      waiting.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      send({ jsonrpc: '2.0', id, method, params });
    });
  const ready = ask('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bridge-note-itest', version: '1' } }).then(() =>
    send({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  );
  return {
    pid: child.pid,
    alive: () => child.exitCode === null && child.signalCode === null,
    call: async (tool) => {
      await ready;
      const reply = await ask('tools/call', { name: tool, arguments: {} });
      return reply?.result?.content?.map((part) => part.text ?? '').join('\n') ?? JSON.stringify(reply?.error ?? reply);
    },
  };
}

/** The entry the product's argv is built for: loopback, this user, the sshd's port. */
const entityOn = (port) => ({ id: 'server1', name: 'prod server', host: '127.0.0.1', user: os.userInfo().username, port, isSshEnabled: true });

/** The rig: keys, a home for the server's login, an empty announcement folder, the laptop's broker with its wall. */
async function makeRig(scope, check) {
  const dir = ownedDir(scope, 'bnote', { parent: shortSocketRoot() });
  const rig = {
    dir, scope, check, count: 0, hold: undefined,
    hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'),
    home: path.join(dir, 'home'), endpoints: path.join(dir, 'endpoints'),
    connections: [],
  };
  const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey));
  check('the throwaway keys were generated', failed === undefined, failed);
  fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
  fs.mkdirSync(rig.home, { mode: 0o700 });
  fs.mkdirSync(rig.endpoints);
  // No agent of the person's, no socket variable, no announcement folder of the person's: the rig names each of them itself.
  const dropped = new Set(['SSH_AUTH_SOCK', 'CREDS_BROKER_SOCKET', 'CREDS_ENDPOINT_DIR']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !dropped.has(name)));
  rig.env = env;
  // The server's clients: the rig's home, an EMPTY announcement folder, no socket variable. Only the note can lead them to the laptop.
  rig.clientEnv = harnessScope.tempEnv(ownedDir(scope, 'bntmp'), { ...env, HOME: rig.home, CREDS_ENDPOINT_DIR: rig.endpoints, CREDS_RELAYED_FROM_WSL: '1' });
  const world = require(path.join(OUT, 'test', 'bridgeWallWorld.js'));
  rig.context = world.CONTEXT_1;
  rig.ww = await world.wallWorld({});
  scope.after(() => rig.ww.dispose());
  return rig;
}

/** One `sshd -d` in a folder of its own; `extra` are more config lines. `undefined` after a FAIL that names why. */
async function sshdFor(rig, name, extra = []) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  const started = await startSshd(rig.scope, dir, rig.hostKey, rig.authorizedKeys, extra);
  rig.check(`${name}: its sshd started`, started.failure === undefined, started.failure);
  return started.failure === undefined ? started : (await endChild(started.sshd), undefined);
}

async function optionsFor(rig, started, listener, socket) {
  return { port: listener.port, remote: { path: socket }, keyPath: rig.userKey, auth: 'key', knownHostsFile: await checkedPinOf(OUT, started.knownHosts) };
}

/** The note of one connection, published by the product's one-shot ssh into the rig's home (that sshd's ForceCommand sets HOME). */
async function publish(rig, record) {
  const started = await sshdFor(rig, `note-${record.n}`, [`ForceCommand HOME=${rig.home} exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"`]);
  if (started === undefined) {
    return { ok: false, reason: 'no sshd for the note' };
  }
  const { buildNoteArgv } = require(path.join(OUT, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(OUT, 'sshCommand.js'));
  const { writeBridgeNote } = require(path.join(OUT, 'bridgeNoteWriter.js'));
  const argv = buildNoteArgv(entityOn(started.port), await optionsFor(rig, started, record.listener, record.remotePath), isSafeSshTarget, record.id);
  const note = { socket: record.remotePath, port: record.listener.port, brokerPort: rig.ww.main, key: record.listener.key, serverName: 'prod server', openedAt: new Date().toISOString() };
  const written = await writeBridgeNote(note, argv, rig.env);
  await endChild(started.sshd);
  record.published = written.ok;
  return written;
}

/**
 * One connection, as `connectScoped` makes it: a fresh id, socket path and listener; the product's `ssh -R` argv into a fresh `sshd -d`;
 * the forward up before it is handed back. Recorded in `rig.connections`. `undefined` when the forward does not come up.
 */
async function connect(rig) {
  rig.count += 1;
  const n = rig.count;
  const id = `0f1e2d3c4b5a00${String(n).padStart(2, '0')}`;
  const remotePath = path.join(rig.dir, `b-${n}.sock`);
  const listener = await rig.ww.w.server.openBridgeListener({ ...rig.context, bridgeId: `bridge-${n}` });
  const started = await sshdFor(rig, `forward-${n}`);
  if (started === undefined) {
    await listener.close();
    return undefined;
  }
  const { buildBridgeArgv } = require(path.join(OUT, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(OUT, 'sshCommand.js'));
  const argv = buildBridgeArgv(entityOn(started.port), await optionsFor(rig, started, listener, remotePath), isSafeSshTarget);
  const tunnel = launch(rig.scope, 'ssh', argv, { env: rig.env });
  const up = await within(15_000, () => answers(remotePath));
  rig.check(`connection ${n}: the real ssh -R forwards the server's socket to its own listener`, up, `${tunnel.stderr.trim()}\n${started.sshd.stderr.trim().split('\n').slice(-8).join('\n')}`);
  if (!up) {
    await endChild(tunnel);
    await listener.close();
    return undefined;
  }
  const record = { n, id, remotePath, listener, tunnel, sshd: started, published: false, stopped: false };
  rig.connections.push(record);
  return {
    remotePath,
    exited: tunnel.done.then(() => listener.close()),
    stop: () => {
      record.stopped = true;
      void endChild(tunnel);
      void listener.close();
    },
    publish: () => publish(rig, record),
  };
}

/** A network drop: the tunnel's ssh dies (and its `sshd -d` with it). */
async function drop(record) {
  await endChild(record.tunnel);
  await endChild(record.sshd.sshd);
}

/** The product's session over this rig's connections; `rig.hold` (when set) holds a reconnect just before it publishes. */
function sessionOf(rig, flags) {
  const { BridgeSession } = require(path.join(OUT, 'bridgeSession.js'));
  return new BridgeSession({
    connect: () => connect(rig),
    unlocked: () => flags.unlocked,
    owns: () => true,
    beforePublish: () => (rig.hold === undefined ? Promise.resolve() : rig.hold()),
    delays: [200],
  });
}

/** The note folder, and the one note in it (the writer removes the others). */
function noteFile(rig) {
  const folder = path.join(rig.home, '.creds-for-devs', 'bridge');
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith('.json')) : [];
  return { folder, file: files.length === 1 ? path.join(folder, files[0]) : undefined, count: files.length };
}

module.exports = { within, answers, run, mcpProcess, makeRig, sessionOf, drop, noteFile };
