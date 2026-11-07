// Section 8 of `ssh-agent-itest.cjs` (Amendment 2 B.3, Amendment 3 C.1), in a file of its own so that script stays under the
// 800-line limit.
//
// A bridged call must be ONE fresh connection that forwards nothing, whatever the laptop's `~/.ssh/config` says. The product
// sends `BRIDGED_SSH_OPTIONS` (`sshExecCommand.ts`: `ForwardAgent=no`, `ControlPath=none`, `ControlMaster=no`,
// `ClearAllForwardings=yes`, `ForwardX11=no`, `Tunnel=no`), and a unit test can only show that the options are IN the argv
// (`testing.md`: a sent option is not a measured protection). So this asks a real `ssh` and a real `sshd -d`:
//   legs 1-2: a config file that says `Host * / ForwardAgent yes`, a live `SSH_AUTH_SOCK` and the remote command
//     `printenv SSH_AUTH_SOCK`: the output is non-empty WITHOUT the options (the control: this rig can forward at all) and,
//     WITH them, printenv answers 1 (its own exit code for an unset variable) and prints nothing;
//   the mux pair (C.1): the same config plus `ControlMaster auto` and a FIXED `ControlPath`, a master connection to sshd A
//     whose session asked for agent forwarding, then (leg 3, the control) a hand-written argv for sshd B that JOINS the master
//     and so gets A's agent socket without ever reaching B, and (leg 4) the production bridged argv for B, which reaches B and
//     gets no socket.
//
// POSIX only, like sections 5 and 7; with `CI=true` a missing sshd FAILS. `sshd -d` serves one connection, so each leg
// that connects has its own run. The real `ssh-agent` is the one forwarded; teardown is the clients, sshd by its pid, the
// agent, the folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, startSshd, endChild } = require('./itestSshd.cjs');

/** What a connection to B leaves in `sshd -d`'s stderr: the key was accepted, or at least the connection arrived. */
const REACHED_B = /Accepted publickey|Connection from 127\.0\.0\.1/;

function keygen(file) {
  return new Promise((resolve) => {
    // NOSONAR — this is a CI rig that needs the OpenSSH client and server installed, as `ssh-agent-itest.cjs` does for the same tool: the PATH's `ssh-keygen` IS the thing under test, and pinning a path would test another one.
    execFile('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file], { timeout: 15_000 }, (error, _out, stderr) => {
      resolve(error ? String(stderr).trim() || String(error) : undefined);
    });
  });
}

async function socketAppears(file, deadline) {
  if (fs.existsSync(file)) {
    return true;
  }
  if (Date.now() >= deadline) {
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return socketAppears(file, deadline);
}

/** The last lines of a started sshd's stderr, for a failure message. */
const sshdTail = (started) => started.sshd.stderr.trim().split(/\r?\n/).slice(-12).join('\n');

/** The entry the production argv is built for: the loopback address, this user and the sshd's port. */
const entityOn = (port) => ({ id: 'e-fwd', name: 'fwd', host: '127.0.0.1', user: os.userInfo().username, port, isSshEnabled: true });

const destination = `${os.userInfo().username}@127.0.0.1`;

/** Resolves when `promise` has, or `ms` after this call — whichever is first; the timer does not outlive the race. */
function settledAfter(promise, ms) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

/** A real ssh with `argv` under `config`, the agent in its environment; what it answered, and the sshd it spoke to. */
async function runClient(rig, config, argv, started) {
  const client = launch('ssh', ['-F', config, ...argv], { env: { ...process.env, SSH_AUTH_SOCK: rig.agentSocket } });
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, 20_000, 'timeout');
    });
    const code = await Promise.race([client.done, timeout]);
    await settledAfter(client.closed, 2000); // output that arrived between `exit` and `close`; bounded, a grandchild holding the pipe must not hang the leg
    return { code, stdout: client.stdout.trim(), detail: `${client.stderr.trim()}\n--- sshd -d, last lines ---\n${sshdTail(started)}` };
  } finally {
    clearTimeout(timer);
    await endChild(client);
  }
}

/** A throwaway sshd in a folder of its own (`startSshd` writes its config and known_hosts there). */
function sshdIn(rig, name) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  return startSshd(dir, rig.hostKey, rig.authorizedKeys);
}

/** One leg: a real ssh runs `printenv SSH_AUTH_SOCK` on its own sshd, with or without the bridged options; what the remote printed. */
async function oneLeg(rig, bridged) {
  const { buildSshExecArgv } = require(path.join(rig.out, 'sshExecCommand.js'));
  const started = await sshdIn(rig, bridged ? 'leg-bridged' : 'leg-control');
  try {
    if (started.failure !== undefined) {
      return { failure: started.failure };
    }
    const argv = buildSshExecArgv(entityOn(started.port), rig.userKey, 'printenv SSH_AUTH_SOCK', 'key', { knownHostsFile: started.knownHosts, bridged });
    return await runClient(rig, rig.config, argv, started);
  } finally {
    await endChild(started.sshd);
  }
}

