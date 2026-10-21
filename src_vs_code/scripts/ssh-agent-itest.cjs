// Integration test: drives the REAL OpenSSH tools against the compiled SSH agent.
//
//   npm run compile && node scripts/ssh-agent-itest.cjs
//
// What it proves that the unit tests cannot: a real `ssh-add -l` accepts our identities
// answer, and a real `ssh-keygen -Y sign` — the exact mechanism `git` uses to sign a commit
// with `gpg.format ssh` — produces a signature that `ssh-keygen -Y verify` accepts. If the
// framing, the public blob or the signature encoding were wrong in any of the ways a unit
// test can miss, these two refuse.
//
// No VS Code and no network. On Windows it uses the BUILT-IN OpenSSH deliberately: the MSYS
// ssh-add that ships with Git for Windows cannot connect to a named pipe (measured
// 2026-08-25: "Bad file descriptor"), which is the reason the extension says so in its
// signing config.
//
// Section 5 (POSIX only) goes one step further: a real `ssh` LOGS IN to a real `sshd` through
// the real manager, and the dialog must name the login with the server's host key — the
// host-bound request a current OpenSSH sends, which the classifier once called "unrecognised"
// (#197, E1.1). Under `-d` sshd neither daemonises nor forks per connection, but its privilege
// separation and the session still fork children, and those exit when the connection closes —
// which is why the section ends the ssh client first, and only then sshd.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFile, spawn } = require('child_process');

const OUT = path.join(__dirname, '..', 'out');
const { SshAgentServer, agentSocketPath } = require(path.join(OUT, 'sshAgentServer.js'));
const { parseSshPrivateKey } = require(path.join(OUT, 'sshKeyParse.js'));
const { signForAgent } = require(path.join(OUT, 'sshAgentSign.js'));
const { ALLOW_ONCE } = require(path.join(OUT, 'agentConsent.js'));

const isWindows = process.platform === 'win32';
const SSHD = '/usr/sbin/sshd';
// A modal nobody answers. The stub (written once, below) reads its answer from a global at CALL
// time, so one module serves both sections that need a `vscode`: it can be a promise that never
// settles (section 4) or a click on "Allow once" (section 5).
const NEVER_ANSWER = Symbol.for('ssh-agent-itest.never-answer');
const OPENSSH_DIR = 'C:/Windows/System32/OpenSSH';
const tools = {
  sshAdd: isWindows ? path.join(OPENSSH_DIR, 'ssh-add.exe') : 'ssh-add',
  sshKeygen: isWindows ? path.join(OPENSSH_DIR, 'ssh-keygen.exe') : 'ssh-keygen',
};

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) {
    failures += 1;
  }
}

