// Integration test: drives the compiled agent broker and the REAL agentCli.js
// against it, with `vscode` stubbed the way server-transport-itest.cjs does.
//
//   npm run compile && node scripts/agent-broker-itest.cjs
//
// What it proves that the unit tests cannot: the HTTP surface answers the codes
// the contract promises, the consent gate actually gates, the CLI's exit codes
// map to them, and a real `ssh` child is spawned, captured and bounded.
//
// No SSH server is required — the exec cases target an address that refuses or
// blackholes, which exercises spawn/capture/timeout without needing a host.
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { execFile } = require('child_process');
const Module = require('module');

// ---- vscode stub, with a controllable modal --------------------------------
const answers = { next: 'Allow', asked: 0, lastMessage: '' };
const stub = path.join(os.tmpdir(), 'creds-agent-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `const answers = global.__CREDS_ANSWERS__;
   module.exports = {
     window: {
       showWarningMessage: (message) => {
         answers.asked += 1;
         answers.lastMessage = message;
         return Promise.resolve(answers.next);
       },
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
answers.log = [];
global.__CREDS_ANSWERS__ = answers;
const orig = Module._resolveFilename;
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const OUT = path.join(__dirname, '..', 'out');
const { CredsAgentServer } = require(path.join(OUT, 'credsAgentServer.js'));
const { UseActionRegistry } = require(path.join(OUT, 'useActions.js'));
const { sshExecAction, sshTerminalAction } = require(path.join(OUT, 'sshUseActions.js'));
const { parseToken } = require(path.join(OUT, 'grantToken.js'));

// ---- fakes -----------------------------------------------------------------
const ENTITY = {
  id: 'e-1',
  name: 'itest-host',
  // 127.0.0.1:1 refuses instantly: a real connection attempt, no waiting.
  host: '127.0.0.1',
  user: 'nobody',
  port: 1,
  isSshEnabled: true,
};
const storage = {
  entity: ENTITY,
  password: 'hunter2',
  privateKey: undefined,
  getNode(_a, id) {
    return this.entity && id === this.entity.id ? { id, details: this.entity } : undefined;
  },
  getPrivateKey: async function () {
    return this.privateKey;
  },
  getPassword: async function () {
    return this.password;
  },
};
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-itest-'));
// Recursive on purpose. Materialized keys live in `keys/<pid>/`, not `keys/` — each window
// owns a subdirectory so one window's purge can never delete another's in-use file. This
// helper read only the top level, so it returned [] no matter what was on disk: the
// concurrent-key check could never pass, and the two checks either side of it — "leaves no
// decrypted key on disk" and "no key material is left" — passed without ever looking at a
// file. A test that cannot fail is worse than one that cannot pass; both were untrue here.
const keyFiles = () => {
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.key') ? [e.name] : [],
    );
  };
  return walk(path.join(storageDir, 'keys'));
};
// Only ever written to disk and pointed at with `-i`; ssh never gets far enough
// to parse it in these cases, so its contents are irrelevant to what is asserted.
const STORED_KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nitest\n-----END OPENSSH PRIVATE KEY-----\n';
// Long enough to be masked (short values are deliberately left alone), and distinctive enough
// that finding it in a response body means the masker did not run.
const MASKABLE_SECRET = 'itest-password-Tr0ub4dor';

let fails = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  if (!ok) fails += 1;
};

function call(port, pathname, token, body, method = 'POST') {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(OUT, 'agentCli.js'), ...args], (error, stdout, stderr) => {
      resolve({ code: error && typeof error.code === 'number' ? error.code : 0, stdout, stderr });
    });
  });
}

