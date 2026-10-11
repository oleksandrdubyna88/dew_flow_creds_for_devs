// Integration test: the REAL Linux `creds-mcp` INSIDE WSL, answering from a window on Windows.
//
//   npm run compile && node scripts/creds-mcp-wsl-itest.cjs
//
// What it proves that nothing else can. `creds-mcp-itest.cjs` drives the Windows binary against a
// Windows broker: both halves are on one side of the boundary, so it says nothing about the case
// this bridge exists for — an MCP client running inside a distribution, where 127.0.0.1 is the
// virtual machine's loopback and the announcement files are on a disk this kernel only sees as
// /mnt. The unit tests in CredsMcp.Tests cover the pump's endings on streams; whether a real
// Linux process reaches a real Windows window is a fact about another process table, and the only
// honest way to assert it is to do it.
//
// And since E5 (PLAN_wsl_bridge_outlives_its_client.md): that NO Windows half outlives its client. A
// client shaped like Claude Code (`wsl-mcp-client.cjs`, inside the distribution, the wrapper's real
// parent) opens the captured session with its held `subscriptions/listen`, and ends it five ways —
// SIGINT, SIGTERM, SIGHUP, a closed stdin, and SIGKILL of the wrapper. After each, the Windows
// `creds-mcp.exe` this run started must be gone within 5 s.
//
// Every binary it starts is a COPY in this run's own directory (`wslRun.cjs`), and every watch asks by
// executable path under it, on both sides (`wslStrays.cjs`) — so nothing anybody else runs can be
// asserted on or stopped. Nothing is deleted inside the distribution.
//
// Skipped LOUDLY, never silently: no Windows, no WSL, no Windows binary, no .NET SDK, node or python3
// inside the distribution, or a Linux build that would not build — each prints the command that fixes it.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const Module = require('node:module');
const readline = require('node:readline');

