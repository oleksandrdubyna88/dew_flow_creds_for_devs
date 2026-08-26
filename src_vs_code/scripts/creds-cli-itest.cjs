// Integration test: the REAL .NET `creds` binary against the REAL broker.
//
//   npm run compile && node scripts/creds-cli-itest.cjs
//
// What it proves that nothing else does. The contract test on each side asserts that the two
// implementations' TABLES agree; neither asserts that the binary can talk to the broker at all.
// Until this existed, `creds` had never once been run against a live CredsAgentServer — the
// whole .NET client rested on two tables matching a JSON file.
//
// The verbs chosen are not arbitrary. `env` and `vpn` are exactly the shapes whose answers carry
// no `exitCode`, which is the defect that reached a released build in the Node client: a
// SUCCESSFUL call reported itself as broker failure 95 and printed nothing. If the .NET mirror
// ever regresses to the same fall-through, these go red.
//
// Actions are test-only stubs rather than real ssh: what is under test is the wire between the
// binary and the broker, not what an action does once it is reached.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const Module = require('module');

// ---- vscode stub, with a controllable modal --------------------------------
const answers = { next: 'Allow', asked: 0, log: [] };
const stub = path.join(os.tmpdir(), 'creds-cli-itest-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `const answers = global.__CREDS_CLI_ANSWERS__;
   module.exports = {
     window: {
       showWarningMessage: (message) => { answers.asked += 1; return Promise.resolve(answers.next); },
       showInformationMessage: () => Promise.resolve(undefined),
       showErrorMessage: () => Promise.resolve(undefined),
       createOutputChannel: () => ({ appendLine: (l) => answers.log.push(l), dispose(){} }),
       createTerminal: () => ({ show(){}, sendText(){}, dispose(){}, name: 't', exitStatus: undefined }),
       terminals: [],
       onDidCloseTerminal: () => ({ dispose(){} }),
     },
     workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
     Uri: { file: (p) => ({ fsPath: p }) },
   };`,
);
global.__CREDS_CLI_ANSWERS__ = answers;
const orig = Module._resolveFilename;
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const OUT = path.join(__dirname, '..', 'out');
const { CredsAgentServer } = require(path.join(OUT, 'credsAgentServer.js'));
const { UseActionRegistry } = require(path.join(OUT, 'useActions.js'));
const { parseToken } = require(path.join(OUT, 'grantToken.js'));

let fails = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  if (!ok) fails += 1;
};

// ---- the binary ------------------------------------------------------------
// Debug build, because this runs on a workstation. A machine that has not built the CLI skips
// rather than fails: the extension's own suite must not require a .NET SDK.
const EXE = path.join(
  __dirname,
  '..',
  '..',
  'src_cli',
  'src',
  'bin',
  'Debug',
  'net10.0',
  process.platform === 'win32' ? 'creds.exe' : 'creds',
);

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      EXE,
      args,
      // Never relay to Windows from inside this test: the binary under test is the one built
      // here, and an interop hop would silently exercise a different file.
      { env: { ...process.env, CREDS_RELAYED_FROM_WSL: '1', ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error && typeof error.code === 'number' ? error.code : 0, stdout, stderr });
      },
    );
  });
}

// ---- fakes -----------------------------------------------------------------
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-cli-itest-'));

const ENTITY = { id: 'e-1', name: 'itest-entry', host: '127.0.0.1', user: 'nobody' };
const storage = {
  getNode: () => ({ id: ENTITY.id, name: ENTITY.name, type: 'entity', details: ENTITY }),
  getAccounts: () => [{ accountId: 'a-1', email: 'itest@example.com', provider: 'google' }],
};

/** A stub action: no ssh, no network — the wire is what is under test. */
const action = (kind, verb, run) => ({
  kind,
  action: verb,
  verb: `use ${kind}`,
  validate: () => ({ ok: true }),
  summarize: () => `itest ${kind}:${verb}`,
  describeOutcome: () => 'done',
  run,
});

(async () => {
  if (!fs.existsSync(EXE)) {
    console.log(`SKIP  the CLI is not built at ${EXE}`);
    console.log('      run: dotnet build src_cli/src/CredsCli.csproj');
    return;
  }

  const actions = new UseActionRegistry();
  actions.register(
    action('ssh', 'exec', async () => ({
      status: 200,
      body: {
        exitCode: 7,
        stdout: 'hello from the broker\n',
        stderr: 'a warning\n',
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
        durationMs: 1,
      },
    })),
  );
  // The two shapes with no exitCode — the defect this file exists to keep fixed.
  actions.register(action('credential', 'exportEnv', async () => ({ status: 200, body: { written: ['ITEST_TOKEN', 'ITEST_REGION'] } })));
  actions.register(action('vpn', 'up', async () => ({ status: 200, body: { opened: true } })));
  actions.register(action('vpn', 'down', async () => ({ status: 200, body: { opened: false } })));

  const aliases = { 'itest-alias': { accountId: 'a-1', entityId: ENTITY.id, entityName: ENTITY.name, kind: 'ssh' } };
  const server = new CredsAgentServer(
    actions,
    () => {},
    storageDir,
    undefined,
    undefined,
    (name) => aliases[name],
    () => Object.entries(aliases).map(([name, a]) => ({ name, kind: a.kind })),
  );

  const token = await server.share('a-1', ENTITY.id, ENTITY.name, 'ssh');
  const { port } = parseToken(token);

  // ---- the token path ------------------------------------------------------
  const exec = await runCli(['ssh', token, '--', 'anything']);
  check('the binary reaches the broker and prints its stdout', exec.stdout.includes('hello from the broker'), JSON.stringify(exec.stdout));
  check('stderr comes back on stderr', exec.stderr.includes('a warning'), JSON.stringify(exec.stderr));
  check("the remote command's own exit code passes through untouched", exec.code === 7, `code ${exec.code}`);
  check('the consent modal actually gated the call', answers.asked === 1, `asked ${answers.asked}`);

  // ---- the two shapes that once reported success as failure 95 -------------
  const envCall = await runCli(['env', await server.share('a-1', ENTITY.id, ENTITY.name, 'credential')]);
  check('a successful env export exits 0, not 95', envCall.code === 0, `code ${envCall.code}`);
  check('...and names the variables it wrote', envCall.stdout.includes('ITEST_TOKEN') && envCall.stdout.includes('ITEST_REGION'), JSON.stringify(envCall.stdout));

  const vpnUp = await runCli(['vpn-up', await server.share('a-1', ENTITY.id, ENTITY.name, 'vpn')]);
  check('a tunnel that came up exits 0, not 95', vpnUp.code === 0, `code ${vpnUp.code}`);

  const vpnDown = await runCli(['vpn-down', await server.share('a-1', ENTITY.id, ENTITY.name, 'vpn')]);
  check('a tunnel the human refused is NOT reported as success', vpnDown.code !== 0, `code ${vpnDown.code}`);
  check('...and says so on stderr', /not brought down/i.test(vpnDown.stderr), JSON.stringify(vpnDown.stderr));

  // ---- refusals ------------------------------------------------------------
  answers.next = 'Deny';
  const denied = await runCli(['ssh', await server.share('a-1', ENTITY.id, ENTITY.name, 'ssh'), '--', 'x']);
  check('a denied grant is reported as denied (92)', denied.code === 92, `code ${denied.code}`);
  answers.next = 'Allow';

  const unknown = await runCli(['ssh', `${port}.aaaaaaaaaaaa`, '--', 'x']);
  check('an unknown token is 91, not a generic failure', unknown.code === 91, `code ${unknown.code}`);

  // A port nothing of ours listens on: the health probe must refuse BEFORE the token is sent.
  const wrongPort = await runCli(['ssh', `1.aaaaaaaaaaaa`, '--', 'x']);
  check('a port with no broker is 90, and no token was sent there', wrongPort.code === 90, `code ${wrongPort.code}`);

  // ---- the alias path ------------------------------------------------------
  // Discovery reads the endpoint file the broker wrote when it started.
  const endpointDir = path.join(storageDir, 'endpoints');
  check('the broker announced itself so a terminal can find it', fs.existsSync(endpointDir) && fs.readdirSync(endpointDir).length > 0);

  const aliasEnv = { CREDS_ENDPOINT_DIR: endpointDir };
  const byName = await runCli(['ssh', 'itest-alias', '--', 'anything'], aliasEnv);
  check('a call by NAME reaches the same entry', byName.stdout.includes('hello from the broker'), JSON.stringify(byName.stdout + byName.stderr));
  check('...and passes the exit code through as well', byName.code === 7, `code ${byName.code}`);

  const unknownName = await runCli(['ssh', 'no-such-name', '--', 'x'], aliasEnv);
  check('an unknown name is refused without saying whether it exists', unknownName.code !== 0 && !/exists/i.test(unknownName.stderr), `code ${unknownName.code}`);

  const badName = await runCli(['ssh', 'Not A Valid Name', '--', 'x'], aliasEnv);
  check('a name a shell could misread is refused before any call (96)', badName.code === 96, `code ${badName.code}`);

  // A TOKEN must never fall back to a discovered endpoint. Discovery reads a file anyone with
  // write access to globalStorage could forge, and its health probe only proves the far end
  // says our service name — which a forger would. If a token could be rerouted that way, a
  // bearer SECRET would be delivered to whatever wrote the file. The token carries its own
  // port precisely so this is impossible, and this fails the moment somebody adds a helpful
  // fallback: the endpoint file here is valid and points at a live broker.
  const strayToken = await runCli(['ssh', `1.aaaaaaaaaaaa`, '--', 'x'], aliasEnv);
  check(
    'a token with an unreachable port does NOT fall back to a discovered endpoint',
    strayToken.code === 90,
    `code ${strayToken.code}`,
  );

  // ---- the Remote-SSH transport -------------------------------------------
  // What `ssh -R` forwards is a unix socket, and the binary on the remote host talks HTTP over
  // it with no loopback port to dial. POSIX only: on Windows the broker's second listener is a
  // named pipe, which is not what a bridge carries.
  if (process.platform !== 'win32') {
    const { socketPathFor } = require(path.join(OUT, 'brokerListeners.js'));
    const sock = socketPathFor(storageDir, process.pid, process.platform);
    check('the broker opened the socket a bridge would forward', sock !== undefined && fs.existsSync(sock), String(sock));

    const overSocket = await runCli(
      ['ssh', await server.share('a-1', ENTITY.id, ENTITY.name, 'ssh'), '--', 'anything'],
      { CREDS_BROKER_SOCKET: sock },
    );
    check('the CLI reaches the broker over the socket, with no port dialled', overSocket.stdout.includes('hello from the broker'), JSON.stringify(overSocket.stdout + overSocket.stderr));
    check('...and the exit code still passes through', overSocket.code === 7, `code ${overSocket.code}`);

    const aliasOverSocket = await runCli(['ssh', 'itest-alias', '--', 'anything'], { CREDS_BROKER_SOCKET: sock });
    check('a call by NAME works over the socket too, without any endpoint file', aliasOverSocket.code === 7, `code ${aliasOverSocket.code}`);
  }

  // ---- creds ls ------------------------------------------------------------
  const listed = await runCli(['ls'], aliasEnv);
  check('`creds ls` names what is enabled', listed.stdout.includes('itest-alias'), JSON.stringify(listed.stdout + listed.stderr));
  check('...with its kind beside it', /itest-alias\s+ssh/.test(listed.stdout), JSON.stringify(listed.stdout));
  check('...and exits 0', listed.code === 0, `code ${listed.code}`);
  check(
    'the listing carries no address for the entry it names',
    !/a-1|e-1|accountId|entityId/.test(listed.stdout),
    JSON.stringify(listed.stdout),
  );

  const lsWithArg = await runCli(['ls', 'itest-alias'], aliasEnv);
  check('`creds ls <name>` is refused rather than answering a different question', lsWithArg.code === 96, `code ${lsWithArg.code}`);

  // ---- the endpoint note is not a secret ----------------------------------
  const noteText = fs.readFileSync(path.join(endpointDir, fs.readdirSync(endpointDir)[0]), 'utf8');
  check(
    'the endpoint file carries nothing secret',
    !/secret|token|password/i.test(noteText),
    noteText,
  );

  server.dispose();
  // Give the close a tick, then prove the note is gone with the window.
  await new Promise((r) => setTimeout(r, 200));
  check('closing the window removes its announcement', fs.readdirSync(endpointDir).length === 0);

  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
