// Integration test: the REAL Linux `creds-mcp` INSIDE WSL, answering from a window on Windows.
//
//   npm run compile && node scripts/creds-mcp-wsl-itest.cjs
//
// What it proves that nothing else can. `creds-mcp-itest.cjs` drives the Windows binary against a
// Windows broker: both halves are on one side of the boundary, so it says nothing about the case
// this bridge exists for — an MCP client running inside a distribution, where 127.0.0.1 is the
// virtual machine's loopback and the announcement files are on a disk this kernel only sees as
// /mnt. The unit tests in CredsMcp.Tests cover the pump's two endings on streams; whether a real
// Linux process reaches a real Windows window is a fact about another process table, and the only
// honest way to assert it is to do it.
//
// Skipped LOUDLY, never silently: no Windows, no WSL, no Windows binary, no .NET SDK inside the
// distribution, or a Linux build that would not build — each prints the command that fixes it.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const Module = require('module');

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
const REPO = path.join(__dirname, '..', '..');
const WINDOWS_MCP = path.join(REPO, 'src_mcp', 'src', 'bin', 'Debug', 'net10.0', 'creds-mcp.exe');
const LINUX_BUILD = '/tmp/creds-mcp-wsl-itest-build';
const LINUX_MCP = `${LINUX_BUILD}/src_mcp/src/bin/Debug/net10.0/creds-mcp`;

/** A Windows path as the distribution sees it. */
const asLinux = (winPath) =>
  winPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');

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
    execFile(exe, args, { timeout: 300_000, ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** One command inside the default distribution, as a login shell so PATH is a person's PATH. */
const wsl = (script) => run('wsl.exe', ['-e', 'bash', '-lc', script]);

/**
 * The exports every step needs inside the distribution.
 *
 * <p>`WSLENV` is the load-bearing line. Environment variables do NOT cross from WSL into a
 * Windows child — measured 2026-08-26, including from .NET's own `ProcessStartInfo.Environment` —
 * so without naming `CREDS_ENDPOINT_DIR` here the Windows half would read the real VS Code
 * endpoint directory instead of this test's, and answer about somebody's actual vault. `/p` asks
 * WSL to translate the path on the way through.</p>
 */
function wslEnv(endpointDir, windowsBinary = WINDOWS_MCP) {
  return [
    `export CREDS_ENDPOINT_DIR='${asLinux(endpointDir)}'`,
    'export WSLENV=CREDS_ENDPOINT_DIR/p',
    `export CREDS_MCP_WINDOWS_BINARY='${asLinux(windowsBinary)}'`,
  ].join('; ');
}

/** Build the Linux binary from a clean copy: the repo's own obj/ holds a Windows build's. */
async function buildLinuxMcp() {
  const built = await wsl(`test -x ${LINUX_MCP} && echo yes`);
  if (built.stdout.includes('yes')) {
    return true;
  }
  console.log('      building the Linux creds-mcp inside WSL (once, a minute or so)…');
  const repo = asLinux(REPO);
  const build = await wsl(
    // Both projects and BOTH props files: central package management means the MCP SDK has no
    // version of its own, so a copy without Directory.Packages.props fails to restore — and the
    // failure would present as this test SKIPPING, which is a test quietly not running.
    `rm -rf ${LINUX_BUILD} && mkdir -p ${LINUX_BUILD}/src_mcp/src ${LINUX_BUILD}/src_broker_client/src ${LINUX_BUILD}/contract && ` +
      `cp ${repo}/src_mcp/src/*.cs ${repo}/src_mcp/src/*.csproj ${LINUX_BUILD}/src_mcp/src/ && ` +
      `cp ${repo}/src_broker_client/src/*.cs ${repo}/src_broker_client/src/*.csproj ${LINUX_BUILD}/src_broker_client/src/ && ` +
      `cp ${repo}/contract/broker-v1.json ${LINUX_BUILD}/contract/ && ` +
      `cp ${repo}/Directory.Build.props ${repo}/Directory.Packages.props ${repo}/nuget.config ${LINUX_BUILD}/ && ` +
      // No AOT: the distribution has the SDK but not a native linker, and the code under test is
      // identical either way — only the packaging differs.
      `cd ${LINUX_BUILD}/src_mcp/src && dotnet build -c Debug -p:PublishAot=false 2>&1 | tail -5`,
  );
  const ok = await wsl(`test -x ${LINUX_MCP} && echo yes`);
  if (!ok.stdout.includes('yes')) {
    console.log(build.stdout.trim());
  }
  return ok.stdout.includes('yes');
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
    const child = spawn('wsl.exe', ['-e', 'bash', '-lc', `${env}; exec ${LINUX_MCP}`]);
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
        resolve({ byId, out, err });
      }, settleMs);
    };
    next();
  });
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