// ---- vscode stub -----------------------------------------------------------
// The same shape creds-mcp-itest.cjs uses: the broker under test is the real one, and it imports
// `vscode` for the consent modal. Every answer here is Allow — what is under test is the route
// across the kernel boundary, not the gate, which its sibling covers in full.
const consent = { answers: [], asked: 0 };
global.__CREDS_MCP_WSL_CONSENT__ = consent;
const stub = path.join(os.tmpdir(), 'creds-mcp-wsl-itest-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `module.exports = {
     window: {
       showWarningMessage: () => {
         const c = global.__CREDS_MCP_WSL_CONSENT__;
         c.asked += 1;
         return Promise.resolve(c.answers.shift() ?? 'Allow');
       },
       showInformationMessage: () => Promise.resolve(undefined),
       showErrorMessage: () => Promise.resolve(undefined),
       createOutputChannel: () => ({ appendLine(){}, dispose(){} }),
     },
     workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
     Uri: { file: (p) => ({ fsPath: p }) },
   };`,
);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = (request, ...rest) =>
  request === 'vscode' ? stub : originalResolve.call(Module, request, ...rest);

const OUT = path.join(__dirname, '..', 'out');
const { runAndSweep, started, watchLinuxPids, watchWindowsPids } = require('./wslStrays.cjs');
const { REPO, WSL_EXE, run, stepArgv, wslStep, asLinux, skip, windowsBuild, runDirectories, copyWindowsBinary, linuxBinary, finishRun } = require('./wslRun.cjs');

/** Every watch this run started; the sweep at the bottom walks them. */
const watches = [];
/** This run's directories, once made. */
let dirs;
let windowsMcp;
let linuxMcp;

const FIXTURE = path.join(REPO, 'src_mcp', 'tests', 'fixtures', 'claude-code-2.1.289-handshake-2026-07-28.jsonl');
const CLIENT = path.join(__dirname, 'wsl-mcp-client.cjs');
/** The plan's "polled up to 5 s": how long a Windows half may take to leave once its client is gone. */
const GONE_WITHIN_MS = 5_000;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) {
    failures += 1;
  }
}

/**
 * The variables every step inside the distribution needs, as name → value — exported by `wslSteps.sh` after
 * the login profile, never written into a shell line.
 *
 * <p>`WSLENV` is the load-bearing entry. Environment variables do NOT cross from WSL into a
 * Windows child — measured 2026-08-26, including from .NET's own `ProcessStartInfo.Environment` —
 * so without naming `CREDS_ENDPOINT_DIR` there the Windows half would read the real VS Code
 * endpoint directory instead of this test's, and answer about somebody's actual vault. `/p` asks
 * WSL to translate the path on the way through. `CREDS_LOG_DIR` crosses the same way, so neither
 * half writes into the person's real log folder.</p>
 */
function bridgeEnv(endpointDir, windowsBinary = windowsMcp) {
  return {
    CREDS_ENDPOINT_DIR: asLinux(endpointDir),
    CREDS_LOG_DIR: asLinux(dirs.logs),
    WSLENV: 'CREDS_ENDPOINT_DIR/p:CREDS_LOG_DIR/p',
    CREDS_MCP_WINDOWS_BINARY: asLinux(windowsBinary),
  };
}

/**
 * Drive the Linux binary the way an MCP client does: write requests, hold stdin open, collect.
 *
 * <p>Stdin is held open until the answers arrive. Closing it early makes the server shut down
 * mid-flight and the replies never appear — the same hour-long false alarm recorded in this
 * script's Windows sibling, and here it would look exactly like a broken bridge.</p>
 */
function speak(env, requests, settleMs = 4000) {
  return new Promise((resolve) => {
    const child = spawn(WSL_EXE, stepArgv(env, 'exec', [linuxMcp]));
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    let sent = 0;
    const next = () => {
      if (sent < requests.length) {
        child.stdin.write(`${JSON.stringify(requests[sent])}\n`);
        sent += 1;
        setTimeout(next, 200);
        return;
      }
      setTimeout(() => {
        child.stdin.end();
        child.kill();
        resolve({ byId: repliesById(out), out, err });
      }, settleMs);
    };
    next();
  });
}

function repliesById(out) {
  const byId = new Map();
  for (const line of out.split('\n')) {
    if (!line.includes('"jsonrpc"')) continue;
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined) byId.set(message.id, message);
    } catch {
      /* a partial line from a killed process is not a failure */
    }
  }
  return byId;
}

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'creds-mcp-wsl-itest', version: '1' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

/** What the window on Windows serves. One entry, opened to agents, with a password it keeps. */
const ENTRIES = [
  {
    id: 'e-wsl-1',
    name: 'orders-db',
    kind: 'db',
    folder: 'Databases',
    host: 'db-01.example.internal',
    port: 3306,
    user: 'app',
    dbType: 'mysql',
    connectionString: 'mysql://app@db-01.example.internal:3306/orders',
    hasPassword: true,
    hasPrivateKey: false,
    hasNotes: false,
    hasTotp: false,
    dependsOn: [],
    can: { use: true, edit: false, create: true, delete: false },
  },
];

const WINDOW_SECRET = 'hunter2-WSL-ITEST-SECRET';

/** Everything this harness needs before it may start anything; skips loudly when one is missing. */
async function preconditions() {
  if (process.platform !== 'win32') {
    skip('this bridge only exists on Windows — elsewhere creds-mcp reaches the window directly');
  }
  if ((await run(WSL_EXE, ['-l', '-q'])).code !== 0) {
    skip('no WSL on this machine');
  }
  if (!fs.existsSync(path.join(windowsBuild('src_mcp'), 'creds-mcp.exe'))) {
    skip('the Windows MCP server is not built', 'run: dotnet build src_mcp/src/CredsMcp.csproj');
  }
  const tools = await wslStep({}, 'tools', ['dotnet', 'node', 'python3']);
  if (tools.stdout.includes('missing')) {
    skip(`inside WSL: ${tools.stdout.trim()}`, 'install it in the distribution, then re-run');
  }
}

/** This run's copies: the Windows binary into the Windows run directory, the Linux build into the Linux one. */
async function prepareBinaries() {
  dirs = await runDirectories();
  windowsMcp = copyWindowsBinary(dirs, { kind: 'mcp', project: 'src_mcp', exe: 'creds-mcp.exe' });
  linuxMcp = await linuxBinary(dirs, {
    kind: 'mcp',
    project: 'src_mcp',
    projects: ['src_mcp', 'src_broker_client', 'src_service_defaults'],
    exe: 'creds-mcp',
  });
  if (linuxMcp === undefined) {
    skip('the Linux creds-mcp could not be built inside WSL');
  }
  console.log(`      run directories: ${dirs.windows} and ${dirs.linux}`);
}

/** A real window on Windows, sharing one entry — what writes the announcement the binary finds. */
async function startWindow() {
  const { CredsAgentServer } = require(path.join(OUT, 'credsAgentServer.js'));
  const { UseActionRegistry } = require(path.join(OUT, 'useActions.js'));

  // Under the run directory, so the one removal at the end — `finishRun`, which also runs after a failure — is
  // the only removal there is (own review of E5).
  const storageDir = path.join(dirs.windows, 'window');
  fs.mkdirSync(storageDir, { recursive: true });
  const created = [];
  const actions = new UseActionRegistry();
  actions.register({
    kind: 'db',
    action: 'query',
    verb: 'run a query on',
    validate: () => ({ ok: true }),
    summarize: (body) => String(body.query ?? ''),
    describeOutcome: () => 'done',
    run: (_ctx, body) => Promise.resolve({ status: 200, body: { exitCode: 0, rows: 1, stdout: String(body.query ?? '') } }),
  });

  // Named, since 2026-09-11: a key that is not a hook is refused at construction.
  const server = new CredsAgentServer(actions, () => {}, {
    storageDir,
    maskEntriesFor: () => Promise.resolve([{ value: WINDOW_SECRET, label: 'DB_PASSWORD' }]),
    listMcpEntries: () => Promise.resolve(ENTRIES),
    resolveMcpUse: (id, action) =>
      id === 'e-wsl-1' && action !== 'delete'
        ? { kind: 'usable', target: { accountId: 'a-1', entityId: id, entityName: 'orders-db', kind: 'db' } }
        : { kind: 'closed', entityName: 'orders-db', needed: 'delete' },
    moveToTrash: () => Promise.resolve(false),
    mcpCreate: {
      // One folder open to creation, so the agent names none and could not choose another.
      choose: (body) => ({
        ok: true,
        target: { accountId: 'a-1', entityId: 'f-1', entityName: 'Servers', kind: 'ssh' },
        summary: `${String(body.name)} (ssh) in "Servers"`,
        withSecret: typeof body.secret === 'string' && body.secret.length > 0,
      }),
      // The folder's PIN step (D-B): this stand-in folder asks for none.
      settle: () => Promise.resolve({ ok: true }),
      make: (_decision, body) => {
        // The window generates when the agent named a kind instead of a value — the path this
        // whole product prefers, and the one the manual check exercises.
        const secret = typeof body.secret === 'string' && body.secret.length > 0 ? String(body.secret) : 'GENERATED-BY-THE-WINDOW-7c31';
        created.push({ name: String(body.name), secret, supplied: body.secret !== undefined });
        return Promise.resolve({ id: 'new-wsl-1', name: String(body.name) });
      },
    },
  });
  // Sharing is what starts the broker, which is what writes the announcement the binary finds.
  await server.share('a-1', 'e-wsl-1', 'orders-db', 'db');
  const endpointDir = path.join(storageDir, 'endpoints');
  check('the window announced itself on Windows', fs.existsSync(endpointDir) && fs.readdirSync(endpointDir).length > 0);
  return { server, endpointDir, created };
}

/** After the steps that end a session by killing its `wsl.exe` (SIGHUP to the wrapper): nothing of the run is left. */
async function nothingLeftAfter(what, windowsHalves, linuxSide) {
  const left = await windowsHalves.goneWithin(GONE_WITHIN_MS);
  check(`after ${what}, 0 Windows creds-mcp.exe of this run within 5 s`, left.length === 0, windowsHalves.describe(left));
  const linuxLeft = await linuxSide.goneWithin(GONE_WITHIN_MS);
  check(`and nothing of this run inside WSL`, linuxLeft.length === 0, linuxSide.describe(linuxLeft));
}

async function readsTheVault(env) {
  const listed = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'creds_list', arguments: {} } },
  ]);

  const init = listed.byId.get(1);
  check('a binary inside WSL answers initialize', init?.result?.serverInfo?.name === 'creds-for-devs', `${JSON.stringify(init)} ${listed.err.trim()}`);
  const tools = listed.byId.get(2)?.result?.tools ?? [];
  check('the tool catalog crosses the boundary intact', tools.some((t) => t.name === 'creds_list'), JSON.stringify(tools.map((t) => t.name)));

  const text = listed.byId.get(3)?.result?.content?.[0]?.text ?? '';
  let entries = [];
  try {
    entries = JSON.parse(text);
  } catch {
    /* reported below */
  }
  check(
    'and it reads a vault from a window running on Windows — the bridge, end to end',
    Array.isArray(entries) && entries.length === 1 && entries[0].id === 'e-wsl-1',
    `${text.slice(0, 240)} ${listed.err.trim()}`,
  );
  check('the fields survive the crossing', entries[0]?.host === 'db-01.example.internal', JSON.stringify(entries[0]?.host));
  check('no secret appears in anything the agent received', !listed.out.includes(WINDOW_SECRET));
  const stray = listed.out.split('\n').filter((l) => l.trim() !== '' && !l.includes('"jsonrpc"'));
  check('nothing but JSON-RPC reaches stdout, through two processes', stray.length === 0, JSON.stringify(stray.slice(0, 2)));
}

async function createsThroughTheWindow(env, created) {
  consent.answers = ['Allow'];
  consent.asked = 0;
  created.length = 0;
  const made = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'creds_create', arguments: { name: 'wsl-login', kind: 'credential', user: 'svc-wsl', secretKind: 'password' } },
    },
  ]);
  const madeText = made.byId.get(4)?.result?.content?.[0]?.text ?? '';
  check('an agent in WSL can have the window store a credential', madeText.includes('"created":true'), `${madeText.slice(0, 240)} ${made.err.trim()}`);
  check('the human was asked, on Windows', consent.asked === 1, `asked ${consent.asked}`);
  check('the window generated the value rather than taking one', created.length === 1 && created[0].supplied === false, JSON.stringify(created.map((c) => c.name)));
  check('and the generated secret never reached the agent', created.length === 1 && !made.out.includes(created[0].secret), 'the generated value crossed back through the pump');
}

async function staysOnThisSide(endpointDir) {
  // Pointed at a binary that does not exist: if help were relayed, this would fail instead of
  // printing. It is the cheap proof of a decision that is otherwise invisible.
  const nowhere = bridgeEnv(endpointDir, String.raw`C:\nowhere\creds-mcp.exe`);
  const help = await wslStep(nowhere, 'exec', [linuxMcp, '--help']);
  check('--help is answered inside WSL without launching a Windows process', help.stdout.includes('creds_list'), help.stdout.slice(0, 160));

  const missing = await wslStep(nowhere, 'exec', [linuxMcp], { input: '{}\n' });
  check(
    'a Windows binary that is not there names the variable that fixes it',
    missing.stdout.includes('CREDS_MCP_WINDOWS_BINARY') || missing.stderr.includes('CREDS_MCP_WINDOWS_BINARY'),
    `${missing.stdout.trim()} ${missing.stderr.trim()}`.slice(0, 240),
  );
  check('and exits with the code reserved for a missing tool, not a crash', missing.code === 99, `exit ${missing.code}`);
}

/** The client's JSON events, one per line; `next(wanted, ms)` answers the first that matches, or a timeout. */
function events(child) {
  const seen = [];
  const waiters = [];
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    seen.push(event);
    for (const waiter of waiters.filter((w) => w.wanted(event))) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  });
  return {
    next(wanted, ms) {
      const already = seen.find((event) => wanted(event));
      if (already !== undefined) {
        return Promise.resolve(already);
      }
      return new Promise((resolve) => {
        waiters.push({ wanted, resolve });
        setTimeout(() => resolve({ event: 'timeout', after: ms }), ms);
      });
    },
  };
}

const isAny = (...names) => (event) => names.includes(event.event);

/** How each ending must leave the wrapper: 128 + n for a handled signal, 0 for end-of-stream, killed for SIGKILL. */
const ENDINGS = [
  { word: 'SIGINT', exit: { code: 130, signal: null } },
  { word: 'SIGTERM', exit: { code: 143, signal: null } },
  { word: 'SIGHUP', exit: { code: 129, signal: null } },
  { word: 'eof', exit: { code: 0, signal: null } },
  { word: 'SIGKILL', exit: { code: null, signal: 'SIGKILL' } },
];

const exitWords = (exit) => (exit.signal === null ? `with exit code ${exit.code}` : `killed by ${exit.signal}`);

/**
 * One Claude-shaped session ended by `word`: the Windows half must be alive before the end (the positive
 * control — a watch that sees nothing passes every time) and gone within 5 s after it.
 */
async function endedBy({ word, exit }, endpointDir, windowsHalves, linuxSide) {
  // The positive control is about THIS session's process: a baseline right before it starts, exactly one new pid after.
  const already = new Set(await windowsHalves.survivors());
  const client = spawn(WSL_EXE, stepArgv(bridgeEnv(endpointDir), 'exec', ['node', asLinux(CLIENT), asLinux(FIXTURE), '--', linuxMcp]));
  let stderr = '';
  client.stderr.on('data', (d) => {
    stderr += d;
  });
  const said = events(client);
  try {
    const ready = await said.next(isAny('ready', 'failed', 'ended'), 90_000);
    check(`${word}: the captured Claude Code session is answered, its listen held open`, ready.event === 'ready', `${JSON.stringify(ready)} ${stderr.trim().slice(-400)}`);
    const alive = await windowsHalves.seenWithin(already.size + 1, 10_000);
    const fresh = alive.filter((pid) => !already.has(pid));
    check(`${word}: exactly one new Windows creds-mcp.exe of this run serves it (the positive control)`, fresh.length === 1, `new ${JSON.stringify(fresh)}, already there ${JSON.stringify([...already])}`);

    client.stdin.write(`${word}\n`);
    const ended = await said.next(isAny('ended', 'failed'), 30_000);
    check(
      `${word}: the wrapper ends ${exitWords(exit)}`,
      ended.event === 'ended' && ended.code === exit.code && ended.signal === exit.signal,
      JSON.stringify(ended),
    );
    const since = Date.now();
    const left = await windowsHalves.goneWithin(GONE_WITHIN_MS);
    check(`${word}: 0 Windows survivors within 5 s`, left.length === 0, windowsHalves.describe(left));
    console.log(`      ${word}: the wrapper ended ${ended.ms} ms after the word; its Windows half was gone ${Date.now() - since} ms after that`);
    const linuxLeft = await linuxSide.goneWithin(GONE_WITHIN_MS);
    check(`${word}: and nothing of this run is left inside WSL`, linuxLeft.length === 0, linuxSide.describe(linuxLeft));
  } finally {
    // Closing its stdin is how the client leaves (it kills the wrapper first). A client that does not leave within
    // 5 s — a wsl.exe that hung before it ever read stdin — is killed, so the next ending starts beside no
    // stale session (CodeRabbit on #218); the wrapper, if any, is the Linux sweep's by its path.
    client.stdin.end();
    await new Promise((resolve) => {
      if (client.exitCode !== null || client.signalCode !== null) {
        resolve();
        return;
      }
      const bound = setTimeout(() => {
        client.kill();
        resolve();
      }, 5_000);
      client.once('exit', () => {
        clearTimeout(bound);
        resolve();
      });
    });
  }
}

async function main() {
  await preconditions();
  await prepareBinaries();
  // Linux side first: the sweep walks them in this order, and a wrapper still alive could start one more Windows half.
  const linuxSide = await started(watchLinuxPids(dirs.linux, 'creds-mcp processes inside WSL'));
  const windowsHalves = await started(watchWindowsPids('creds-mcp.exe', path.dirname(windowsMcp), 'Windows creds-mcp.exe'));
  watches.push(linuxSide, windowsHalves);

  const { server, endpointDir, created } = await startWindow();
  const env = bridgeEnv(endpointDir);
  await readsTheVault(env);
  await createsThroughTheWindow(env, created);
  await nothingLeftAfter('the vault read and the create (their wsl.exe killed, SIGHUP to the wrapper)', windowsHalves, linuxSide);
  await staysOnThisSide(endpointDir);

  // ---- no half outlives its client: five endings of a Claude-shaped session ------------
  for (const ending of ENDINGS) {
    await endedBy(ending, endpointDir, windowsHalves, linuxSide);
  }

  // ---- nothing THIS RUN started is left running, on either side -------------------------
  const leftovers = [...(await windowsHalves.survivors()), ...(await linuxSide.survivors())];
  check('no half of the bridge outlives the client', leftovers.length === 0, `left: ${leftovers.join(', ')}`);

  server.dispose();
}

// The sweep runs whatever happened — a run that failed partway must not hand its processes to the
// next one — and then the Windows run directory is removed by its exact name.
runAndSweep({
  main,
  strays: () => watches,
  failures: () => failures,
  finish: () => (dirs === undefined ? Promise.resolve() : finishRun(dirs)),
  label: 'WSL MCP',
});
