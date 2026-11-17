// Section 9 of `ssh-agent-itest.cjs` (G2, `PLAN_bridge_no_connection_sharing.md` §7.4), in a file of its own so that script stays
// under the 800-line limit.
//
// The extension's own `ssh` calls must share no connection, whatever the laptop's `~/.ssh/config` says. The product sends
// `NO_CONNECTION_SHARING` (`sshExecCommand.ts`: `ControlPath=none`, `ControlMaster=no`) in the tunnel of a Remote Bridge and in every
// run, and a unit test can only show that the options are IN the argv (`testing.md`: a sent option is not a measured protection).
// So this asks a real `ssh` and real `sshd -d` runs, under a config file with `ControlMaster auto`, a FIXED `ControlPath` and a
// finite `ControlPersist`:
//   K-A  (control) the tunnel's argv with the two options taken out, no master before: the spawned ssh exits with 0, a detached
//        master holds the forward, and the product's `stop()` changes nothing;
//   P-B  the production tunnel: it serves the forward while it runs, makes no control socket, and `stop()` ends the forward;
//   then a master on sshd A, opened as a person would (a plain `ssh`), and for each leg below an sshd B of its own:
//   K-C  (control) the tunnel without the two options, for B, with a WRONG key and a WRONG pin: it rides the master, exit 0, the
//        forward is served and B sees no connection;
//   P-D1 the production tunnel for B: B accepts the key, the forward is served, `stop()` ends it;
//   P-D2 the same with the wrong pin: exit 255, `Host key verification failed`;
//   P-D3 the same with the wrong key: exit 255, `Permission denied`;
//   P-X  the production run off a bridge (`buildSshExecArgv`), for B: the command ran on B;
//   K-I  (control) that run without the two options, with a key file that has a passphrase and is in no agent: it rides the master;
//   P-I1 the production run with that key: exit 255, `Permission denied` (a credential that needs a person fails; plan change 1.1);
//   P-I2 the same with the key in an `ssh-agent` of the run's environment: the command ran on B (what needs nobody still works).
//        The agent lives for that leg only.
//
// POSIX only, like sections 5, 7 and 8; with `CI=true` a missing sshd FAILS. `sshd -d` serves one connection, so every leg that
// connects has an sshd of its own. A tunnel is started by the product's own `SshBridgeManager` and `bridgeSpawner`, so `stop()` is
// the product's. Teardown: the tunnels, `ssh -O exit` for the detached master of K-A, the master, every sshd by its pid, the agent of
// P-I2, the listener, the folder. A master that outlives a killed run ends by itself: `ControlPersist` is 60 s here, never `yes`.
const fs = require('fs');
const net = require('node:net');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, startSshd, endChild } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

/** The two options, spelled once more here on purpose: a control leg takes them OUT of a production argv. Nothing here adds them. */
const TWO = ['ControlPath=none', 'ControlMaster=no'];

/** What the test's listener answers: a forward is SERVED when this line is read through the remote socket. */
const LINE = 'creds-g2-forward\n';

/** What a connection leaves in `sshd -d`'s stderr. */
const CONNECTED = /Connection from 127\.0\.0\.1/;
const ACCEPTED = /Accepted publickey/;

const destination = `${os.userInfo().username}@127.0.0.1`;