function run(exe, args, options = {}) {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: 15_000, ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function main() {
  // Short on purpose: the manager's socket is <dir>/<m|l>/keys/<pid>/agent.sock, and a unix socket
  // path may not pass ~104 bytes (macOS). `testsToDelete-` is the sweep's prefix for leftovers.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-ait-'));
  const socketPath = isWindows
    ? `\\\\.\\pipe\\creds-for-devs-agent-itest-${process.pid}`
    : path.join(dir, 'agent.sock');

  // An Ed25519 key, generated here — a committed private key is a published private key.
  const pem = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey.toString();
  const parsed = parseSshPrivateKey(pem, 'itest key');
  check('the generated key parses', parsed.ok === true, parsed.ok ? '' : parsed.reason);
  if (!parsed.ok) {
    process.exit(1);
  }

  let asked = 0;
  let allow = true;
  const key = {
    entityId: 'e-itest',
    name: 'itest key',
    fingerprint: parsed.key.fingerprint,
    identity: { publicBlob: parsed.key.publicBlob, comment: 'itest key' },
    sign: (data, flags) => signForAgent(parsed.key, data, flags),
  };
  const server = new SshAgentServer({
    socketPath,
    keys: () => [key],
    confirm: () => {
      asked += 1;
      return Promise.resolve(allow);
    },
    log: () => undefined,
  });
  await server.listen();
  check('the agent is listening', server.listening === true);
  check(
    'agentSocketPath names a per-window socket',
    agentSocketPath('/storage', process.platform, 7) !== agentSocketPath('/storage', process.platform, 8),
  );

  const env = { ...process.env, SSH_AUTH_SOCK: socketPath };

  // ---- 1. the real ssh-add reads our identities answer ----------------------
  const listed = await run(tools.sshAdd, ['-l'], { env });
  check(
    'ssh-add -l lists the key with its fingerprint',
    listed.stdout.includes(parsed.key.fingerprint),
    `exit ${listed.code}: ${listed.stdout.trim() || listed.stderr.trim()}`,
  );
  check('ssh-add -l names the comment', listed.stdout.includes('itest key'), listed.stdout.trim());
  check('listing raises no dialog', asked === 0, `asked ${asked} times`);

  // ---- 2. the real ssh-keygen -Y sign — how git signs a commit --------------
  // -Y sign needs the public key on disk to pick the identity; the PRIVATE half stays in the
  // agent, which is the whole point of the exercise.
  const publicPath = path.join(dir, 'itest.pub');
  fs.writeFileSync(publicPath, `${parsed.key.publicLine}\n`);
  const messagePath = path.join(dir, 'commit.txt');
  fs.writeFileSync(messagePath, 'tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nsigned by the agent\n');

  const signed = await run(
    tools.sshKeygen,
    ['-Y', 'sign', '-f', publicPath, '-n', 'git', messagePath],
    { env },
  );
  const signaturePath = `${messagePath}.sig`;
  const producedSignature = fs.existsSync(signaturePath);
  check(
    'ssh-keygen -Y sign produced a signature through the agent',
    signed.code === 0 && producedSignature,
    `exit ${signed.code}: ${signed.stderr.trim()}`,
  );
  check('signing asked the human exactly once', asked === 1, `asked ${asked} times`);

  if (producedSignature) {
    // Verify with ssh-keygen itself: an allowed_signers file naming our public key.
    const signersPath = path.join(dir, 'allowed_signers');
    fs.writeFileSync(signersPath, `itest@example.com ${parsed.key.publicLine}\n`);
    const verified = await run(
      tools.sshKeygen,
      ['-Y', 'verify', '-f', signersPath, '-I', 'itest@example.com', '-n', 'git', '-s', signaturePath],
      { env, input: undefined, cwd: dir },
    );
    // ssh-keygen -Y verify reads the signed data from stdin, so feed it the file.
    const verifiedWithStdin = await new Promise((resolve) => {
      const child = require('child_process').spawn(
        tools.sshKeygen,
        ['-Y', 'verify', '-f', signersPath, '-I', 'itest@example.com', '-n', 'git', '-s', signaturePath],
        { env },
      );
      let stderr = '';
      child.stderr.on('data', (c) => {
        stderr += c;
      });
      child.stdin.end(fs.readFileSync(messagePath));
      child.on('close', (code) => resolve({ code, stderr }));
    });
    check(
      'ssh-keygen -Y verify accepts the agent-made signature',
      verifiedWithStdin.code === 0,
      `exit ${verifiedWithStdin.code}: ${verifiedWithStdin.stderr.trim() || verified.stderr.trim()}`,
    );
  }

  // ---- 3. a refusal is a refusal, to the real client ------------------------
  allow = false;
  const refused = await run(
    tools.sshKeygen,
    ['-Y', 'sign', '-f', publicPath, '-n', 'git', path.join(dir, 'commit.txt')],
    { env },
  );
  check(
    'a denied signature makes the real client fail rather than sign',
    refused.code !== 0,
    `exit ${refused.code}`,
  );

  // ---- 4 and 5 need a `vscode`: one stub for both, because the manager module is cached --------
  await withVscodeStub(dir, async () => {
    // ---- 4. an unanswered prompt refuses, through the REAL manager (2026-09-24) -------------
    await unansweredPromptRefuses(pem, publicPath, dir);
    // ---- 5. a real ssh logs in to a real sshd through the agent (#197, E1.1) -----------------
    await liveHostBoundLogin(pem, publicPath, dir);
  });

  // --- what makes `-A` more than a flag (2026-08-26) --------------------------------------
  //
  // Agent forwarding was wired end to end for months and forwarded nothing on Windows: the
  // extension spawned the `ssh` first on PATH, which where Git for Windows is installed is an
  // MSYS build that cannot open a named pipe, and SSH_AUTH_SOCK was published to TERMINALS
  // rather than to the spawned child. A unit test asserting `-A` is in the argv was green the
  // whole time, because a sent flag says nothing about the receiver.
  //
  // So this drives the PRODUCTION resolver and the PRODUCTION environment builder, and asks
  // whether the key comes back. Red before the fix, on Windows, for both reasons at once.
  const { openSshProgram, agentForwardEnv } = require(path.join(OUT, 'sshProgram.js'));
  const chosen = openSshProgram('ssh-add', true, process.platform);
  const forwarding = agentForwardEnv(process.env, true, socketPath);
  check(
    'the environment builder puts the agent socket where a child can see it',
    forwarding.env.SSH_AUTH_SOCK === socketPath,
    String(forwarding.env.SSH_AUTH_SOCK),
  );
  const reached = await run(chosen, ['-l'], { env: forwarding.env });
  check(
    'the client the resolver picks reaches the agent',
    reached.stdout.includes(parsed.key.fingerprint),
    `${chosen} said ${JSON.stringify((reached.stdout + reached.stderr).trim())}`,
  );

  // The negative half, which is what makes the choice load-bearing rather than cosmetic: the
  // binary PATH would have given cannot do this. Skipped where Git for Windows is absent.
  const MSYS_SSH_ADD = 'C:/Program Files/Git/usr/bin/ssh-add.exe';
  if (isWindows && fs.existsSync(MSYS_SSH_ADD)) {
    const msys = await run(MSYS_SSH_ADD, ['-l'], { env: forwarding.env });
    check(
      'the MSYS client PATH would have given cannot — which is why the resolver exists',
      !msys.stdout.includes(parsed.key.fingerprint),
      `MSYS ssh-add said ${JSON.stringify((msys.stdout + msys.stderr).trim())}`,
    );
  }
  server.dispose();
  const afterDispose = await run(tools.sshAdd, ['-l'], { env });
  check('after dispose the agent answers nothing', afterDispose.code !== 0, `exit ${afterDispose.code}`);

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // a socket the OS still holds; the temp directory is swept by the OS
  }

  console.log(failures === 0 ? '\nall agent integration checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * The signing prompt used to wait forever: a prompt found an hour later still signed, and the
 * `ssh-keygen` (or `git`) that asked hung. Sections 1-3 drive `SshAgentServer` with a stubbed
 * `confirm`, so they cannot see where the bound lives — `SshAgentManager.confirm`. This section
 * builds the REAL manager, `vscode` stubbed with a modal nobody answers and a 1.5 s bound, and
 * asks the real client to sign: it must fail promptly, not hang until run()'s 15 s kill.
 */
async function unansweredPromptRefuses(pem, publicPath, dir) {
  global.__AGENT_ANSWER__ = NEVER_ANSWER;
  await driveUnansweredPrompt(pem, publicPath, dir);
}

/**
 * Resolves `vscode` to a stub for the duration of `body`, restored whatever happens so a later
 * section never resolves it to this stub.
 *
 * <p>`require(sshAgentManager.js)` is cached after its first load, and the module stays bound to
 * the `vscode` it first resolved — so the stub is written ONCE and every section that builds a
 * manager shares it. Its `showWarningMessage` records each dialog and reads its answer from
 * `global.__AGENT_ANSWER__` when it is called, not when it is written.</p>
 */
async function withVscodeStub(dir, body) {
  const Module = require('module');
  const stubPath = path.join(dir, 'vscode-stub.cjs');
  fs.writeFileSync(
    stubPath,
    `const NEVER = Symbol.for(${JSON.stringify(NEVER_ANSWER.description)});
     module.exports = { window: {
       showWarningMessage: (message, options, ...buttons) => {
         global.__AGENT_DIALOGS__.push({ message, buttons });
         const answer = global.__AGENT_ANSWER__;
         return answer === NEVER ? new Promise(() => {}) : Promise.resolve(answer);
       },
       createOutputChannel: () => ({ appendLine: (l) => global.__AGENT_LOG__.push(l), dispose() {} }),
     } };`,
  );
  global.__AGENT_LOG__ = [];
  global.__AGENT_DIALOGS__ = [];
  const original = Module._resolveFilename;
  Module._resolveFilename = (request, ...rest) => (request === 'vscode' ? stubPath : original.call(Module, request, ...rest));
  try {
    await body();
  } finally {
    Module._resolveFilename = original;
  }
}

async function driveUnansweredPrompt(pem, publicPath, dir) {
  const { SshAgentManager } = require(path.join(OUT, 'sshAgentManager.js'));
  const published = {};
  const manager = new SshAgentManager(
    { getPrivateKey: () => Promise.resolve(pem) },
    path.join(dir, 'm'),
    { replace: (name, value) => { published[name] = value; }, delete: () => undefined, set description(_v) {} },
    () => undefined,
    undefined,
    undefined,
    1500,
  );
  const loaded = await manager.load('a1', { id: 'e-manager', name: 'itest key', isSshEnabled: false, isSshKey: true });
  check('the real manager loads and serves the key', loaded.ok === true, loaded.reason);
  const messagePath = path.join(dir, 'unanswered.txt');
  fs.writeFileSync(messagePath, 'signed by nobody\n');
  const started = Date.now();
  const signed = await run(tools.sshKeygen, ['-Y', 'sign', '-f', publicPath, '-n', 'git', messagePath], {
    env: { ...process.env, SSH_AUTH_SOCK: published.SSH_AUTH_SOCK },
  });
  const took = Date.now() - started;
  check(
    'an unanswered prompt makes the real client fail promptly, not hang',
    signed.code !== 0 && took >= 1_000 && took < 10_000,
    `exit ${signed.code} after ${took} ms`,
  );
  check(
    'the agent log says the prompt timed out',
    global.__AGENT_LOG__.some((line) => /no answer .*refused/.test(line)),
    global.__AGENT_LOG__.join(' | '),
  );
  manager.dispose();
}

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
 * nothing.</p>
 */
async function startSshd(sshdDir, hostKeyPath, authorizedKeys) {
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
      '',
    ].join('\n'),
  );
  const sshd = launch(SSHD, ['-d', '-e', '-f', config]);
  const listening = new RegExp(`Server listening on 127\\.0\\.0\\.1 port ${port}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (listening.test(sshd.stderr)) {
      return { sshd, port, knownHosts };
    }
    if (sshd.exited) {
      return { sshd, failure: `sshd exited before it listened: ${sshd.stderr.trim()}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { sshd, failure: `no "Server listening" line within 10 s: ${sshd.stderr.trim()}` };
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

/**
 * A real `ssh` logs in to a real, user-mode `sshd` through the real manager, and the dialog the
 * person would see must name a LOGIN, with the SERVER'S HOST KEY (#197, E1.1).
 *
 * <p>OpenSSH 8.9+ signs `publickey-hostbound-v00@openssh.com` — the userauth request plus the
 * server host key. Before this section the classifier read only `publickey`, so every login to a
 * current server asked "…to sign a signature whose purpose this build does not recognise?". The
 * unit tests build that request by hand from the specification; only a real client proves the
 * hand-built bytes are the ones OpenSSH sends.</p>
 *
 * <p>POSIX only: `sshd` runs as the current user on a loopback port, with a throwaway host key.
 * A login from Windows is M1 in the plan — it needs a real Windows client and a real server.</p>
 *
 * <p>Teardown: `sshd -d` does not daemonise and does not fork per connection, but privilege
 * separation and the session still fork children that exit when the connection closes. So the ssh
 * client is ended first, then sshd by its own pid; the folder goes last, because they hold files in it.</p>
 */
async function liveHostBoundLogin(pem, publicPath, dir) {
  if (isWindows) {
    console.log('skip  live OpenSSH login — POSIX only; M1 covers Windows');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('a live OpenSSH login ran', false, `${SSHD} is missing — a skipped live login on the runner proves nothing`);
    } else {
      console.log('skip  live OpenSSH login — sshd not installed');
    }
    return;
  }
  const sshdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-sshd-'));
  let sshd;
  let client;
  let manager;
  try {
    const hostKeyPath = path.join(sshdDir, 'host_key');
    const keygen = await run(tools.sshKeygen, ['-q', '-t', 'ed25519', '-N', '', '-f', hostKeyPath]);
    check('a throwaway sshd host key was generated', keygen.code === 0, keygen.stderr.trim());
    const fingerprintLine = await run(tools.sshKeygen, ['-l', '-E', 'sha256', '-f', `${hostKeyPath}.pub`]);
    const hostFingerprint = /SHA256:\S+/.exec(fingerprintLine.stdout)?.[0];
    check('ssh-keygen -l printed the host key fingerprint', hostFingerprint !== undefined, fingerprintLine.stdout.trim());
    const authorizedKeys = path.join(sshdDir, 'authorized_keys');
    fs.writeFileSync(authorizedKeys, `${fs.readFileSync(publicPath, 'utf8').trim()}\n`);

    let started = await startSshd(sshdDir, hostKeyPath, authorizedKeys);
    if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
      // The free-port race: someone took the port between the probe and sshd's bind. Once, fresh port.
      await endChild(started.sshd);
      started = await startSshd(sshdDir, hostKeyPath, authorizedKeys);
    }
    sshd = started.sshd;
    check('sshd -d is listening on loopback', started.failure === undefined, started.failure);
    if (started.failure !== undefined) {
      return;
    }

    const published = {};
    const { SshAgentManager } = require(path.join(OUT, 'sshAgentManager.js'));
    manager = new SshAgentManager(
      { getPrivateKey: () => Promise.resolve(pem) },
      path.join(dir, 'l'),
      { replace: (name, value) => { published[name] = value; }, delete: () => undefined, set description(_v) {} },
      () => undefined,
    );
    const loaded = await manager.load('a1', { id: 'e-live', name: 'itest key', isSshEnabled: false, isSshKey: true });
    check('the real manager loads and serves the key for the live login', loaded.ok === true, loaded.reason);
    if (loaded.ok !== true) {
      return;
    }
    const socket = published.SSH_AUTH_SOCK;
    // sun_path is ~104 bytes on macOS; a longer path would fail to bind with an error about nothing.
    const fits = typeof socket === 'string' && socket.length < 104;
    check('the agent socket path fits a unix socket', fits, String(socket));
    if (!fits) {
      return;
    }

    const version = await run('ssh', ['-V']);
    console.log(`info  ssh -V: ${(version.stderr || version.stdout).trim()}`);

    global.__AGENT_DIALOGS__.length = 0;
    global.__AGENT_ANSWER__ = ALLOW_ONCE;
    client = launch('ssh', [
      '-F', '/dev/null',
      '-o', `IdentityAgent=${socket}`,
      '-o', 'IdentitiesOnly=yes',
      '-o', `IdentityFile=${publicPath}`,
      '-o', 'BatchMode=yes',
      '-o', `UserKnownHostsFile=${started.knownHosts}`,
      '-o', 'StrictHostKeyChecking=yes',
      '-p', String(started.port),
      `${os.userInfo().username}@127.0.0.1`,
      'true',
    ]);
    const code = await Promise.race([client.done, new Promise((resolve) => setTimeout(resolve, 20_000, 'timeout'))]);
    check(
      'the real ssh logged in to sshd through the agent',
      code === 0,
      `exit ${code}: ${client.stderr.trim()}\n--- sshd -d, last 20 lines ---\n${lastLines(sshd.stderr, 20)}`,
    );
    check('the login raised exactly one dialog', global.__AGENT_DIALOGS__.length === 1, `${global.__AGENT_DIALOGS__.length} dialogs`);
    const message = global.__AGENT_DIALOGS__[0]?.message ?? '';
    check('the dialog names an SSH login', /an SSH login as "/.test(message), JSON.stringify(message));
    check(
      "the dialog names the server's host key on a line of its own",
      hostFingerprint !== undefined &&
        message.split('\n').includes(`This login is for the server whose host key is ED25519 ${hostFingerprint}`),
      JSON.stringify(message),
    );
  } finally {
    // Order matters: the client first (its own pid) — sshd's forked children exit when the connection
    // closes — then sshd by ITS pid, then wait for its exit; only then is the folder removed, because
    // sshd holds files in it until it is gone.
    if (client !== undefined) {
      await endChild(client);
    }
    if (sshd !== undefined) {
      await endChild(sshd);
    }
    manager?.dispose();
    try {
      fs.rmSync(sshdDir, { recursive: true, force: true });
    } catch {
      // a file the OS still holds; a cleanup failure must never replace the real error above
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
