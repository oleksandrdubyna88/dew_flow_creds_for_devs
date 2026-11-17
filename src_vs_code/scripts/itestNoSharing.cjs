// Section 9 of `ssh-agent-itest.cjs` (G2, `PLAN_bridge_no_connection_sharing.md` §7.4), in a file of its own so that script stays
// under the 800-line limit.
//
// The extension's own `ssh` calls must share no connection, whatever the laptop's `~/.ssh/config` says. The product sends
// `NO_CONNECTION_SHARING` (`sshExecCommand.ts`: `ControlPath=none`, `ControlMaster=no`) in the tunnel of a Remote Bridge and in every
// run, and a unit test can only show that the options are IN the argv (`testing.md`: a sent option is not a measured protection).
// So this asks a real `ssh` and real `sshd -d` runs, under a config file with `ControlMaster auto`, a FIXED `ControlPath` and a
// finite `ControlPersist`.
//
// THIS IS THE FEASIBILITY PROBE (step 1 of the S2 spec): one leg, P-B. The production tunnel, started by the product's own
// `SshBridgeManager` over `bridgeSpawner`, against one `sshd -d` on loopback: it serves the forward while its `ssh` runs, logs in by
// itself, makes no control socket, and after `stop()` the forward is not served. The other legs follow in the next commit.
//
// POSIX only, like sections 5, 7 and 8; with `CI=true` a missing sshd FAILS. `sshd -d` serves one connection, so every leg that
// connects has an sshd of its own. Teardown: the tunnel, the sshd by its pid, the listener, the folder.
const fs = require('fs');
const net = require('node:net');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, startSshd, endChild } = require('./itestSshd.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

/** What the test's listener answers: a forward is SERVED when this line is read through the remote socket. */
const LINE = 'creds-g2-forward\n';

/** What a connection leaves in `sshd -d`'s stderr. */
const ACCEPTED = /Accepted publickey/;

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

/** The production argv of a tunnel to `started`, whose forward ends at the test's listener. */
function tunnelArgv(rig, started, remote, parts = {}) {
  const { buildBridgeArgv } = require(path.join(rig.out, 'sshBridge.js'));
  const { isSafeSshTarget } = require(path.join(rig.out, 'sshCommand.js'));
  const options = { port: rig.listenerPort, remote: { path: remote }, keyPath: parts.key ?? rig.userKey, knownHostsFile: parts.pin ?? started.knownHosts, auth: 'key' };
  return buildBridgeArgv(entityOn(started.port), options, isSafeSshTarget);
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

    await productionTunnel(check, rig);
  } finally {
    await section.close(); // the folder goes last: the children hold files in it, and the section ended them first
  }
}

module.exports = { liveNoSharing };