/** The PATH's OpenSSH tool with `args`; resolves its trimmed stderr on failure, `undefined` on success. */
function tool(name, args, env) {
  return new Promise((resolve) => {
    // The PATH lookup is on purpose, as in section 8: the PATH's OpenSSH tools are the ones the extension starts.
    execFile(name, args, { timeout: 15_000, env }, (error, _out, stderr) => { // NOSONAR: a CI rig, the PATH's OpenSSH is the tool under test (see above)
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

/** Resolves `true` when `probe()` is true, `false` when `ms` have passed first. Polls every 50 ms. */
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

/** One connect to the remote end of a forward: the text read through it, or the error's code. Bounded: 5 s. */
function readThrough(socketPath) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    let text = '';
    const timer = setTimeout(() => socket.destroy(new Error('timeout')), 5_000);
    socket.on('data', (chunk) => {
      text += chunk;
    });
    socket.on('error', (error) => {
      text = `error: ${error.code ?? error.message}`;
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(text);
    });
  });
}

/** Whether the forward behind `socketPath` is served now. */
const served = async (socketPath) => (await readThrough(socketPath)) === LINE;

/** The last lines of a started sshd's stderr, for a failure message. */
const sshdTail = (started) => started.sshd.stderr.trim().split(/\r?\n/).slice(-12).join('\n');

/** The entry the production argv is built for: the loopback address, this user and the sshd's port. */
const entityOn = (port) => ({ id: 'e-nsh', name: 'nsh', host: '127.0.0.1', user: os.userInfo().username, port, isSshEnabled: true });

/** `argv` with every `-o <one of TWO>` pair taken out: what the builders sent before G2. */
function withoutTheTwo(argv) {
  const gone = new Set(argv.flatMap((arg, i) => (arg === '-o' && TWO.includes(argv[i + 1]) ? [i, i + 1] : [])));
  return argv.filter((_, i) => !gone.has(i));
}

/** A throwaway sshd in a folder of its own, or `undefined` after a failed check that names why. */
async function sshdFor(check, rig, name) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  const started = await startSshd(rig.scope, dir, rig.hostKey, rig.authorizedKeys);
  check(`${name}: its sshd started`, started.failure === undefined, started.failure);
  return started.failure === undefined ? started : (await endChild(started.sshd), undefined);
}

/** A config as a laptop that shares connections has it, with a control path of its own. `ControlPersist` is finite on purpose. */
function sharingConfig(rig, name) {
  const config = path.join(rig.dir, `${name}.config`);
  const control = path.join(rig.dir, `${name}.cm`);
  fs.writeFileSync(config, `Host *\n  ControlMaster auto\n  ControlPath ${control}\n  ControlPersist 60\n`);
  return { config, control };
}

/** A `known_hosts` file that names `started`'s address with a key that is NOT its host key: the wrong pin. */
function wrongPin(rig, started, name) {
  const file = path.join(rig.dir, `${name}.known_hosts`);
  const stranger = fs.readFileSync(`${rig.wrongKey}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
  fs.writeFileSync(file, `[127.0.0.1]:${started.port} ${stranger}\n`);
  return file;
}

/** The production argv of a tunnel to `started`, whose forward ends at the test's listener. */
function tunnelArgv(rig, started, remote, parts = {}) {
  const { buildBridgeArgv } = require(path.join(rig.out, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(rig.out, 'sshCommand.js'));
  const options = { port: rig.listenerPort, remote: { path: remote }, keyPath: parts.key ?? rig.userKey, knownHostsFile: parts.pin ?? started.knownHosts, auth: 'key' };
  return buildBridgeArgv(entityOn(started.port), options, isSafeSshTarget);
}

/** The production argv of a run off a bridge on `started`: a key entry, as *Run with Secrets* and an agent's `ssh:exec` build it. */
function runArgv(rig, started, key) {
  const { buildSshExecArgv } = require(path.join(rig.out, 'sshExecCommand.js'));
  return buildSshExecArgv(entityOn(started.port), key, 'printenv SSH_CONNECTION', 'key', { knownHostsFile: started.knownHosts });
}

/** A tunnel started as the product starts one: `SshBridgeManager.start` over `bridgeSpawner`. `exit` is `'running'` until `exited` settles. */
function startTunnel(rig, config, argv, remote) {
  const { SshBridgeManager } = require(path.join(rig.out, 'sshBridgeManager.js'));
  const { bridgeSpawner } = require(path.join(rig.out, 'bridgeSpawner.js'));
  const tunnel = { exit: 'running', errors: [], remote };
  tunnel.manager = new SshBridgeManager(bridgeSpawner({ report: (error) => tunnel.errors.push(String(error)) }));
  rig.scope.after(() => tunnel.manager.dispose()); // a signal in the middle of a leg ends the tunnel too
  const bridge = tunnel.manager.start('nsh', remote, 'ssh', ['-F', config, ...argv], rig.env);
  tunnel.exited = bridge.process.exited.then((code) => {
    tunnel.exit = code;
  });
  return tunnel;
}

/** Resolves when `promise` has, or `ms` after this call — whichever is first; the timer does not outlive the race. */
function settledAfter(promise, ms) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

/** A real ssh with `argv` under `config`: its exit code, what it printed and what it said. Bounded: 20 s. */
async function runClient(rig, config, argv, env = rig.env) {
  const client = launch(rig.scope, 'ssh', ['-F', config, ...argv], { env });
  try {
    const code = await settledAfter(client.done, 20_000);
    await settledAfter(client.closed, 2000); // output that arrived between `exit` and `close`
    return { code: code ?? 'timeout', stdout: client.stdout.trim(), stderr: client.stderr.trim() };
  } finally {
    await endChild(client);
  }
}

/** K-A: without the two options the spawned ssh is NOT the connection: it exits, a detached master serves the forward, and `stop()` changes nothing. */
async function controlDetachedMaster(check, rig) {
  const started = await sshdFor(check, rig, 'k-a');
  if (started === undefined) {
    return;
  }
  const { config, control } = sharingConfig(rig, 'k-a');
  const remote = path.join(rig.dir, 'k-a.sock');
  const tunnel = startTunnel(rig, config, withoutTheTwo(tunnelArgv(rig, started, remote)), remote);
  try {
    await settledAfter(tunnel.exited, 10_000);
    check('K-A control: without the two options the spawned ssh exits with 0 while the bridge is wanted', tunnel.exit === 0, `exit ${tunnel.exit}\n${sshdTail(started)}`);
    check('K-A control: and the forward is served after that exit, by a detached master', await within(5_000, () => served(remote)), await readThrough(remote));
    check('K-A control: the master left its control socket', fs.existsSync(control), control);
    tunnel.manager.stop('nsh');
    await new Promise((resolve) => setTimeout(resolve, 300));
    check("K-A control: the product's stop() changes nothing: the forward is still served", await served(remote), await readThrough(remote));
  } finally {
    const said = await tool('ssh', ['-F', config, '-O', 'exit', '-p', String(started.port), destination], rig.env);
    check('K-A: the detached master is ended by `ssh -O exit`, and its control socket is gone', await within(5_000, () => !fs.existsSync(control)), said);
    await endChild(started.sshd);
  }
}

/**
 * A production tunnel that is up: the forward is served WHILE the spawned ssh runs, and `stop()` ends both. Used by P-B and P-D1.
 * `control` is the control path of a config with no master yet (P-B): it is looked at while the tunnel runs, because a master
 * removes its socket when it ends.
 */
async function tunnelLivesAndDies(check, rig, name, config, started, control) {
  const remote = path.join(rig.dir, `${name}.sock`);
  const tunnel = startTunnel(rig, config, tunnelArgv(rig, started, remote), remote);
  const up = await within(10_000, () => tunnel.exit !== 'running' || served(remote));
  check(`${name}: the production tunnel serves the forward while its ssh runs`, up && tunnel.exit === 'running' && (await served(remote)), `exit ${tunnel.exit}; read ${JSON.stringify(await readThrough(remote))}\n${sshdTail(started)}`);
  check(`${name}: it logged in by itself: its sshd accepted the key`, ACCEPTED.test(started.sshd.stderr), sshdTail(started));
  if (control !== undefined) {
    check(`${name}: it became no master: the control path of its config is not made while it runs`, !fs.existsSync(control), control);
  }
  const stopped = tunnel.manager.stop('nsh');
  await settledAfter(tunnel.exited, 5_000);
  check(`${name}: stop() ends the spawned ssh`, stopped && tunnel.exit !== 'running', `stop() answered ${stopped}; exit ${tunnel.exit}; ${tunnel.errors.join('; ')}`);
  check(`${name}: and after stop() the forward is not served`, await within(3_000, async () => !(await served(remote))), await readThrough(remote));
}

/** P-B: no master before. */
async function productionTunnel(check, rig) {
  const started = await sshdFor(check, rig, 'p-b');
  if (started === undefined) {
    return;
  }
  const { config, control } = sharingConfig(rig, 'p-b');
  try {
    await tunnelLivesAndDies(check, rig, 'P-B', config, started, control);
  } finally {
    await endChild(started.sshd);
  }
}

/** The master: a plain ssh to A under the sharing config, as a person opens one, held open until the group is over. */
async function startMaster(rig, a, mux) {
  const argv = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${a.knownHosts}`, '-i', rig.userKey, '-p', String(a.port), destination, 'sleep 120'];
  const master = launch(rig.scope, 'ssh', ['-F', mux.config, ...argv], { env: rig.env });
  return { master, up: await within(15_000, () => fs.existsSync(mux.control)) };
}

/** K-C: with a master up, the tunnel without the two options rides it: a wrong key and a wrong pin are not even looked at. */
async function controlRidesMaster(check, group) {
  const { rig, mux } = group;
  const b = await sshdFor(check, rig, 'k-c');
  if (b === undefined) {
    return;
  }
  const remote = path.join(rig.dir, 'k-c.sock');
  const argv = withoutTheTwo(tunnelArgv(rig, b, remote, { key: rig.wrongKey, pin: wrongPin(rig, b, 'k-c') }));
  const tunnel = startTunnel(rig, mux.config, argv, remote);
  try {
    await settledAfter(tunnel.exited, 10_000);
    check('K-C control: with a master up, the tunnel without the two options exits with 0, with a WRONG key and a WRONG pin', tunnel.exit === 0, `exit ${tunnel.exit}`);
    check('K-C control: its forward is served, through the master', await within(5_000, () => served(remote)), await readThrough(remote));
    check('K-C control: and the sshd it named saw no connection', !CONNECTED.test(b.sshd.stderr), sshdTail(b));
  } finally {
    tunnel.manager.dispose();
    await endChild(b.sshd);
  }
}

/** P-D1: with the master up, the production tunnel logs in to B by itself. */
async function productionBesideMaster(check, group) {
  const b = await sshdFor(check, group.rig, 'p-d1');
  if (b === undefined) {
    return;
  }
  try {
    await tunnelLivesAndDies(check, group.rig, 'P-D1', group.mux.config, b);
  } finally {
    await endChild(b.sshd);
  }
}

/** P-D2 and P-D3: with the master up, the production tunnel fails on a wrong pin and on a wrong key. Started with `launch`: its stderr is read. */
async function productionRefuses(check, group, name, parts, expected) {
  const { rig, mux } = group;
  const b = await sshdFor(check, rig, name.toLowerCase());
  if (b === undefined) {
    return;
  }
  try {
    const wrong = parts.pin === 'wrong' ? { pin: wrongPin(rig, b, name.toLowerCase()) } : { key: rig.wrongKey };
    const result = await runClient(rig, mux.config, tunnelArgv(rig, b, path.join(rig.dir, `${name.toLowerCase()}.sock`), wrong));
    check(`${name}: with a master up, the production tunnel with ${parts.what} fails: exit 255 and \`${expected.source}\``, result.code === 255 && expected.test(result.stderr), JSON.stringify(result));
    check(`${name}: and it reached the sshd it named`, CONNECTED.test(b.sshd.stderr), sshdTail(b));
  } finally {
    await endChild(b.sshd);
  }
}

/** One run off a bridge for an sshd B of its own, under the master's config; `takeOut` builds the control. */
async function oneRun(check, group, name, key, options = {}) {
  const b = await sshdFor(check, group.rig, name.toLowerCase());
  if (b === undefined) {
    return undefined;
  }
  try {
    const argv = runArgv(group.rig, b, key);
    const result = await runClient(group.rig, group.mux.config, options.takeOut ? withoutTheTwo(argv) : argv, options.env);
    return { ...result, port: b.port, connected: CONNECTED.test(b.sshd.stderr), accepted: ACCEPTED.test(b.sshd.stderr), tail: sshdTail(b) };
  } finally {
    await endChild(b.sshd);
  }
}

/** Whether a run's one printed line, `SSH_CONNECTION`, ends in `port`: the server the command ran on. */
const ranOn = (result, port) => result !== undefined && result.code === 0 && result.stdout.split(/\s+/).at(-1) === String(port);

/** P-X, K-I, P-I1, P-I2: the runs off a bridge. */
async function runLegs(check, group) {
  const { rig, a } = group;
  const plain = await oneRun(check, group, 'P-X', rig.userKey);
  check('P-X: with a master up, the production run off a bridge ran on the sshd it named: SSH_CONNECTION ends in its port', ranOn(plain, plain?.port) && plain.accepted, JSON.stringify(plain));

  const rides = await oneRun(check, group, 'K-I', rig.passKey, { takeOut: true });
  check('K-I control: without the two options, a run whose key file needs a passphrase rides the master: exit 0, SSH_CONNECTION ends in the MASTER\'s port', ranOn(rides, a.port) && !rides.connected, JSON.stringify(rides));

  const needsPerson = await oneRun(check, group, 'P-I1', rig.passKey);
  check('P-I1: the production run with that key fails: exit 255 and `Permission denied` (a credential that needs a person does not work on this road)', needsPerson?.code === 255 && /Permission denied/.test(needsPerson.stderr), JSON.stringify(needsPerson));
  check('P-I1: it reached the sshd it named, which accepted no key', needsPerson?.connected === true && !needsPerson.accepted, needsPerson?.tail);

  await runWithAgent(check, group);
}

/** P-I2: the same run with the key in an ssh-agent of its environment. The agent is a real one and lives for this leg only. */
async function runWithAgent(check, group) {
  const { rig } = group;
  const env = { ...rig.env, SSH_AUTH_SOCK: rig.agentSocket };
  const agent = launch(rig.scope, 'ssh-agent', ['-D', '-a', rig.agentSocket], { env: rig.env });
  try {
    const up = await within(5_000, () => fs.existsSync(rig.agentSocket));
    const added = up ? await tool('ssh-add', [rig.passKeyOpen], env) : 'the agent made no socket';
    check('P-I2: a real ssh-agent holds the key whose file needs a passphrase', added === undefined, `${added} ${agent.stderr.trim()}`);
    const fromAgent = await oneRun(check, group, 'P-I2', rig.passKey, { env });
    check('P-I2: the same run with that key in an ssh-agent of its environment ran on the sshd it named (what needs nobody still works)', ranOn(fromAgent, fromAgent?.port) && fromAgent.accepted, JSON.stringify(fromAgent));
  } finally {
    await endChild(agent);
  }
}

/** The master group: one master on A, then every leg with an sshd B of its own. */
async function masterGroup(check, rig) {
  const a = await sshdFor(check, rig, 'a');
  if (a === undefined) {
    return;
  }
  const mux = sharingConfig(rig, 'mux');
  let master;
  try {
    const started = await startMaster(rig, a, mux);
    master = started.master;
    check('a master connection to A is up: its control socket exists', started.up, `${master.stderr.trim()}\n${sshdTail(a)}`);
    if (!started.up) {
      return;
    }
    const group = { rig, a, mux };
    await controlRidesMaster(check, group);
    await productionBesideMaster(check, group);
    await productionRefuses(check, group, 'P-D2', { pin: 'wrong', what: 'the wrong pin' }, /Host key verification failed/);
    await productionRefuses(check, group, 'P-D3', { key: 'wrong', what: 'the wrong key' }, /Permission denied/);
    await runLegs(check, group);
    check('the master is still the one connection A served: every production leg went to its own sshd', master.exited === false && fs.existsSync(mux.control), master.stderr.trim());
  } finally {
    if (master !== undefined) {
      await endChild(master);
    }
    await endChild(a.sshd);
  }
}

/** The keys: a host key, the user's key, a key nobody authorized, and an authorized key whose FILE needs a passphrase. */
async function makeKeys(check, rig) {
  const keygen = (file) => tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file]);
  const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey)) ?? (await keygen(rig.wrongKey)) ?? (await keygen(rig.passKey));
  check('the throwaway keys were generated', failed === undefined, failed);
  fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8') + fs.readFileSync(`${rig.passKey}.pub`, 'utf8'));
  // A copy WITHOUT a passphrase stays beside it, for the agent of P-I2 only. The file that a run names gets a passphrase nobody types.
  fs.copyFileSync(rig.passKey, rig.passKeyOpen);
  const locked = await tool('ssh-keygen', ['-q', '-p', '-P', '', '-N', 'a passphrase nobody types', '-f', rig.passKey]);
  check('the file of one authorized key now needs a passphrase', locked === undefined, locked);
}

