// Integration test: the REAL .NET `creds-mcp` binary against the REAL broker, over real stdio.
//
//   npm run compile && node scripts/creds-mcp-itest.cjs
//
// What it proves that nothing else does. The unit tests on each side assert what their own half
// answers; neither says the two can talk. Three seams meet here and only here:
//
//   1. JSON-RPC over stdio — the handshake, and the tool list an MCP client would show.
//   2. Discovery — the binary finding a live window through its announcement file and the
//      unauthenticated health probe, exactly as `creds` does.
//   3. The shape — the entries the broker builds, deserialized by a C# record written by hand
//      against a TypeScript interface written by hand. Every field either side renamed silently
//      lands here as a missing value.
//
// Stdin is held OPEN until the answers arrive. This is not politeness: closing it makes the
// server shut down mid-flight and the replies never appear, which cost an hour on 2026-08-27
// while it looked exactly like a broken handshake.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const Module = require('module');

/** Consent answers the fake window gives, in order, and how often it was asked. */
const consent = { answers: ['Allow'], asked: 0 };
global.__CREDS_MCP_CONSENT__ = consent;

// ---- vscode stub -----------------------------------------------------------
// The modal is real here: an MCP use call raises one, and whether it does — and how often — is
// half of what the level-2 checks below are about.
const stub = path.join(os.tmpdir(), 'creds-mcp-itest-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `module.exports = {
     window: {
       showWarningMessage: () => {
         const c = global.__CREDS_MCP_CONSENT__;
         c.asked += 1;
         return Promise.resolve(c.answers.shift());
       },
       showInformationMessage: () => Promise.resolve(undefined),
       showErrorMessage: () => Promise.resolve(undefined),
       createOutputChannel: () => ({ appendLine(){}, dispose(){} }),
     },
     workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
     Uri: { file: (p) => ({ fsPath: p }) },
   };`,
);
const orig = Module._resolveFilename;
Module._resolveFilename = (req, ...a) => (req === 'vscode' ? stub : orig.call(Module, req, ...a));

const OUT = path.join(__dirname, '..', 'out');
const { CredsAgentServer } = require(path.join(OUT, 'credsAgentServer.js'));
const { UseActionRegistry } = require(path.join(OUT, 'useActions.js'));



let fails = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  if (!ok) fails += 1;
};

const EXE = path.join(
  __dirname,
  '..',
  '..',
  'src_mcp',
  'src',
  'bin',
  'Debug',
  'net10.0',
  process.platform === 'win32' ? 'creds-mcp.exe' : 'creds-mcp',
);

const SECRET = 'hunter2-SUPER-SECRET-VALUE';

/** What a window would answer for a vault with one entry opened to agents. */
const ENTRIES = [
  {
    id: 'e-1',
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
    hasNotes: true,
    hasTotp: false,
    dependsOn: ['office vpn'],
    can: { use: true, edit: false, create: false, delete: false },
  },
];

/**
 * Drive the server the way an MCP client does: write requests, hold stdin open, collect replies.
 *
 * <p>Replies are matched by id rather than by order, because a server is free to answer out of
 * order and a test that assumed otherwise would fail for the wrong reason one day.</p>
 */
function speak(env, requests, settleMs = 3000) {
  return new Promise((resolve) => {
    const child = spawn(EXE, [], { env: { ...process.env, CREDS_RELAYED_FROM_WSL: '1', ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    let i = 0;
    const next = () => {
      if (i < requests.length) {
        child.stdin.write(`${JSON.stringify(requests[i])}\n`);
        i += 1;
        setTimeout(next, 150);
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
            /* a partial line while the process was killed is not a failure */
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
      clientInfo: { name: 'creds-mcp-itest', version: '1' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

(async () => {
  if (!fs.existsSync(EXE)) {
    console.log(`SKIP  the MCP server is not built at ${EXE}`);
    console.log('      run: dotnet build src_mcp/src/CredsMcp.csproj');
    return;
  }

  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-mcp-itest-'));
  // A stub action: no ssh, no network — what is under test is the wire from the tool to the
  // broker and the gate in front of it, not what an action does once it is reached.
  const actions = new UseActionRegistry();
  actions.register({
    kind: 'db',
    action: 'query',
    verb: 'run a query on',
    validate: () => ({ ok: true }),
    summarize: (body) => String(body.query ?? ''),
    describeOutcome: () => 'done',
    run: (_ctx, body) => Promise.resolve({ status: 200, body: { rows: 1, echoed: body.query } }),
  });

  const server = new CredsAgentServer(
    actions,
    () => {},
    storageDir,
    undefined,
    undefined,
    undefined,
    undefined,
    () => Promise.resolve(ENTRIES),
    // The gate the whole route exists for: `e-1` may be used, `e-shut` exists and may not.
    (id) => {
      if (id === 'e-1') {
        return { kind: 'usable', target: { accountId: 'a-1', entityId: 'e-1', entityName: 'orders-db', kind: 'db' } };
      }
      return id === 'e-shut' ? { kind: 'closed', entityName: 'prod-db' } : undefined;
    },
  );
  // Starting the broker is what writes the announcement the binary discovers. `share` is the
  // only way in, and the grant it mints is never used here — the route under test needs none.
  await server.share('a-1', 'e-1', 'orders-db', 'db');

  const endpointDir = path.join(storageDir, 'endpoints');
  check('the window announced itself', fs.existsSync(endpointDir) && fs.readdirSync(endpointDir).length > 0);

  const env = { CREDS_ENDPOINT_DIR: endpointDir };

  // ---- the handshake and the catalog --------------------------------------
  const listed = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const init = listed.byId.get(1);
  check('the server answers initialize', init?.result?.serverInfo?.name === 'creds-for-devs', JSON.stringify(init));
  check(
    'it tells the client what it is, before any tool is called',
    typeof init?.result?.instructions === 'string' && init.result.instructions.includes('never read a secret'),
  );

  const tools = listed.byId.get(2)?.result?.tools ?? [];
  check('it offers creds_list', tools.some((t) => t.name === 'creds_list'), JSON.stringify(tools.map((t) => t.name)));
  const list = tools.find((t) => t.name === 'creds_list');
  check('the tool declares itself read-only, so a client may skip a confirmation honestly', list?.annotations?.readOnlyHint === true, JSON.stringify(list?.annotations));

  // The protocol channel must carry nothing but the protocol. A log line on stdout corrupts the
  // stream, and the failure reads as a protocol bug — which is why the SDK's hosted default,
  // measured on 2026-08-27, was not used.
  const strayStdout = listed.out.split('\n').filter((l) => l.trim() !== '' && !l.includes('"jsonrpc"'));
  check('nothing but JSON-RPC is written to stdout', strayStdout.length === 0, JSON.stringify(strayStdout.slice(0, 2)));

  // ---- the call ------------------------------------------------------------
  const called = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'creds_list', arguments: {} } },
  ]);
  const answer = called.byId.get(3);
  const text = answer?.result?.content?.[0]?.text ?? '';
  check('the tool answers', typeof text === 'string' && text.length > 0, JSON.stringify(answer));

  let entries = [];
  try {
    entries = JSON.parse(text);
  } catch {
    /* reported by the checks below */
  }
  check('it found the window and read its entries', Array.isArray(entries) && entries.length === 1, text.slice(0, 200));

  const entry = entries[0] ?? {};
  // Field by field, because every one of these crossed a hand-written TypeScript interface and a
  // hand-written C# record. A rename on either side arrives here as undefined, not as an error.
  check('the name survives the crossing', entry.name === 'orders-db', JSON.stringify(entry.name));
  check('the kind survives', entry.kind === 'db');
  check('the folder survives', entry.folder === 'Databases');
  check('the host survives', entry.host === 'db-01.example.internal');
  check('the port survives as a number', entry.port === 3306, JSON.stringify(entry.port));
  check('the connection string survives', typeof entry.connectionString === 'string' && entry.connectionString.includes('db-01'));
  check('hasPassword survives as a boolean', entry.hasPassword === true);
  check('the dependency name survives', Array.isArray(entry.dependsOn) && entry.dependsOn[0] === 'office vpn', JSON.stringify(entry.dependsOn));
  check('the capabilities survive', entry.can && entry.can.use === true && entry.can.delete === false, JSON.stringify(entry.can));

  check('no secret appears anywhere in what the agent received', !called.out.includes(SECRET));

  // ---- no window -----------------------------------------------------------
  // The failure that will actually happen. "No window is open" and "nothing has been opened to
  // you" call for opposite next moves, so the answer must be able to say which.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-mcp-itest-empty-'));
  const alone = await speak({ CREDS_ENDPOINT_DIR: empty }, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'creds_list', arguments: {} } },
  ]);
  const aloneText = alone.byId.get(4)?.result?.content?.[0]?.text ?? '';
  check(
    'with no window it says so, in a sentence a person can act on',
    aloneText.includes('No CredsForDevs window answered') && aloneText.includes('unlock the vault'),
    aloneText.slice(0, 200),
  );

  // ---- level 2: using an entry ---------------------------------------------
  const tools2 = (await speak(env, [...HANDSHAKE, { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }]))
    .byId.get(5)?.result?.tools ?? [];
  const query = tools2.find((t) => t.name === 'creds_query');
  check('it offers the action tools too', query !== undefined, JSON.stringify(tools2.map((t) => t.name)));
  check(
    'an action tool declares itself NOT read-only, because it runs something real',
    query?.annotations?.readOnlyHint !== true,
    JSON.stringify(query?.annotations),
  );
  check(
    'its schema asks for the entry id and the query, by the broker own names',
    Object.keys(query?.inputSchema?.properties ?? {}).sort().join(',') === 'entry,query',
    JSON.stringify(query?.inputSchema?.properties),
  );

  consent.answers = ['Allow'];
  consent.asked = 0;
  const used = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-1', query: 'select 1' } } },
  ]);
  const usedText = used.byId.get(6)?.result?.content?.[0]?.text ?? '';
  check('an open entry can be used, end to end', usedText.includes('"rows":1'), usedText.slice(0, 200));
  check('and the human was asked, exactly once', consent.asked === 1, `asked ${consent.asked}`);

  consent.answers = ['Allow'];
  consent.asked = 0;
  const shut = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-shut', query: 'select 1' } } },
  ]);
  const shutText = shut.byId.get(7)?.result?.content?.[0]?.text ?? '';
  check(
    'a closed entry is refused, in words that name the switch',
    shutText.includes('Usable by agents') && shutText.includes('prod-db'),
    shutText.slice(0, 240),
  );
  check('and nobody was asked about it', consent.asked === 0, `asked ${consent.asked}`);

  consent.answers = ['Deny'];
  consent.asked = 0;
  const denied = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-1', query: 'select 1' } } },
  ]);
  const deniedText = denied.byId.get(8)?.result?.content?.[0]?.text ?? '';
  check(
    'a Deny still refuses - the switch is a precondition, not a decision',
    deniedText.includes('"error"') && !deniedText.includes('"rows"'),
    deniedText.slice(0, 240),
  );

  server.dispose();
  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
