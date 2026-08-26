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
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const OUT = path.join(__dirname, '..', 'out');
const { SshAgentServer, agentSocketPath } = require(path.join(OUT, 'sshAgentServer.js'));
const { parseSshPrivateKey } = require(path.join(OUT, 'sshKeyParse.js'));
const { signForAgent } = require(path.join(OUT, 'sshAgentSign.js'));

const isWindows = process.platform === 'win32';
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-agent-itest-'));
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
