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
//
// Section 6 (every platform, no sshd) is the lock: a REAL `VaultKeys`, joined to a real manager by
// `connectAgentToLock`, ends a ten-minute window the moment it locks — and the key, still loaded,
// signs again for a real `ssh-keygen -Y sign` after one more answer (#197, E2.1).
//
// Section 7 (POSIX only) is the login window (#197, E3.4): real `ssh` logins against real `sshd -d` runs, one run
// per login. *Allow longer…* -> 1 hour, and the next login raises no dialog; a Git signature still asks, without
// *Allow longer…*; a lock ends the window and login 3 asks, without it. An RSA key adds the SHA-1 line: a login
// that asks for `ssh-rsa` (SHA-1) is never covered by the long window and its prompt says why. The sshd helpers
// live in `itestSshd.cjs`, shared with section 5.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, startSshd, launch, endChild, lastLines, login } = require('./itestSshd.cjs');

const OUT = path.join(__dirname, '..', 'out');
const { SshAgentServer, agentSocketPath } = require(path.join(OUT, 'sshAgentServer.js'));
const { parseSshPrivateKey } = require(path.join(OUT, 'sshKeyParse.js'));
const { signForAgent } = require(path.join(OUT, 'sshAgentSign.js'));
const { ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER } = require(path.join(OUT, 'agentConsent.js'));