/** The loopback listener every forward ends at; it answers one known line and closes. */
function startListener(rig) {
  const listener = net.createServer((socket) => socket.end(LINE));
  rig.scope.after(() => new Promise((resolve) => listener.close(resolve)));
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => resolve(listener.address().port));
  });
}

async function liveNoSharing(check, out) {
  if (process.platform === 'win32') {
    console.log('skip  live no-connection-sharing legs — POSIX only (a unix-socket forward and sshd)');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('the live no-connection-sharing legs ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live no-connection-sharing legs — sshd not installed');
    }
    return;
  }
  // Its own scope, registered in the module scope at once (a signal in this section closes it too), closed in the `finally` below. The folder
  // holds unix sockets, so it is made under the short socket root.
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'nsh', { parent: shortSocketRoot() });
  const { SSH_AUTH_SOCK: _own, ...env } = process.env; // no agent of the person's: every leg says which agent it has, and only P-I2 has one
  try {
    const rig = {
      dir, scope: section, out, env, hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), wrongKey: path.join(dir, 'wrong_key'),
      passKey: path.join(dir, 'pass_key'), passKeyOpen: path.join(dir, 'pass_key_open'), authorizedKeys: path.join(dir, 'authorized_keys'),
      agentSocket: path.join(dir, 'a.sock'),
    };
    await makeKeys(check, rig);
    rig.listenerPort = await startListener(rig);

    await controlDetachedMaster(check, rig);
    await productionTunnel(check, rig);
    await masterGroup(check, rig);
  } finally {
    await section.close(); // the folder goes last: the children hold files in it, and the section ended them first
  }
}

module.exports = { liveNoSharing };