/** Legs 1 and 2: the agent is forwarded without the options, and not with them. */
function agentLegs(check, control, bridged) {
  check('control: a config file that says ForwardAgent yes DOES forward without the options', control.failure === undefined && control.code === 0 && control.stdout !== '', JSON.stringify(control));
  check('with the bridged options the same config forwards nothing: printenv answers 1 and prints nothing', bridged.failure === undefined && bridged.code === 1 && bridged.stdout === '', JSON.stringify(bridged));
}

/** The master: a connection to A whose session asked for agent forwarding, held open until the pair is over. */
async function startMaster(rig, a) {
  const argv = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${a.knownHosts}`, '-i', rig.userKey, '-p', String(a.port), destination, 'sleep 30'];
  const master = launch('ssh', ['-F', rig.muxConfig, ...argv], { env: { ...process.env, SSH_AUTH_SOCK: rig.agentSocket } });
  return { master, up: await socketAppears(rig.muxSocket, Date.now() + 15_000) };
}

/** Leg 3: a hand-written argv for B (NOT the production one, which after C.1 cannot join) that rides the master. */
async function joiningLeg(check, rig, a, b) {
  const argv = ['-o', 'ForwardAgent=no', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${b.knownHosts}`, '-i', rig.userKey, '-p', String(b.port), destination, 'printenv SSH_AUTH_SOCK SSH_CONNECTION'];
  const joined = await runClient(rig, rig.muxConfig, argv, b);
  const lines = joined.stdout.split(/\r?\n/);
  check('control: without the C.1 options a second ssh JOINS the master and gets its agent socket (code 0, a non-empty first line)', joined.code === 0 && (lines[0] ?? '') !== '', JSON.stringify(joined));
  check("and it never reached the server it named: SSH_CONNECTION ends in A's port", (lines[1] ?? '').trim().endsWith(String(a.port)), JSON.stringify(joined));
}

/** Leg 4: the production argv for B under the same config: a fresh connection to B, with no agent. */
async function bridgedLeg(check, rig, b) {
  const { buildSshExecArgv } = require(path.join(rig.out, 'sshExecCommand.js'));
  const argv = buildSshExecArgv(entityOn(b.port), rig.userKey, 'printenv SSH_AUTH_SOCK SSH_CONNECTION', 'key', { knownHostsFile: b.knownHosts, bridged: true });
  const result = await runClient(rig, rig.muxConfig, argv, b);
  const lines = result.stdout.split(/\r?\n/);
  check('the production bridged argv joins no master: printenv answers 1 (SSH_AUTH_SOCK unset) and prints exactly one line, the connection, ending in B\'s port', result.code === 1 && lines.length === 1 && lines[0].trim().endsWith(String(b.port)), JSON.stringify(result));
  check('and it reached B: sshd B saw the connection, so the empty answer is not a connection that never happened', REACHED_B.test(b.sshd.stderr), sshdTail(b));
}

/** The mux pair (C.1): two sshds, one master on A, a joining control on B, then the production bridged argv on B. */
async function muxPair(check, rig) {
  const a = await sshdIn(rig, 'mux-a');
  const b = await sshdIn(rig, 'mux-b');
  let master;
  try {
    const failure = a.failure ?? b.failure;
    check('the two sshd rigs of the mux pair started', failure === undefined, failure);
    if (failure !== undefined) {
      return;
    }
    const started = await startMaster(rig, a);
    master = started.master;
    check('a master connection to A is up: its control socket exists', started.up, `${master.stderr.trim()}\n${sshdTail(a)}`);
    if (started.up) {
      await joiningLeg(check, rig, a, b);
      await bridgedLeg(check, rig, b);
    }
  } finally {
    if (master !== undefined) {
      await endChild(master);
    }
    await endChild(a.sshd);
    await endChild(b.sshd);
  }
}

async function liveNoAgentForward(check, out) {
  if (process.platform === 'win32') {
    console.log('skip  live ForwardAgent=no and the mux pair — POSIX only; M8 covers Windows');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('a live ForwardAgent=no check ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live ForwardAgent=no and the mux pair — sshd not installed');
    }
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-fwd-'));
  let agent;
  try {
    const rig = {
      dir, out, hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'),
      config: path.join(dir, 'ssh_config'), muxConfig: path.join(dir, 'ssh_config_mux'), muxSocket: path.join(dir, 'mux.sock'), agentSocket: path.join(dir, 'a.sock'),
    };
    const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey));
    check('the throwaway host and user keys were generated', failed === undefined, failed);
    fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
    fs.writeFileSync(rig.config, 'Host *\n  ForwardAgent yes\n');
    // A FIXED control path: whichever port the argv names, a client joins the master that holds this file (the sharpest form of C.1).
    fs.writeFileSync(rig.muxConfig, `Host *\n  ForwardAgent yes\n  ControlMaster auto\n  ControlPath ${rig.muxSocket}\n`);
    agent = launch('ssh-agent', ['-D', '-a', rig.agentSocket]);
    check('a real ssh-agent is listening, to be forwarded', await socketAppears(rig.agentSocket, Date.now() + 5_000), agent.stderr.trim());

    agentLegs(check, await oneLeg(rig, false), await oneLeg(rig, true));
    await muxPair(check, rig);
  } finally {
    if (agent !== undefined) {
      await endChild(agent);
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // a file the OS still holds; a cleanup failure must never replace the real error above
    }
  }
}

module.exports = { liveNoAgentForward };
