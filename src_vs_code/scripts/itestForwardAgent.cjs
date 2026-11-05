// Section 8 of `ssh-agent-itest.cjs` (Amendment 2, B.3), in a file of its own so that script stays under the 800-line limit.
//
// A bridged call must never forward the laptop's SSH agent, whatever the laptop's `~/.ssh/config` says. The product sends
// `-o ForwardAgent=no` (`buildSshExecArgv`, `noAgentForward`), and a unit test can only show that the option is IN the argv
// (`testing.md`: a sent option is not a measured protection). So this asks a real `ssh` and a real `sshd -d`: with a config
// file that says `Host * / ForwardAgent yes`, a live `SSH_AUTH_SOCK` and the remote command `printenv SSH_AUTH_SOCK`,
// the output is non-empty WITHOUT the option (the control: this rig can forward at all) and empty WITH it.
//
// POSIX only, like sections 5 and 7; with `CI=true` a missing sshd FAILS. `sshd -d` serves one connection, so each leg
// has its own run. The real `ssh-agent` is the one forwarded; teardown is the client, sshd by its pid, the agent, the folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, startSshd, endChild } = require('./itestSshd.cjs');

function keygen(file) {
  return new Promise((resolve) => {
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

/** One leg: a real ssh runs `printenv SSH_AUTH_SOCK` on its own sshd, with or without the option; what the remote printed. */
async function oneLeg(rig, noAgentForward) {
  const { buildSshExecArgv } = require(path.join(rig.out, 'sshExecCommand.js'));
  const started = await startSshd(rig.dir, rig.hostKey, rig.authorizedKeys);
  if (started.failure !== undefined) {
    await endChild(started.sshd);
    return { failure: started.failure };
  }
  const entity = { id: 'e-fwd', name: 'fwd', host: '127.0.0.1', user: os.userInfo().username, port: started.port, isSshEnabled: true };
  const argv = buildSshExecArgv(entity, rig.userKey, 'printenv SSH_AUTH_SOCK', 'key', { knownHostsFile: started.knownHosts, noAgentForward });
  const client = launch('ssh', ['-F', rig.config, ...argv], { env: { ...process.env, SSH_AUTH_SOCK: rig.agentSocket } });
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, 20_000, 'timeout');
    });
    const code = await Promise.race([client.done, timeout]);
    return { code, stdout: client.stdout.trim(), detail: `${client.stderr.trim()}\n--- sshd -d, last lines ---\n${started.sshd.stderr.trim().split(/\r?\n/).slice(-12).join('\n')}` };
  } finally {
    clearTimeout(timer);
    await endChild(client);
    await endChild(started.sshd);
  }
}

async function liveNoAgentForward(check, out) {
  if (process.platform === 'win32') {
    console.log('skip  live ForwardAgent=no — POSIX only; M8 covers Windows');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('a live ForwardAgent=no check ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live ForwardAgent=no — sshd not installed');
    }
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-fwd-'));
  let agent;
  try {
    const rig = { dir, out, hostKey: path.join(dir, 'host_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'), config: path.join(dir, 'ssh_config'), agentSocket: path.join(dir, 'a.sock') };
    const failed = (await keygen(rig.hostKey)) ?? (await keygen(rig.userKey));
    check('the throwaway host and user keys were generated', failed === undefined, failed);
    fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
    fs.writeFileSync(rig.config, 'Host *\n  ForwardAgent yes\n');
    agent = launch('ssh-agent', ['-D', '-a', rig.agentSocket]);
    check('a real ssh-agent is listening, to be forwarded', await socketAppears(rig.agentSocket, Date.now() + 5_000), agent.stderr.trim());

    const control = await oneLeg(rig, false);
    check('control: a config file that says ForwardAgent yes DOES forward without the option', control.failure === undefined && control.code === 0 && control.stdout !== '', JSON.stringify(control));
    const bridged = await oneLeg(rig, true);
    check('with -o ForwardAgent=no the same config forwards nothing: the remote has no SSH_AUTH_SOCK', bridged.failure === undefined && bridged.stdout === '', JSON.stringify(bridged));
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