(async () => {
  const actions = new UseActionRegistry();
  // The masking provider the extension supplies in real life. Here it is one known value, so
  // the check below proves the whole path — action output, through respond(), out to the
  // caller — not just the pure masker's unit tests.
  const server = new CredsAgentServer(actions, () => {}, storageDir, async () => [
    { value: MASKABLE_SECRET, label: 'DB_PASSWORD' },
  ]);
  const deps = {
    storage,
    storageDir,
    signal: server.signal,
    acquireExecSlot: server.acquireExecSlot,
    note: server.note,
  };
  actions.register(sshExecAction(deps));
  actions.register(sshTerminalAction(deps));
  // Test-only: an action whose output contains the secret, so masking has something to mask.
  actions.register({
    kind: 'ssh',
    action: 'leak',
    verb: 'print a secret from',
    validate: () => ({ ok: true }),
    summarize: () => 'a deliberate leak, for the masking check',
    describeOutcome: () => 'leaked',
    run: async () => ({
      status: 200,
      body: { exitCode: 0, stdout: `secret=${MASKABLE_SECRET}`, stderr: '', timedOut: false },
    }),
  });

  const token = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  const { port, secret } = parseToken(token);
  console.log(`broker on 127.0.0.1:${port}\n`);

  // --- the surface -----------------------------------------------------------
  const health = await call(port, '/v1/health', undefined, undefined, 'GET');
  check('health names the service, without a token', health.status === 200 && health.body.service === 'creds-for-devs-agent');

  const noToken = await call(port, '/v1/use/exec', undefined, { command: 'true' });
  check('a call without a token is 401', noToken.status === 401, `got ${noToken.status}`);

  const wrongToken = await call(port, '/v1/use/exec', 'nope', { command: 'true' });
  check('an unknown token is 401 and is NOT logged', wrongToken.status === 401 && !answers.log.some((l) => l.includes('nope')));

  const badRoute = await call(port, '/v1/use/../health', secret, {});
  check('a traversal route is refused', badRoute.status === 404, `got ${badRoute.status}`);

  const askedBefore = answers.asked;
  const badBody = await call(port, '/v1/use/exec', secret, { command: '' });
  check('an invalid body is 400 BEFORE any dialog', badBody.status === 400 && answers.asked === askedBefore);

  // --- consent ---------------------------------------------------------------
  answers.next = 'Allow';
  const first = await call(port, '/v1/use/exec', secret, { command: 'true' });
  check('the first call asks the human once', answers.asked === askedBefore + 1);
  check('the consent dialog shows the command about to run', answers.lastMessage.includes('true'));
  check('an allowed exec returns 200 with a real ssh result', first.status === 200 && typeof first.body.exitCode === 'number', JSON.stringify(first.body).slice(0, 120));
  check('a refused connection is reported as ssh exit 255, not a broker error', first.body.exitCode === 255, `exit ${first.body.exitCode}`);
  check('ssh stderr is captured', /connect|refused|closed/i.test(first.body.stderr), first.body.stderr.trim().slice(0, 80));

  // --- masking: an agent must not read a secret out of its own output ------------------
  // A purpose-built action that DOES print the secret, because the real exec cases here
  // target a host that refuses — their stdout is empty, so asserting "no secret in the
  // output" against them would pass without the masker existing at all. This one proves the
  // respond() layer masks whatever an action returns, over real HTTP.
  const leaked = await call(port, '/v1/use/leak', secret, {});
  check(
    'a secret in action output is masked before it leaves the broker',
    leaked.status === 200 && !JSON.stringify(leaked.body).includes(MASKABLE_SECRET),
    `body: ${JSON.stringify(leaked.body).slice(0, 120)}`,
  );
  check(
    '…and the placeholder names it, so the agent sees a value was withheld',
    JSON.stringify(leaked.body).includes('<CREDS_MASKED:DB_PASSWORD>'),
    `body: ${JSON.stringify(leaked.body).slice(0, 120)}`,
  );

  const askedAfterAllow = answers.asked;
  await call(port, '/v1/use/exec', secret, { command: 'true' });
  check('later calls on an allowed token do NOT ask again', answers.asked === askedAfterAllow);

  // --- deny is sticky --------------------------------------------------------
  const denied = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  const deniedSecret = parseToken(denied).secret;
  answers.next = 'Deny';
  const firstDeny = await call(port, '/v1/use/exec', deniedSecret, { command: 'true' });
  const askedAfterDeny = answers.asked;
  const secondDeny = await call(port, '/v1/use/exec', deniedSecret, { command: 'true' });
  check('a denied token is 403', firstDeny.status === 403 && secondDeny.status === 403);
  check('a denied token is never asked about again', answers.asked === askedAfterDeny);

  // --- dismissal is NOT sticky ----------------------------------------------
  const dismissed = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  const dismissedSecret = parseToken(dismissed).secret;
  answers.next = undefined; // Escape
  const escaped = await call(port, '/v1/use/exec', dismissedSecret, { command: 'true' });
  check('a dismissed dialog refuses the call', escaped.status === 504, `got ${escaped.status}`);
  answers.next = 'Allow';
  const retried = await call(port, '/v1/use/exec', dismissedSecret, { command: 'true' });
  check('…but the same token can be allowed on a retry', retried.status === 200, `got ${retried.status}`);

  // --- the entity vanishing --------------------------------------------------
  const live = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  const liveSecret = parseToken(live).secret;
  answers.next = 'Allow';
  await call(port, '/v1/use/exec', liveSecret, { command: 'true' });
  storage.entity = undefined; // deleted from the vault after the grant was minted
  const gone = await call(port, '/v1/use/exec', liveSecret, { command: 'true' });
  check('an entity deleted after minting is 404, not a stale run', gone.status === 404, `got ${gone.status}`);
  storage.entity = ENTITY;

  // --- the real CLI ----------------------------------------------------------
  const cliOk = await runCli(['ssh', token, '--', 'true']);
  check('the CLI passes the remote exit code through', cliOk.code === 255, `exit ${cliOk.code}`);
  check('the CLI prints ssh stderr as stderr', /connect|refused|closed/i.test(cliOk.stderr), cliOk.stderr.trim().slice(0, 80));

  const cliUnknown = await runCli(['ssh', `${port}.aaaaaaaaaaaa`, '--', 'true']);
  check('the CLI reports an unknown token as 91', cliUnknown.code === 91, `exit ${cliUnknown.code}`);

  const cliDenied = await runCli(['ssh', `${port}.${deniedSecret}`, '--', 'true']);
  check('the CLI reports a denied grant as 92', cliDenied.code === 92, `exit ${cliDenied.code}`);

  // --- ceilings --------------------------------------------------------------
  // 10.255.255.1 blackholes: the connection never completes, so the wall-clock
  // ceiling is what ends it.
  storage.entity = { ...ENTITY, host: '10.255.255.1', port: 22 };
  const slow = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  answers.next = 'Allow';
  const timedOut = await call(port, '/v1/use/exec', parseToken(slow).secret, {
    command: 'true',
    timeoutMs: 1500,
  });
  check('a hung ssh is killed at the ceiling and reported', timedOut.status === 200 && timedOut.body.timedOut === true, JSON.stringify(timedOut.body).slice(0, 120));
  storage.entity = ENTITY;

  // --- the decrypted key must never be left behind ---------------------------
  // A grant is minted while the entity has a host; the host can be cleared
  // afterwards, and the key is written to disk before anything checks.
  storage.privateKey = STORED_KEY;
  storage.entity = { ...ENTITY, host: undefined };
  const hostless = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  answers.next = 'Allow';
  const noHost = await call(port, '/v1/use/exec', parseToken(hostless).secret, { command: 'true' });
  check('an entity with no host is refused', noHost.status === 409, `got ${noHost.status}`);
  check('…and leaves no decrypted key on disk', keyFiles().length === 0, `left ${keyFiles().join(', ')}`);

  // --- one exec must not delete the key another is still using ---------------
  // 10.255.255.1 blackholes, so both children live until their own ceiling.
  storage.entity = { ...ENTITY, host: '10.255.255.1', port: 22 };
  const shared = await server.share('acct-1', ENTITY.id, ENTITY.name, 'ssh');
  const sharedSecret = parseToken(shared).secret;
  answers.next = 'Allow';
  const quick = call(port, '/v1/use/exec', sharedSecret, { command: 'true', timeoutMs: 1000 });
  const lingering = call(port, '/v1/use/exec', sharedSecret, { command: 'true', timeoutMs: 5000 });
  await quick; // the short one finishes and cleans up after itself
  await new Promise((r) => setTimeout(r, 300));
  check('a finished exec leaves a concurrent one its key file', keyFiles().length > 0, 'the key was deleted while another exec was still running');
  await lingering;
  check('once both are done, no key material is left', keyFiles().length === 0, `left ${keyFiles().join(', ')}`);
  storage.privateKey = undefined;
  storage.entity = ENTITY;

  // --- the audit survives the window ------------------------------------------
  // The output channel is a buffer that dies with the window — and closing the
  // window is ALSO how a grant is revoked, so the record used to be destroyed at
  // the moment it became history.
  const logRoot = path.join(storageDir, 'logs');
  const logFiles = () => {
    try {
      return fs.readdirSync(logRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((d) => fs.readdirSync(path.join(logRoot, d.name)).map((n) => path.join(logRoot, d.name, n)));
    } catch { return []; }
  };
  const written = logFiles();
  check('the audit is written to a file, not only to the window', written.length === 1, `found ${written.length} files`);
  const body = written.length === 1 ? fs.readFileSync(written[0], 'utf8') : '';
  check('…it records the grant being handed out', /share .*granted/.test(body), 'no share line');
  check('…and every call the agent made', /#\d+ exec/.test(body), 'no numbered exec line');
  check('…numbered, so a runaway loop is visible after the fact', /#1 /.test(body) && /#[2-9]/.test(body), 'calls are not numbered');
  check('…and never the grant secret in full', !body.includes(parseToken(token).secret), 'THE SECRET IS IN THE LOG FILE');
  check('the file is named for the run and the pid', /agent-\d{2}-\d{2}-\d{2}-\d+\.log$/.test(written[0] ?? ''), written[0] ?? '');

  // --- dispose ---------------------------------------------------------------
  server.dispose();
  const afterDispose = await runCli(['ssh', token, '--', 'true']);
  check('once the window is gone the CLI says so (90)', afterDispose.code === 90, `exit ${afterDispose.code}`);

  fs.rmSync(storageDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} FAILED`}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
