// The live-sshd helpers of `ssh-agent-itest.cjs` (sections 5 and 7), moved out of it so that script stays under the
// 800-line limit (#197 E3.4). `sshd -d` serves exactly ONE connection, so every login needs its own run: `startSshd`
// starts one on a fresh loopback port, `endChild` ends a child by its pid, and `launch` is the spawn both use. `login`
// (section 7's, added with E3.4) is one real `ssh` against its own run, answered from the stub's globals. POSIX only —
// the callers skip on Windows.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const SSHD = '/usr/sbin/sshd';

/** Spawns a child and collects its output — unlike `run`, the caller holds the pid and can end it. */
function launch(exe, args, options = {}) {
  const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const result = { child, stdout: '', stderr: '', exited: false };
  child.stdout.on('data', (chunk) => {
    result.stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    result.stderr += chunk;
  });
  result.done = new Promise((resolve) => {
    child.once('exit', (code) => {
      result.exited = true;
      resolve(code);
    });
    child.once('error', (error) => {
      result.stderr += String(error);
      result.exited = true;
      resolve(-1);
    });
  });
  return result;
}

/** Resolves when the child has exited or `ms` have passed — whichever is first. The timer is cleared when the
 * race settles, so a child that exited at once leaves nothing referenced to keep this process alive. */
function settledWithin(result, ms) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, undefined);
  });
  return Promise.race([result.done, timedOut]).finally(() => clearTimeout(timer));
}

/** A free loopback port: bind 0, read it, let go. Racy by nature — the caller retries once. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts `sshd -d` on a fresh port and waits for its "Server listening" line.
 *
 * <p>Not a TCP probe: under `-d` a probe would spend the ONE connection sshd serves. Returns
 * `{ sshd, port, knownHosts }`, or `{ sshd, failure }` naming what sshd said — never a skip,
 * because a masked failure here is exactly how a live section turns into a green that proves
 * nothing. `extraConfig` is more `sshd_config` lines — section 7's RSA leg adds `PubkeyAcceptedAlgorithms +ssh-rsa`.</p>
 */
async function startSshd(sshdDir, hostKeyPath, authorizedKeys, extraConfig = []) {
  const port = await freePort();
  const knownHosts = path.join(sshdDir, 'known_hosts');
  const hostPublic = fs.readFileSync(`${hostKeyPath}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
  fs.writeFileSync(knownHosts, `[127.0.0.1]:${port} ${hostPublic}\n`);
  const config = path.join(sshdDir, 'sshd_config');
  // Absolute paths only: sshd refuses to start from a relative one.
  fs.writeFileSync(
    config,
    [
      `ListenAddress 127.0.0.1:${port}`,
      `HostKey ${hostKeyPath}`,
      `AuthorizedKeysFile ${authorizedKeys}`,
      `PidFile ${path.join(sshdDir, 'sshd.pid')}`,
      'UsePAM no',
      'StrictModes no',
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      ...extraConfig,
      '',
    ].join('\n'),
  );
  const sshd = launch(SSHD, ['-d', '-e', '-f', config]);
  const listening = new RegExp(String.raw`Server listening on 127\.0\.0\.1 port ${port}`);
  const failure = await listeningFailure(sshd, listening, Date.now() + 10_000);
  return failure === undefined ? { sshd, port, knownHosts } : { sshd, failure };
}

/**
 * Polls sshd's stderr every 50 ms until it says it is listening. Resolves `undefined` on success, else
 * the sentence naming what went wrong. One poll after another is the point — each looks at what the
 * previous one left — so it recurses rather than looping over `await`.
 */
async function listeningFailure(sshd, listening, deadline) {
  if (listening.test(sshd.stderr)) {
    return undefined;
  }
  if (sshd.exited) {
    return `sshd exited before it listened: ${sshd.stderr.trim()}`;
  }
  if (Date.now() >= deadline) {
    return `no "Server listening" line within 10 s: ${sshd.stderr.trim()}`;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return listeningFailure(sshd, listening, deadline);
}

/**
 * Ends a child by ITS pid if it is still running, and waits (bounded) for its exit. A child that
 * ignores the polite signal is killed outright and waited for once more — the folder it holds
 * files in cannot be removed while it lives.
 */
async function endChild(result) {
  if (!result.exited) {
    result.child.kill();
  }
  await settledWithin(result, 5_000);
  if (!result.exited) {
    result.child.kill('SIGKILL');
    await settledWithin(result, 5_000);
  }
}

/** The last `count` lines of a child's output — what it said just before the failure. */
function lastLines(text, count) {
  return text.trim().split(/\r?\n/).slice(-count).join('\n');
}

/** Starts this leg's sshd; once more on a fresh port when someone took the probed one (section 5's retry). */
async function startOneSshd(rig) {
  let started = await startSshd(rig.sshdDir, rig.hostKey, rig.authorizedKeys, rig.extraConfig);
  if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
    await endChild(started.sshd);
    started = await startSshd(rig.sshdDir, rig.hostKey, rig.authorizedKeys, rig.extraConfig);
  }
  return started;
}

/**
 * One real `ssh` login against its own `sshd -d`, answered from `answers` (the clicks, in order) and `picks` (the list's
 * labels). Ends the client, then sshd by its pid, and says what happened in `detail` — including sshd's last lines.
 */
async function login(rig, given) {
  const { answers, picks, options } = { answers: [], picks: [], options: [], ...given };
  global.__AGENT_ANSWER__ = [...answers];
  global.__AGENT_PICK__ = [...picks];
  const started = await startOneSshd(rig);
  if (started.failure !== undefined) {
    await endChild(started.sshd);
    return { code: 'no sshd', detail: started.failure };
  }
  const client = launch('ssh', [
    '-F', '/dev/null',
    '-o', `IdentityAgent=${rig.socket}`,
    '-o', 'IdentitiesOnly=yes',
    '-o', `IdentityFile=${rig.publicPath}`,
    '-o', 'BatchMode=yes',
    '-o', `UserKnownHostsFile=${started.knownHosts}`,
    '-o', 'StrictHostKeyChecking=yes',
    ...options,
    '-p', String(started.port),
    `${os.userInfo().username}@127.0.0.1`,
    'true',
  ]);
  let timer;
  try {
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, 20_000, 'timeout'); });
    const code = await Promise.race([client.done, timeout]);
    return { code, detail: `exit ${code}: ${client.stderr.trim()}\n--- sshd -d, last 20 lines ---\n${lastLines(started.sshd.stderr, 20)}` };
  } finally {
    clearTimeout(timer);
    await endChild(client);
    await endChild(started.sshd);
  }
}

module.exports = { SSHD, launch, startSshd, endChild, lastLines, login };