const isWindows = process.platform === 'win32';
// A modal nobody answers. The stub (written once, below) reads its answer from a global at CALL
// time, so one module serves both sections that need a `vscode`: it can be a promise that never
// settles (section 4), a click on "Allow once" (section 5) or, as an ARRAY, a sequence of clicks answered in
// order (section 6).
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
      const child = require('node:child_process').spawn(
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
    // ---- 6. a real vault lock ends a real ten-minute window (#197, E2.1) ----------------------
    await lockEndsTheWindow(pem, publicPath, dir);
    // ---- 7. a real login window: Allow longer… lets the next real ssh login through (#197, E3.4) -----
    await liveLoginWindow(pem, dir);
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
     class EventEmitter {
       constructor() {
         this.listeners = [];
         this.event = (listener) => {
           this.listeners.push(listener);
           return { dispose: () => { const at = this.listeners.indexOf(listener); if (at >= 0) this.listeners.splice(at, 1); } };
         };
       }
       // Like VS Code's Emitter: one listener's throw is reported, never allowed to stop the next listener.
       fire(value) { for (const listener of [...this.listeners]) { try { listener(value); } catch (error) { console.error('listener threw:', error); } } }
       dispose() { this.listeners.length = 0; }
     }
     class CancellationTokenSource {
       constructor() {
         this.cancelled = new EventEmitter();
         this.token = { isCancellationRequested: false, onCancellationRequested: this.cancelled.event };
       }
       cancel() { this.token.isCancellationRequested = true; this.cancelled.fire(); }
       dispose() { this.cancelled.dispose(); }
     }
     // Settings come from a global read at call time: section 7 runs with auto-lock at its default, 60.
     const workspace = {
       getConfiguration: () => ({ get: (key, fallback) => (global.__AGENT_SETTINGS__ && key in global.__AGENT_SETTINGS__ ? global.__AGENT_SETTINGS__[key] : fallback) }),
       onDidChangeConfiguration: new EventEmitter().event,
     };
     module.exports = { EventEmitter, CancellationTokenSource, workspace, window: {
       // The list of lengths: the label named in global.__AGENT_PICK__ is the item "clicked"; none named is Escape.
       showQuickPick: (items, options) => {
         global.__AGENT_LISTS__.push({ items: [...items], options });
         const wanted = global.__AGENT_PICK__.shift();
         return Promise.resolve(items.find((item) => item.label === wanted));
       },
       showWarningMessage: (message, options, ...buttons) => {
         global.__AGENT_DIALOGS__.push({ message, buttons });
         const answer = global.__AGENT_ANSWER__;
         if (Array.isArray(answer)) return Promise.resolve(answer.shift());
         return answer === NEVER ? new Promise(() => {}) : Promise.resolve(answer);
       },
       showInformationMessage: (message) => { global.__AGENT_INFOS__.push(message); return Promise.resolve(undefined); },
       createOutputChannel: () => ({ appendLine: (l) => global.__AGENT_LOG__.push(l), dispose() {} }),
     } };`,
  );
  global.__AGENT_LOG__ = [];
  global.__AGENT_DIALOGS__ = [];
  global.__AGENT_INFOS__ = [];
  global.__AGENT_LISTS__ = [];
  global.__AGENT_PICK__ = [];
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

/** A `vscode.SecretStorage` held in a Map — all a real `VaultKeys` needs to be built (it is never mocked). */
function mapSecretStorage() {
  const stored = new Map();
  return {
    get: (key) => Promise.resolve(stored.get(key)),
    store: (key, value) => Promise.resolve(void stored.set(key, value)),
    delete: (key) => Promise.resolve(void stored.delete(key)),
    keys: () => Promise.resolve([...stored.keys()]),
    onDidChange: () => ({ dispose() {} }),
  };
}

/**
 * Every lock ends every window — proven end to end (#197, E2.1). A REAL `VaultKeys`, a real manager, and
 * the production `connectAgentToLock` between them; three real `ssh-keygen -Y sign`. The first is answered
 * "Allow for 10 minutes" (one dialog); the second rides the window (no new dialog); then `vaultKeys.lock()`,
 * and the third ASKS again — and, answered once, it SIGNS: exit 0 proves the lock ended the window and did
 * not revoke or unload the key. No `sshd` is needed, so this runs wherever `ssh-keygen` does.
 */
async function lockEndsTheWindow(pem, publicPath, dir) {
  const { VaultKeys } = require(path.join(OUT, 'vaultKeys.js'));
  const { connectAgentToLock } = require(path.join(OUT, 'sshAgentWiring.js'));
  const { SshAgentManager } = require(path.join(OUT, 'sshAgentManager.js'));
  const published = {};
  const manager = new SshAgentManager(
    { getPrivateKey: () => Promise.resolve(pem) },
    path.join(dir, 'w'),
    { replace: (name, value) => { published[name] = value; }, delete: () => undefined, set description(_v) {} },
    () => undefined,
  );
  const vaultKeys = new VaultKeys(mapSecretStorage());
  const link = connectAgentToLock(vaultKeys, manager);
  try {
    const loaded = await manager.load('a1', { id: 'e-lock', name: 'itest key', isSshEnabled: false, isSshKey: true });
    check('the real manager loads and serves the key for the lock section', loaded.ok === true, loaded.reason);
    const socket = published.SSH_AUTH_SOCK;
    const fits = typeof socket === 'string' && (isWindows || socket.length < 104);
    check('the lock section agent socket path fits a unix socket', fits, String(socket));
    if (loaded.ok !== true || !fits) {
      return;
    }
    await signThreeTimes(vaultKeys, manager, publicPath, dir, socket);
  } finally {
    link.dispose();
    manager.dispose();
  }
}

/** The body of section 6: sign, sign (window), lock, sign (asks again, still signs). */
async function signThreeTimes(vaultKeys, manager, publicPath, dir, socket) {
  global.__AGENT_DIALOGS__.length = 0;
  global.__AGENT_ANSWER__ = [ALLOW_WINDOW, ALLOW_ONCE];
  const sign = (name) => {
    const messagePath = path.join(dir, name);
    fs.writeFileSync(messagePath, `signed under the lock section: ${name}
`);
    return run(tools.sshKeygen, ['-Y', 'sign', '-f', publicPath, '-n', 'git', messagePath], {
      env: { ...process.env, SSH_AUTH_SOCK: socket },
    });
  };
  const first = await sign('lock-1.txt');
  check('the first signature, answered "Allow for 10 minutes", signs', first.code === 0, `exit ${first.code}: ${first.stderr.trim()}`);
  check('and raised one dialog', global.__AGENT_DIALOGS__.length === 1, `${global.__AGENT_DIALOGS__.length} dialogs`);
  const second = await sign('lock-2.txt');
  check('the second signature rides the window and signs', second.code === 0, `exit ${second.code}: ${second.stderr.trim()}`);
  check('without a new dialog', global.__AGENT_DIALOGS__.length === 1, `${global.__AGENT_DIALOGS__.length} dialogs`);

  vaultKeys.lock();

  const third = await sign('lock-3.txt');
  check('a lock ends the window: the third signature asks again', global.__AGENT_DIALOGS__.length === 2, `${global.__AGENT_DIALOGS__.length} dialogs`);
  check(
    'the agent log says why every window ended',
    global.__AGENT_LOG__.some((line) => /every signing window ended: the vaults were locked/.test(line)),
    global.__AGENT_LOG__.join(' | '),
  );
  check('and the key was not revoked: the third signature, answered once, signs (exit 0)', third.code === 0, `exit ${third.code}: ${third.stderr.trim()}`);
  check('the key is still loaded after the lock', manager.isLoaded('e-lock') === true);
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

/**
 * The login window, proven with real OpenSSH (#197, E3.4): what *Allow longer…* promises is that the NEXT real `ssh`
 * login goes through without a dialog — and that a Git signature, a lock and (for an RSA key) a SHA-1 login do not.
 * A unit test builds the userauth request by hand; only a real client and a real server show the window covers what
 * OpenSSH really sends. Two legs, each with its own key, vault and manager, and ONE `sshd -d` run per login (it serves
 * exactly one connection): Ed25519 first, then RSA, where login 3 asks for `ssh-rsa` and must NOT be covered.
 *
 * <p>POSIX only, like section 5; with `CI=true` a missing sshd FAILS. Teardown as in section 5: the client, then sshd
 * by its pid, then the folder.</p>
 */
async function liveLoginWindow(pem, dir) {
  if (loginWindowSkipped()) {
    return;
  }
  const sshdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-sshd-'));
  const began = Date.now();
  try {
    await loginLegs(pem, dir, sshdDir);
    console.log(`info  live login window: six sshd runs, ${Date.now() - began} ms`);
  } finally {
    removeFolder(sshdDir);
  }
}

/** Whether section 7 cannot run here: Windows (a skip), or no sshd (a skip locally, a FAIL on the CI runner). */
function loginWindowSkipped() {
  if (isWindows) {
    console.log('skip  live login window — POSIX only; the Extension Development Host check covers Windows');
    return true;
  }
  if (fs.existsSync(SSHD)) {
    return false;
  }
  if (process.env.CI === 'true') {
    check('a live login window ran', false, `${SSHD} is missing — a skipped live login window on the runner proves nothing`);
  } else {
    console.log('skip  live login window — sshd not installed');
  }
  return true;
}

/** A cleanup failure (a file the OS still holds) must never replace the real error above it. */
function removeFolder(folder) {
  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch {
    // swept by the OS
  }
}

/** The two legs, sharing one throwaway host key: Ed25519 first, then RSA, whose sshd also accepts `ssh-rsa` (SHA-1). */
async function loginLegs(pem, dir, sshdDir) {
  const hostKey = path.join(sshdDir, 'host_key');
  const generated = await run(tools.sshKeygen, ['-q', '-t', 'ed25519', '-N', '', '-f', hostKey]);
  check('a throwaway sshd host key was generated for the login window', generated.code === 0, generated.stderr.trim());
  if (generated.code !== 0) {
    return;
  }
  const base = { dir, sshdDir, hostKey };
  await windowLeg({ ...base, label: 'Ed25519', pem, folder: 'w2', extraConfig: [] }, edScenario);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  await windowLeg({ ...base, label: 'RSA', pem: rsa.privateKey.toString(), folder: 'w3', extraConfig: ['PubkeyAcceptedAlgorithms +ssh-rsa'] }, rsaScenario);
}

/** One leg: the key's public half and authorized_keys line written, a world built, the scenario run, the world closed. */
async function windowLeg(rig, scenario) {
  const parsed = parseSshPrivateKey(rig.pem, `itest ${rig.label} key`);
  check(`the ${rig.label} login-window key parses`, parsed.ok === true, parsed.reason);
  if (parsed.ok !== true) {
    return;
  }
  rig.publicPath = path.join(rig.sshdDir, `${rig.folder}.pub`);
  fs.writeFileSync(rig.publicPath, `${parsed.key.publicLine}
`);
  rig.authorizedKeys = path.join(rig.sshdDir, `${rig.folder}.authorized_keys`);
  fs.writeFileSync(rig.authorizedKeys, `${parsed.key.publicLine}
`);
  const world = legWorld(rig);
  try {
    if (await legServes(rig, world)) {
      [global.__AGENT_DIALOGS__, global.__AGENT_LISTS__, global.__AGENT_LOG__].forEach((list) => { list.length = 0; });
      await scenario(rig, world.vaultKeys);
    }
  } finally {
    world.close();
  }
}

/** A real `VaultKeys`, the lock link and the settings link (auto-lock at its default, 60) and a manager of its own. */
function legWorld(rig) {
  const { VaultKeys } = require(path.join(OUT, 'vaultKeys.js'));
  const { connectAgentToLock, connectAgentToSettings } = require(path.join(OUT, 'sshAgentWiring.js'));
  const { SshAgentManager } = require(path.join(OUT, 'sshAgentManager.js'));
  const published = {};
  const vaultKeys = new VaultKeys(mapSecretStorage());
  const manager = new SshAgentManager(
    { getPrivateKey: () => Promise.resolve(rig.pem) },
    path.join(rig.dir, rig.folder),
    { replace: (name, value) => { published[name] = value; }, delete: () => undefined, set description(_v) {} },
    () => vaultKeys.noteUserActivity(),
  );
  const links = [connectAgentToLock(vaultKeys, manager), connectAgentToSettings(vaultKeys, manager)];
  const close = () => {
    links.forEach((link) => link.dispose());
    manager.dispose();
  };
  return { vaultKeys, manager, published, close };
}

/** Loads the leg's key and checks the socket path fits a unix socket; true when the scenario may run. */
async function legServes(rig, world) {
  const loaded = await world.manager.load('a1', { id: `e-window-${rig.folder}`, name: `itest ${rig.label} key`, isSshEnabled: false, isSshKey: true });
  check(`the real manager loads and serves the ${rig.label} key for the login window`, loaded.ok === true, loaded.reason);
  rig.socket = world.published.SSH_AUTH_SOCK;
  const fits = typeof rig.socket === 'string' && rig.socket.length < 104;
  check(`the ${rig.label} login-window agent socket path fits a unix socket`, fits, String(rig.socket));
  return loaded.ok === true && fits;
}

const dialogCount = () => `${global.__AGENT_DIALOGS__.length} dialogs`;
const lastDialog = () => global.__AGENT_DIALOGS__[global.__AGENT_DIALOGS__.length - 1] ?? { message: '', buttons: [] };

/** Login 1 of a leg: the prompt offers four buttons, the list offers four lengths, `1 hour` is picked and the login succeeds. */
async function firstLoginPicksOneHour(rig) {
  const first = await login(rig, { answers: [ALLOW_LONGER], picks: ['1 hour'] });
  check(`${rig.label}: login 1, answered "${ALLOW_LONGER}" and "1 hour", logs in`, first.code === 0, first.detail);
  check(`${rig.label}: login 1 raised one dialog`, global.__AGENT_DIALOGS__.length === 1, dialogCount());
  check(`${rig.label}: and it offered four buttons`, lastDialog().buttons.length === 4 && lastDialog().buttons.includes(ALLOW_LONGER), JSON.stringify(lastDialog().buttons));
  const lengths = global.__AGENT_LISTS__.map((list) => list.items.map((item) => item.label).join(', '));
  check(`${rig.label}: and one list of 1, 4, 8 and 12 hours`, lengths.length === 1 && lengths[0] === '1 hour, 4 hours, 8 hours, 12 hours', JSON.stringify(lengths));
}

/** Login 2 of a leg: no answers on offer — a dialog would be refused — so the window covered it or the login fails. */
async function secondLoginRidesTheWindow(rig) {
  const second = await login(rig, {});
  check(`${rig.label}: login 2 rides the window and logs in`, second.code === 0, second.detail);
  check(`${rig.label}: login 2 raised no dialog`, global.__AGENT_DIALOGS__.length === 1, dialogCount());
  check(
    `${rig.label}: the agent log names the login window`,
    global.__AGENT_LOG__.some((line) => line.includes(`login window of "itest ${rig.label} key"`)),
    global.__AGENT_LOG__.join(' | '),
  );
}

/** Ed25519: login, login (window), a Git signature (asks, without the list), a lock, login 3 (asks, without the list). */
async function edScenario(rig, vaultKeys) {
  await firstLoginPicksOneHour(rig);
  await secondLoginRidesTheWindow(rig);
  const messagePath = path.join(rig.sshdDir, 'window-git.txt');
  fs.writeFileSync(messagePath, 'a Git signature, which a login window never covers\n');
  global.__AGENT_ANSWER__ = [ALLOW_ONCE];
  const git = await run(tools.sshKeygen, ['-Y', 'sign', '-f', rig.publicPath, '-n', 'git', messagePath], { env: { ...process.env, SSH_AUTH_SOCK: rig.socket } });
  check('Ed25519: a Git signature during the window still asks', global.__AGENT_DIALOGS__.length === 2, dialogCount());
  check(`Ed25519: and its dialog has no "${ALLOW_LONGER}"`, !lastDialog().buttons.includes(ALLOW_LONGER), JSON.stringify(lastDialog().buttons));
  check('Ed25519: and, answered once, it signs (exit 0)', git.code === 0, `exit ${git.code}: ${git.stderr.trim()}`);

  vaultKeys.lock();
  const third = await login(rig, { answers: [ALLOW_ONCE] });
  check('Ed25519: after a lock, login 3 asks again', global.__AGENT_DIALOGS__.length === 3, dialogCount());
  check(`Ed25519: and its dialog offers no "${ALLOW_LONGER}"`, !lastDialog().buttons.includes(ALLOW_LONGER), JSON.stringify(lastDialog().buttons));
  check('Ed25519: and says the vault must be unlocked', /Longer windows need the vault unlocked/.test(lastDialog().message), JSON.stringify(lastDialog().message));
  check('Ed25519: and, answered once, the login succeeds (the lock revoked nothing)', third.code === 0, third.detail);
}

/** RSA: login, login (window, SHA-2), then a login that asks for `ssh-rsa` (SHA-1) — asked, without the list, saying why. */
async function rsaScenario(rig) {
  await firstLoginPicksOneHour(rig);
  await secondLoginRidesTheWindow(rig);
  const sha1 = await login(rig, { answers: [ALLOW_ONCE], options: ['-o', 'PubkeyAcceptedAlgorithms=ssh-rsa'] });
  console.log(`info  RSA login 3 with ssh-rsa (SHA-1): exit ${sha1.code}`);
  check('RSA: a SHA-1 login is not covered by the window: login 3 asks', global.__AGENT_DIALOGS__.length === 2, `${dialogCount()}\n${sha1.detail}`);
  check(`RSA: and its dialog has no "${ALLOW_LONGER}"`, !lastDialog().buttons.includes(ALLOW_LONGER), JSON.stringify(lastDialog().buttons));
  check('RSA: and names the SHA-1 reason', /Longer windows need a SHA-2 signature/.test(lastDialog().message), JSON.stringify(lastDialog().message));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