async function main() {
  if (process.platform !== 'win32') {
    skip('this bridge only exists on Windows — elsewhere creds-mcp reaches the window directly');
  }
  const distros = await run('wsl.exe', ['-l', '-q']);
  if (distros.code !== 0) {
    skip('no WSL on this machine');
  }
  if (!fs.existsSync(WINDOWS_MCP)) {
    skip('the Windows MCP server is not built', 'run: dotnet build src_mcp/src/CredsMcp.csproj');
  }
  const sdk = await wsl('command -v dotnet >/dev/null && echo yes');
  if (!sdk.stdout.includes('yes')) {
    skip('no .NET SDK inside WSL', 'install it in the distribution, then re-run');
  }
  if (!(await buildLinuxMcp())) {
    skip('the Linux creds-mcp could not be built inside WSL');
  }

  // ---- a real window on Windows ---------------------------------------------
  const { CredsAgentServer } = require(path.join(OUT, 'credsAgentServer.js'));
  const { UseActionRegistry } = require(path.join(OUT, 'useActions.js'));

  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-mcp-wsl-itest-'));
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

  const server = new CredsAgentServer(
    actions,
    () => {},
    storageDir,
    () => Promise.resolve([{ value: WINDOW_SECRET, label: 'DB_PASSWORD' }]),
    undefined,
    undefined,
    undefined,
    () => Promise.resolve(ENTRIES),
    // `visibleConfig` — none here. Spelled out because these arguments are positional and adding
    // one to the constructor shifts every lambda below it; that is exactly how this script's
    // Windows sibling spent a month reporting "no window answered" for calls the bridge carried
    // perfectly well.
    undefined,
    (id, action) =>
      id === 'e-wsl-1' && action !== 'delete'
        ? { kind: 'usable', target: { accountId: 'a-1', entityId: id, entityName: 'orders-db', kind: 'db' } }
        : { kind: 'closed', entityName: 'orders-db', needed: 'delete' },
    () => Promise.resolve(false),
    {
      // One folder open to creation, so the agent names none and could not choose another.
      choose: (body) => ({
        ok: true,
        target: { accountId: 'a-1', entityId: 'f-1', entityName: 'Servers', kind: 'ssh' },
        summary: `${String(body.name)} (ssh) in "Servers"`,
        withSecret: typeof body.secret === 'string' && body.secret.length > 0,
      }),
      make: (_decision, body) => {
        // The window generates when the agent named a kind instead of a value — the path this
        // whole product prefers, and the one the manual check exercises.
        const secret = typeof body.secret === 'string' && body.secret.length > 0
          ? String(body.secret)
          : 'GENERATED-BY-THE-WINDOW-7c31';
        created.push({ name: String(body.name), secret, supplied: body.secret !== undefined });
        return Promise.resolve({ id: 'new-wsl-1', name: String(body.name) });
      },
    },
  );
  // Sharing is what starts the broker, which is what writes the announcement the binary finds.
  await server.share('a-1', 'e-wsl-1', 'orders-db', 'db');

  const endpointDir = path.join(storageDir, 'endpoints');
  check('the window announced itself on Windows', fs.existsSync(endpointDir) && fs.readdirSync(endpointDir).length > 0);

  const env = wslEnv(endpointDir);

  // ---- the whole point -------------------------------------------------------
  const listed = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'creds_list', arguments: {} } },
  ]);

  const init = listed.byId.get(1);
  check(
    'a binary inside WSL answers initialize',
    init?.result?.serverInfo?.name === 'creds-for-devs',
    `${JSON.stringify(init)} ${listed.err.trim()}`,
  );
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

  // ---- creating, with the window making the secret ---------------------------
  consent.answers = ['Allow'];
  consent.asked = 0;
  created.length = 0;
  const made = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'creds_create',
        arguments: { name: 'wsl-login', kind: 'credential', user: 'svc-wsl', secretKind: 'password' },
      },
    },
  ]);
  const madeText = made.byId.get(4)?.result?.content?.[0]?.text ?? '';
  check('an agent in WSL can have the window store a credential', madeText.includes('"created":true'), `${madeText.slice(0, 240)} ${made.err.trim()}`);
  check('the human was asked, on Windows', consent.asked === 1, `asked ${consent.asked}`);
  check('the window generated the value rather than taking one', created.length === 1 && created[0].supplied === false, JSON.stringify(created.map((c) => c.name)));
  check(
    'and the generated secret never reached the agent',
    created.length === 1 && !made.out.includes(created[0].secret),
    'the generated value crossed back through the pump',
  );

  // ---- --help stays on this side --------------------------------------------
  // Pointed at a binary that does not exist: if help were relayed, this would fail instead of
  // printing. It is the cheap proof of a decision that is otherwise invisible.
  const help = await wsl(`${wslEnv(endpointDir, 'C:\\nowhere\\creds-mcp.exe')}; ${LINUX_MCP} --help`);
  check('--help is answered inside WSL without launching a Windows process', help.stdout.includes('creds_list'), help.stdout.slice(0, 160));

  // ---- a missing Windows binary is a sentence, not a stack trace --------------
  const missing = await wsl(
    `${wslEnv(endpointDir, 'C:\\nowhere\\creds-mcp.exe')}; echo '{}' | ${LINUX_MCP}; echo "exit=$?"`,
  );
  check(
    'a Windows binary that is not there names the variable that fixes it',
    missing.stdout.includes('CREDS_MCP_WINDOWS_BINARY') || missing.stderr.includes('CREDS_MCP_WINDOWS_BINARY'),
    `${missing.stdout.trim()} ${missing.stderr.trim()}`.slice(0, 240),
  );
  check(
    'and exits with the code reserved for a missing tool, not a crash',
    missing.stdout.includes('exit=99'),
    missing.stdout.trim().slice(-40),
  );

  // ---- nothing is left running ----------------------------------------------
  const leftovers = await wsl(`ps -eo args | grep '[c]reds-mcp' | head -3`);
  check('no half of the bridge outlives the client', leftovers.stdout.trim().length === 0, leftovers.stdout.trim());

  server.dispose();
  fs.rmSync(storageDir, { recursive: true, force: true });
  console.log(failures === 0 ? '\nall WSL MCP checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
