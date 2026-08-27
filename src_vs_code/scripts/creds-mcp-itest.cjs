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
const { rotateAction } = require(path.join(OUT, 'rotateAction.js'));



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
  /** Every statement the far side was actually handed — the proof that substitution happened. */
  const ranQueries = [];
  /** Entity ids an agent moved to the Trash. */
  const trashed = [];
  /** Entries an agent created, with the secret it supplied. */
  const created = [];
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
    run: (_ctx, body) => {
      ranQueries.push(String(body.query ?? ''));
      return Promise.resolve({ status: 200, body: { exitCode: 0, rows: 1, stdout: 'ALTER ok' } });
    },
  });

  // Its rotating twin, wrapping the same stub — which is the whole design: one implementation of
  // "reach the far side", and the rotation adds the generate before it and the store after.
  const rotated = { recorded: 0, stored: [] };
  actions.register(
    rotateAction(actions.resolve('db', 'query'), 'query', {
      generate: () => 'GENERATED-9f2c41ab',
      entity: () => ({ id: 'e-1', name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }),
      current: () => Promise.resolve('mysql://app:old@db-01.example.internal:3306/orders'),
      snapshot: () => Promise.resolve({ at: 1, name: 'orders-db', details: {}, secrets: {} }),
      record: () => {
        rotated.recorded += 1;
        return Promise.resolve();
      },
      store: (_ctx, slot, value) => {
        rotated.stored.push({ slot, value });
        return Promise.resolve();
      },
    }),
  );

  const server = new CredsAgentServer(
    actions,
    () => {},
    storageDir,
    undefined,
    undefined,
    undefined,
    undefined,
    () => Promise.resolve(ENTRIES),
    // The gate the whole route exists for, and it is PER ACTION: `e-1` may be used, and may be
    // rotated only because this fixture says its `edit` switch is on too; `e-use-only` may be
    // used and NOT rotated, which is the rung the ladder exists to keep apart.
    (id, action) => {
      const target = (name) => ({ accountId: 'a-1', entityId: id, entityName: name, kind: 'db' });
      if (id === 'e-1') {
        // Used and rotated, NOT deleted: an entry whose `edit` switch is on and whose delete
        // switch is off. The pair `e-1`/`e-bin` is what makes the ladder checks below real
        // rather than a fixture agreeing with itself.
        return action === 'delete'
          ? { kind: 'closed', entityName: 'orders-db', needed: 'delete' }
          : { kind: 'usable', target: target('orders-db') };
      }
      if (id === 'e-use-only') {
        return action === 'rotate'
          ? { kind: 'closed', entityName: 'staging-db', needed: 'edit' }
          : { kind: 'usable', target: target('staging-db') };
      }
      if (id === 'e-shut') {
        return { kind: 'closed', entityName: 'prod-db', needed: 'use' };
      }
      // Deletable only because this fixture says so; `e-1` is not, which is the pair the ladder
      // check below rests on.
      return id === 'e-bin' && action === 'delete'
        ? { kind: 'usable', target: target('scratch-db') }
        : undefined;
    },
    // Moving to the Trash, recorded. Never `deleteNodeRecursive` — an agent has no route to it.
    (_accountId, entityId) => {
      trashed.push(entityId);
      return Promise.resolve(true);
    },
    // One folder open to creation, so the agent names none — and could not choose another.
    {
      choose: (body) => ({
        ok: true,
        target: { accountId: 'a-1', entityId: 'f-1', entityName: 'Servers', kind: 'ssh' },
        summary: `${String(body.name)} (ssh) in "Servers"`,
        withSecret: typeof body.secret === 'string' && body.secret.length > 0,
      }),
      make: (_decision, body) => {
        created.push({ name: String(body.name), secret: String(body.secret ?? '') });
        return Promise.resolve({ id: 'new-1', name: String(body.name) });
      },
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

  // ---- level 3: rotation ---------------------------------------------------
  // What the far side receives is what proves it: the agent wrote a placeholder and the window
  // must have substituted a real value into the statement before running it.
  const rotate = tools2.find((t) => t.name === 'creds_rotate');
  check('it offers creds_rotate', rotate !== undefined, JSON.stringify(tools2.map((t) => t.name)));
  check(
    'the rotate schema asks for a statement, not a value',
    Object.keys(rotate?.inputSchema?.properties ?? {}).sort().join(',') === 'entry,statement',
    JSON.stringify(rotate?.inputSchema?.properties),
  );
  check(
    'its description tells the model where to put the placeholder',
    (rotate?.description ?? '').includes('{{creds:new}}'),
    (rotate?.description ?? '').slice(0, 120),
  );

  consent.answers = ['Allow'];
  consent.asked = 0;
  ranQueries.length = 0;
  const rotatedOut = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'creds_rotate',
        arguments: { entry: 'e-1', statement: "ALTER USER app IDENTIFIED BY '{{creds:new}}'" },
      },
    },
  ]);
  const rotatedText = rotatedOut.byId.get(9)?.result?.content?.[0]?.text ?? '';
  check('a rotation runs and reports success', rotatedText.includes('"rotated":true'), rotatedText.slice(0, 200));
  check('the far side received a real statement', ranQueries.length === 1, JSON.stringify(ranQueries));
  check(
    'with the placeholder replaced by a generated value',
    ranQueries[0] !== undefined && !ranQueries[0].includes('{{creds:new}}') && ranQueries[0].includes('ALTER USER'),
    JSON.stringify(ranQueries[0]),
  );
  check(
    'and the new secret is NOT in what the agent received',
    !rotatedOut.out.includes('GENERATED-9f2c41ab'),
    'the generated value leaked into the tool answer',
  );
  check('the old value went into history before the write', rotated.recorded === 1, String(rotated.recorded));
  check(
    'and the stored connection string carries the new password',
    rotated.stored.length === 1 && rotated.stored[0].value.includes('GENERATED-9f2c41ab'),
    JSON.stringify(rotated.stored),
  );

  consent.answers = ['Allow'];
  consent.asked = 0;
  ranQueries.length = 0;
  const notAllowed = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'creds_rotate',
        arguments: { entry: 'e-use-only', statement: "ALTER USER app IDENTIFIED BY '{{creds:new}}'" },
      },
    },
  ]);
  const notAllowedText = notAllowed.byId.get(10)?.result?.content?.[0]?.text ?? '';
  check(
    'an entry that may be USED may not be ROTATED — the ladder holds',
    notAllowedText.includes('Agents may replace the secret') && notAllowedText.includes('staging-db'),
    notAllowedText.slice(0, 240),
  );
  check('and nothing ran for it', ranQueries.length === 0, JSON.stringify(ranQueries));

  // ---- level 5: deletion ---------------------------------------------------
  const del = tools2.find((t) => t.name === 'creds_delete');
  check('it offers creds_delete', del !== undefined, JSON.stringify(tools2.map((t) => t.name)));
  check(
    'and it takes ONLY the entry — there is no second destination to ask for',
    Object.keys(del?.inputSchema?.properties ?? {}).join(',') === 'entry',
    JSON.stringify(del?.inputSchema?.properties),
  );

  consent.answers = ['Allow'];
  consent.asked = 0;
  const binned = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'creds_delete', arguments: { entry: 'e-bin' } } },
  ]);
  const binnedText = binned.byId.get(11)?.result?.content?.[0]?.text ?? '';
  check('an entry it may delete goes to the Trash', binnedText.includes('"deleted":true'), binnedText.slice(0, 200));
  check('and the answer says it can be undone', binnedText.includes('"restorable":true'), binnedText.slice(0, 200));
  check('the window moved it', trashed.length === 1 && trashed[0] === 'e-bin', JSON.stringify(trashed));
  check('the human was asked', consent.asked === 1, String(consent.asked));

  consent.answers = ['Allow'];
  consent.asked = 0;
  trashed.length = 0;
  const kept = await speak(env, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'creds_delete', arguments: { entry: 'e-1' } } },
  ]);
  const keptText = kept.byId.get(12)?.result?.content?.[0]?.text ?? '';
  check(
    'an entry it may USE it may not delete — the ladder again',
    keptText.includes('"error"') && !keptText.includes('"deleted":true'),
    keptText.slice(0, 240),
  );
  check('and nothing was moved', trashed.length === 0, JSON.stringify(trashed));
  check('and nobody was asked', consent.asked === 0, String(consent.asked));

  // ---- level 4: creating ---------------------------------------------------
  const make = tools2.find((t) => t.name === 'creds_create');
  check('it offers creds_create', make !== undefined, JSON.stringify(tools2.map((t) => t.name)));
  check(
    'only name and kind are required — leaving folder out is the ordinary case',
    (make?.inputSchema?.required ?? []).sort().join(',') === 'kind,name',
    JSON.stringify(make?.inputSchema?.required),
  );
  check(
    'and its schema names no entry, because there is not one yet',
    Object.keys(make?.inputSchema?.properties ?? {}).includes('name') &&
      !Object.keys(make?.inputSchema?.properties ?? {}).includes('entry'),
    JSON.stringify(Object.keys(make?.inputSchema?.properties ?? {})),
  );

  consent.answers = ['Allow'];
  consent.asked = 0;
  const made = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'creds_create',
        arguments: { name: 'app-03', kind: 'ssh', secret: 'AGENT-SUPPLIED-4f21', host: 'app-03.internal' },
      },
    },
  ]);
  const madeText = made.byId.get(13)?.result?.content?.[0]?.text ?? '';
  check('an agent can store a credential it made', madeText.includes('"created":true'), madeText.slice(0, 200));
  check('the window received the secret it supplied', created.length === 1 && created[0].secret === 'AGENT-SUPPLIED-4f21', JSON.stringify(created.map((c) => c.name)));
  check('the human was asked', consent.asked === 1, String(consent.asked));

  server.dispose();
  console.log(fails === 0 ? '\nall checks passed' : `\n${fails} check(s) failed`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
