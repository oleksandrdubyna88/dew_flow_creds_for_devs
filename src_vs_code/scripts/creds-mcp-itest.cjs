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

/**
 * Consent answers the fake window gives, in order, how often it was asked — and the text of every
 * modal, since the modal is the one place the caller's TAB TITLE is shown (issue #136).
 */
const consent = { answers: ['Allow'], asked: 0, messages: [] };
global.__CREDS_MCP_CONSENT__ = consent;
/**
 * Every line the broker wrote to its output channel — the audit surface.
 *
 * <p>Recorded rather than dropped since the consent modal started naming its caller: the one
 * claim about that label nothing else can make is that the name the MCP client sent in its
 * `initialize` reaches the window's audit line through the real binary, and the line is where it
 * can be read back.</p>
 */
const audit = [];
global.__CREDS_MCP_AUDIT__ = audit;

// ---- vscode stub -----------------------------------------------------------
// The modal is real here: an MCP use call raises one, and whether it does — and how often — is
// half of what the level-2 checks below are about.
const stub = path.join(os.tmpdir(), 'creds-mcp-itest-vscode-stub.cjs');
fs.writeFileSync(
  stub,
  `module.exports = {
     window: {
       showWarningMessage: (message) => {
         const c = global.__CREDS_MCP_CONSENT__;
         c.asked += 1;
         c.messages.push(String(message));
         return Promise.resolve(c.answers.shift());
       },
       showInformationMessage: () => Promise.resolve(undefined),
       showErrorMessage: () => Promise.resolve(undefined),
       createOutputChannel: () => ({ appendLine(line){ global.__CREDS_MCP_AUDIT__.push(line); }, dispose(){} }),
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
// The folder level runs against the REAL hooks over a REAL StorageManager, not a stub. A stub
// would prove the wire and nothing else, and the one check here with teeth — that `mcp` in a
// request body cannot reach the tree — lives inside `readEdit`, which a stub never calls.
const { StorageManager } = require(path.join(OUT, 'storageManager.js'));
const { folderHooks } = require(path.join(OUT, 'mcpFolderHooks.js'));
// The REAL lookup for the quiet leg (#95): the policy resolved through a tree and a stamp store,
// not a stub answering `preConsented: true`. A stub would prove the door forwards a flag.
const { mcpUseHooks, moveEntryToTrash } = require(path.join(OUT, 'mcpHooks.js'));
const { consentStampsFor, stampKey } = require(path.join(OUT, 'mcpConsentPolicy.js'));
const { ladderKey, normalizeMcpAccess } = require(path.join(OUT, 'mcpAccess.js'));

/** An in-memory Memento and SecretStorage — the two things a StorageManager needs. */
/** One POST at the broker, bypassing the binary — what a local process can do unaided. */
function postJson(port, route, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = require('http').request(
      { host: '127.0.0.1', port, path: route, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let text = '';
        res.on('data', (d) => {
          text += d;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on('error', (e) => resolve({ status: 0, body: String(e) }));
    req.end(payload);
  });
}

function memento() {
  const map = new Map();
  return {
    get: (key, fallback) => (map.has(key) ? map.get(key) : fallback),
    update: (key, value) => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secretStore() {
  const map = new Map();
  return {
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose() {} }),
  };
}



let fails = 0;
/**
 * How many checks have RUN.
 *
 * <p>Counted because "the suite is green" and "the suite ran" are different claims: a leg that
 * returns early, or one whose registration is lost in a merge, leaves every remaining check
 * unexecuted and the run still reports success. A level that knows how many checks it owns can
 * assert it contributed them.</p>
 */
let checksRun = 0;
const check = (what, ok, extra) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}${ok || extra === undefined ? '' : `  (${extra})`}`);
  checksRun += 1;
  if (!ok) fails += 1;
};

/**
 * The binary and its freshness check, shared with `emit-mcp-tools.mjs`.
 *
 * <p>`npm run itest:mcp` compiles the TypeScript and NOT the .NET server, so an executable built
 * last week passes every check in this file while proving nothing about today's code. Logging its
 * age is not enough — a number nobody reads is not a check — so the check compares it against the
 * newest source under `src_mcp/src` and FAILS when the binary is older. It moved to
 * `mcpBinary.cjs` when the contract emitter turned out to need the same guard and to have had the
 * same path written out a second time; see that file for what the asymmetry cost.</p>
 */
const { EXE, binaryIsFresherThanItsSource } = require('./mcpBinary.cjs');

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

/** The session the T14 call claims, and — where a fixture home can be substituted — its tab's title. */
const ITEST_SESSION = '98bf9f23-81ff-4bba-beaf-1fd8269ddc97';
const ITEST_TAB_TITLE = 'creds itest tab';
const ITEST_CLAUDE_PID = '424242';

/**
 * A home folder laid out the way Claude Code lays out ~/.claude: a registry entry naming the
 * session and its folder, and that session's transcript under the folder Claude Code derives from
 * the cwd (every character outside [a-zA-Z0-9] becomes '-'), whose last line is a custom title.
 * The conversation line before it carries a decoy title the reader must never take.
 */
function claudeHomeWithTitle(root, session, title) {
  const home = path.join(root, 'title-home');
  const cwd = path.join(home, 'work', 'itest-repo');
  const sessions = path.join(home, '.claude', 'sessions');
  const project = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(sessions, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(sessions, `${ITEST_CLAUDE_PID}.json`), JSON.stringify({ pid: Number(ITEST_CLAUDE_PID), sessionId: session, cwd }));
  const decoy = { type: 'user', message: { role: 'user', content: '{"type":"custom-title","customTitle":"DECOY"}' } };
  const titled = { type: 'custom-title', customTitle: title, sessionId: session };
  fs.writeFileSync(path.join(project, `${session}.jsonl`), `${JSON.stringify(decoy)}\n${JSON.stringify(titled)}\n`);
  return home;
}

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
      // What the binary names the caller by: the modal's `creds-itest 9.9` is THIS, read off the
      // handshake through McpServer.ClientInfo — the check below proves the route end to end.
      clientInfo: { name: 'creds-itest', version: '9.9' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

/** How many checks {@link quietLeg} owns BEFORE its own contribution assertion, which does not count itself. */
const EXPECTED_QUIET_CHECKS = 10;

/**
 * Level 6 — the quiet path (#95), through the REAL binary.
 *
 * <p>Everything else that covers the consent cadence stops at the extension's own loopback surface.
 * This asks the same question of the binary: an entry a person set to never-ask is used with no
 * dialog, one answered inside the last twelve hours is too, deleting either still asks, and a local
 * process with no token at all reaches the first of them.</p>
 *
 * <p>The lookup is the REAL `mcpUseHooks` over a REAL `StorageManager` and a REAL stamp store, not
 * a stub answering `preConsented: true`. A stub would prove the door forwards a flag, which is
 * already a unit test; what had never been shown is that the POLICY, resolved through a tree,
 * survives the trip through the binary.</p>
 *
 * <p>Its OWN window and its own function, and both for the same reason as level 5: an
 * unauthenticated caller may make a window prompt five times a minute, the levels above have spent
 * that budget, and the delete check needs a prompt of its own. The `finally` is not tidiness — a
 * throw with a listener still open leaves Node alive forever, which is what the outer catch already
 * records having cost four minutes of watching nothing.</p>
 */
async function quietLeg() {
  const before = checksRun;
  const fresh = binaryIsFresherThanItsSource();
  check('the binary under test is newer than the C# it embodies', fresh.fresh, fresh.why);

  const storage = new StorageManager(memento(), secretStore());
  await storage.upsertAccount({ accountId: 'a-1', email: 'me@corp.com', provider: 'google' });
  // Never ask: the whole ladder open, and the cadence set on the FOLDER, so the entry inherits it
  // exactly as one would in a vault.
  await storage.addNode('a-1', {
    id: 'f-never', name: 'Unattended', type: 'folder', parentId: null,
    mcp: { view: true, use: true, edit: true, delete: 'any', ask: 'never' },
  });
  await storage.addNode('a-1', {
    id: 'e-never', name: 'batch-db', type: 'entity', parentId: 'f-never',
    details: { id: 'e-never', name: 'batch-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' },
  });
  // Ask once every twelve hours, with an answer already on record — the other way to be quiet.
  await storage.addNode('a-1', {
    id: 'f-12h', name: 'Daily', type: 'folder', parentId: null,
    mcp: { view: true, use: true, delete: 'any', ask: 'every12h' },
  });
  await storage.addNode('a-1', {
    id: 'e-12h', name: 'report-db', type: 'entity', parentId: 'f-12h',
    details: { id: 'e-12h', name: 'report-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' },
  });
  // And one more under the never-ask folder, for the no-token check further down.
  await storage.addNode('a-1', {
    id: 'e-open', name: 'open-db', type: 'entity', parentId: 'f-never',
    details: { id: 'e-open', name: 'open-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' },
  });

  // The clock is an argument, so the twelve-hour boundary is a value rather than a wait. Nothing
  // compares it to the real one: this leg lives entirely inside its own timeline.
  const AT = 1_700_000_000_000;
  let clock = AT;
  const stampState = memento();
  await consentStampsFor(stampState).remember(
    stampKey('a-1', 'e-12h'),
    ladderKey(normalizeMcpAccess({ view: true, use: true, delete: 'any' })),
    AT,
  );

  const actions = new UseActionRegistry();
  actions.register({
    kind: 'db', action: 'query', verb: 'run a query on',
    validate: () => ({ ok: true }),
    summarize: (body) => String(body.query ?? ''),
    describeOutcome: () => 'done',
    run: (_ctx, body) => Promise.resolve({ status: 200, body: { exitCode: 0, rows: 1, stdout: String(body.query ?? '') } }),
  });
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-mcp-itest-quiet-'));
  const hooks = mcpUseHooks(storage, stampState, () => clock);
  const quietServer = new CredsAgentServer(actions, () => {}, {
    storageDir,
    listMcpEntries: () => Promise.resolve([]),
    resolveMcpUse: hooks.resolveMcpUse,
    rememberMcpConsent: hooks.rememberMcpConsent,
    // The REAL move, over the REAL storage — so the delete check reads the tree afterwards rather
    // than a spy array agreeing with itself, which is what level 5 does one screen up.
    moveToTrash: (accountId, entityId) => moveEntryToTrash(storage, accountId, entityId),
  });
  try {
    await quietServer.ensureStarted();
    const env = { CREDS_ENDPOINT_DIR: path.join(storageDir, 'endpoints') };

    // Primed for the prompts the LATER checks raise — the past-twelve-hours call and the delete.
    // The six calls below raise none, which is what they are here to show.
    consent.answers = ['Allow', 'Allow', 'Allow'];
    consent.asked = 0;
    const queries = ['select 1', 'select 2', 'select 3', 'select 4', 'select 5', 'select 6'];
    const answers = [];
    for (const [i, query] of queries.entries()) {
      const said = await speak(env, [
        ...HANDSHAKE,
        { jsonrpc: '2.0', id: 60 + i, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-never', query } } },
      ]);
      answers.push(said.byId.get(60 + i)?.result?.content?.[0]?.text ?? '');
    }
    check(
      'six quiet calls on a never-ask entry all succeed, end to end through the binary',
      answers.every((text, i) => text.includes('"rows":1') && text.includes(queries[i])),
      answers.map((t) => t.slice(0, 60)).join(' | '),
    );
    check('and the human was asked ZERO times', consent.asked === 0, `asked ${consent.asked}`);

    const within = await speak(env, [
      ...HANDSHAKE,
      { jsonrpc: '2.0', id: 70, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-12h', query: 'select 7' } } },
    ]);
    check(
      'an entry answered inside its twelve hours is quiet too',
      (within.byId.get(70)?.result?.content?.[0]?.text ?? '').includes('"rows":1'),
      (within.byId.get(70)?.result?.content?.[0]?.text ?? '').slice(0, 200),
    );
    check('and still nobody was asked', consent.asked === 0, `asked ${consent.asked}`);

    // Twelve hours and a millisecond later the same entry asks again — the boundary, not a wait.
    clock = AT + 12 * 60 * 60_000 + 1;
    const askedBeforeWindow = consent.asked;
    const past = await speak(env, [
      ...HANDSHAKE,
      { jsonrpc: '2.0', id: 71, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-12h', query: 'select 8' } } },
    ]);
    check(
      'past twelve hours the same entry asks again, and runs once allowed',
      consent.asked === askedBeforeWindow + 1
        && (past.byId.get(71)?.result?.content?.[0]?.text ?? '').includes('"rows":1'),
      `asked ${consent.asked - askedBeforeWindow}: ${(past.byId.get(71)?.result?.content?.[0]?.text ?? '').slice(0, 120)}`,
    );
    clock = AT;

    // Deleting a NEVER-ASK entry still asks. The policy says never; `handleMcpDelete` passes
    // `prompts: true` whatever it says and `mayBeQuiet` refuses a delete verb — owner decision D2,
    // through the binary rather than by a fixture agreeing with itself. The count is taken around
    // this call alone, so a prompt elsewhere cannot stand in for it.
    const askedBeforeDelete = consent.asked;
    const deleted = await speak(env, [
      ...HANDSHAKE,
      { jsonrpc: '2.0', id: 72, method: 'tools/call', params: { name: 'creds_delete', arguments: { entry: 'e-never' } } },
    ]);
    check(
      'deleting a never-ask entry still asks — exactly once, for this call',
      consent.asked === askedBeforeDelete + 1,
      `asked ${consent.asked - askedBeforeDelete} for the delete`,
    );
    check(
      'and it really moved, in the TREE — not in a spy',
      storage.getNode('a-1', 'e-never')?.parentId !== 'f-never',
      `${(deleted.byId.get(72)?.result?.content?.[0]?.text ?? '').slice(0, 160)} · parent now ${storage.getNode('a-1', 'e-never')?.parentId}`,
    );

    // The boundary the parent plan asked to SEE rather than assume. Deliberately NOT through the
    // binary: the scenario is a local process that is not an MCP client at all — no handshake, no
    // token, no approval, no session — reaching the loopback port directly. The binary's own
    // unattended path is what the six calls above already exercise.
    const askedBeforeUnattended = consent.asked;
    const unattended = await postJson(quietServer.port, '/v1/mcp/use/query', { entry: 'e-open', query: 'select 9' });
    check(
      'a bare local process — no token, no approval, no session, not even an MCP client — reaches a never-ask entry',
      unattended.status === 200 && unattended.body.includes('"rows":1'),
      `${unattended.status}: ${unattended.body.slice(0, 200)}`,
    );
    check(
      'and nobody was asked about it — the boundary this feature buys, recorded rather than assumed',
      consent.asked === askedBeforeUnattended,
      `asked ${consent.asked - askedBeforeUnattended}`,
    );
  } finally {
    // Before any assertion can throw past it. A listener left open keeps Node alive, and a crashed
    // check then looks exactly like a hung test.
    quietServer.dispose();
    fs.rmSync(storageDir, { recursive: true, force: true });
  }

  check(
    'the quiet leg contributed every check it owns',
    checksRun - before === EXPECTED_QUIET_CHECKS,
    `ran ${checksRun - before} of ${EXPECTED_QUIET_CHECKS}`,
  );
}

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
  /** What the vault holds right now — what the masker builds its table from. */
  const storedSecrets = [];
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
      const query = String(body.query ?? '');
      ranQueries.push(query);
      // ECHOES the statement, on purpose. A rotation's whole promise is that the new value does
      // not reach the agent — and the one hole left in that is the far side's own output, since a
      // statement can be composed to print what it was given. A stub that answered "ok" would
      // pass this test without exercising the masker at all.
      return Promise.resolve({ status: 200, body: { exitCode: 0, rows: 1, stdout: query } });
    },
  });

  // Its rotating twin, wrapping the same stub — which is the whole design: one implementation of
  // "reach the far side", and the rotation adds the generate before it and the store after.
  const rotated = { recorded: 0, stored: [] };
  actions.register(
    rotateAction(actions.resolve('db', 'query'), 'query', {
      generate: (kind) =>
        kind === 'password'
          ? { ok: true, value: 'GENERATED-9f2c41ab', kind: 'password' }
          : { ok: false, kind, message: `${kind} is not generated here.` },
      entity: () => ({ id: 'e-1', name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }),
      current: () => Promise.resolve('mysql://app:old@db-01.example.internal:3306/orders'),
      snapshot: () => Promise.resolve({ at: 1, name: 'orders-db', details: {}, secrets: {} }),
      record: () => {
        rotated.recorded += 1;
        return Promise.resolve();
      },
      store: (_ctx, slot, value) => {
        rotated.stored.push({ slot, value });
        // Stored before the response is masked, which is what puts the new value in the table.
        storedSecrets.push('GENERATED-9f2c41ab');
        return Promise.resolve();
      },
    }),
  );

  // Named, since 2026-09-11. The warning this block used to carry is the reason: these arguments
  // were POSITIONAL, and when `visibleConfig` was added (32d8f01, 2026-08-27) every lambda after it
  // shifted one place, the permission gate became the config supplier, and nineteen checks here
  // failed with "no window answered" for a MONTH, unseen. A hook cannot land in another's slot now,
  // and a key that is not a hook is refused at construction rather than read as "switched off".
  const server = new CredsAgentServer(actions, () => {}, {
    storageDir,
    // The masker, reading what is STORED — which after a rotation is the new value. This is the
    // last line between a statement that echoes its own argument and an agent that reads it.
    maskEntriesFor: () => Promise.resolve(storedSecrets.map((value) => ({ value, label: 'DB_PASSWORD' }))),
    listMcpEntries: () => Promise.resolve(ENTRIES),
    // The gate the whole route exists for, and it is PER ACTION: `e-1` may be used, and may be
    // rotated only because this fixture says its `edit` switch is on too; `e-use-only` may be
    // used and NOT rotated, which is the rung the ladder exists to keep apart.
    resolveMcpUse: (id, action) => {
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
    moveToTrash: (_accountId, entityId) => {
      trashed.push(entityId);
      return Promise.resolve(true);
    },
    // One folder open to creation, so the agent names none — and could not choose another.
    mcpCreate: {
      choose: (body) =>
        // A kind this window does not make is refused before anybody is prompted, and recorded
        // as the one outcome the journal's "could not generate" filter counts.
        body.secretKind === 'x509'
          ? {
              ok: false,
              code: 'not_supported',
              message: 'Certificates come from a certificate authority.',
              noGenerator: true,
            }
          : ({
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
  });
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
  audit.length = 0;
  // The caller identity rides on THIS call rather than one of its own (T14). An unauthenticated
  // caller may make a window prompt five times a minute (`aliasThrottle.ts`), the levels below
  // spend that budget, and a sixth prompt added here STARVED level 4 — which is how this check was
  // first written, and what running it found. `CLAUDE_PID` is blanked so the session registry on
  // THIS machine — a real one whenever the script runs under Claude Code — cannot make the label
  // depend on who ran the test.
  //
  // T-I1 (issue #136) rides the same call, for the same budget reason: where HOME decides the home
  // folder, the child gets a FIXTURE home holding a registry entry and a transcript with a custom
  // title, and the modal must name the session by that title while the audit line must not. On
  // Windows `Environment.GetFolderPath(UserProfile)` comes from the profile registry and ignores
  // both HOME and USERPROFILE (measured 2026-09-24), so the fixture cannot be substituted there
  // without a production knob, and the check is skipped with that reason. CI runs this on Linux.
  const titleHome = process.platform === 'win32' ? undefined : claudeHomeWithTitle(storageDir, ITEST_SESSION, ITEST_TAB_TITLE);
  const whoEnv = titleHome === undefined ? { CLAUDE_PID: '' } : { HOME: titleHome, CLAUDE_PID: ITEST_CLAUDE_PID };
  consent.messages.length = 0;
  const used = await speak({ ...env, CLAUDE_CODE_SESSION_ID: ITEST_SESSION, ...whoEnv }, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'creds_query', arguments: { entry: 'e-1', query: 'select 1' } } },
  ]);
  const usedText = used.byId.get(6)?.result?.content?.[0]?.text ?? '';
  check('an open entry can be used, end to end', usedText.includes('"rows":1'), usedText.slice(0, 200));
  check('and the human was asked, exactly once', consent.asked === 1, `asked ${consent.asked}`);

  // ---- who is asking (research/PLAN_caller_identity_in_consent.md, T14) ---------------------
  // The clientInfo route proven end to end rather than assumed from the SDK's metadata: the name
  // the client sent in its handshake, and the session id the binary read from its environment,
  // both arrive on the window's audit line through the real binary.
  const byLine = audit.find((line) => line.includes(' by ') && line.includes('select 1')) ?? '';
  check(
    'the audit line names the MCP client by the name and version it sent in its handshake',
    byLine.includes(' by creds-itest 9.9'),
    audit.join('\n').slice(0, 700),
  );
  check('and the short session id the binary read from its environment', byLine.includes('session 98bf9f23'), byLine);
  const label = byLine.split(' by ')[1]?.split(' → ')[0] ?? '/';
  check('and the folder by its name only — never a path', label.includes(' · in ') && !/[\\/]/.test(label), label);

  // ---- the tab title, C# sender against the TypeScript window (issue #136, T-I1) -------------
  if (titleHome === undefined) {
    console.log('SKIP  the tab-title check: on Windows the home folder comes from the profile registry, not from HOME,');
    console.log('      so a fixture home cannot be substituted; CI runs this harness on Linux, where it can.');
  } else {
    const modal = consent.messages.at(-1) ?? '';
    check(
      'the modal names the session by its TAB TITLE, read by the real binary from the fixture transcript',
      modal.startsWith(`creds-itest 9.9 · session "${ITEST_TAB_TITLE}" (98bf9f23) · in itest-repo wants to `),
      modal.slice(0, 300),
    );
    check('and the audit line for the same call never records the title', byLine !== '' && !byLine.includes(ITEST_TAB_TITLE), byLine);
    fs.rmSync(titleHome, { recursive: true, force: true });
  }

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
  // By what the schema must NOT offer, rather than by an exact list of what it does. The list
  // form broke the day rotation learned the generation options (0.86.0) — it was asserting the
  // shape of one release rather than the property that matters, which is that there is nowhere
  // for a caller to put a secret VALUE. That property is what makes rotation safe to expose.
  const rotateProps = Object.keys(rotate?.inputSchema?.properties ?? {});
  check(
    'the rotate schema asks for a statement, not a value',
    rotateProps.includes('statement') &&
      !rotateProps.some((name) => /^(secret|value|password|newSecret)$/i.test(name)),
    JSON.stringify(rotateProps),
  );
  check(
    'and only the entry and the statement are required — the kind defaults to a password',
    (rotate?.inputSchema?.required ?? []).sort().join(',') === 'entry,statement',
    JSON.stringify(rotate?.inputSchema?.required),
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
    'and the new secret is NOT in what the agent received — even though the statement echoed it',
    !rotatedOut.out.includes('GENERATED-9f2c41ab'),
    'the generated value leaked into the tool answer',
  );
  check(
    'it came back masked rather than merely absent',
    rotatedOut.out.includes('CREDS_MASKED'),
    'nothing was masked, so the check above proves only that nothing echoed',
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

  // ---- what this window cannot make ---------------------------------------
  // The other half of the trade: an agent asking for a kind of secret the extension does not
  // generate gets a reason it can pass on, rather than a silence it would fill in itself.
  consent.answers = ['Allow'];
  consent.asked = 0;
  created.length = 0;
  const cannot = await speak(env, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: { name: 'creds_create', arguments: { name: 'gateway-cert', kind: 'credential', secretKind: 'x509' } },
    },
  ]);
  const cannotText = cannot.byId.get(14)?.result?.content?.[0]?.text ?? '';
  check(
    'a kind this window cannot make is refused with the reason',
    cannotText.includes('certificate authority'),
    cannotText.slice(0, 240),
  );
  check('and nothing was created', created.length === 0, JSON.stringify(created));
  check('and nobody was prompted about it', consent.asked === 0, String(consent.asked));

  const askedKind = tools2.find((t) => t.name === 'creds_create');
  check(
    'creds_create offers secretKind, and prefers it to a supplied secret',
    Object.keys(askedKind?.inputSchema?.properties ?? {}).includes('secretKind') &&
      (askedKind?.description ?? '').includes('PREFER'),
    JSON.stringify(Object.keys(askedKind?.inputSchema?.properties ?? {})),
  );

  // ---- level 5: folders (research/PLAN_agent_folder_ops_itest.md) ----------
  //
  // The seam this whole script exists for, over the SECOND object. Until 0.90.0 the folder
  // surface had never been driven end to end, and it did not work in a single release that
  // shipped it: the listing was wired into the POST-only MCP dispatch while every client GETs
  // it, so `creds_folders` answered "No CredsForDevs window answered" from a window that was
  // answering `creds_list` in the same second. Unit tests on both halves were green throughout.
  //
  // Real StorageManager, real `folderHooks` — a stub here would have proved the wire and missed
  // the one check with teeth (step 5).
  const storage = new StorageManager(memento(), secretStore());
  await storage.upsertAccount({ accountId: 'a-1', email: 'me@corp.com', provider: 'google' });
  // Open to everything an agent may do to a folder.
  await storage.addNode('a-1', {
    id: 'f-open',
    name: 'Servers',
    type: 'folder',
    parentId: null,
    mcp: { view: true, folderCreate: true, folderEdit: true, folderDelete: 'own' },
  });
  // Visible and nothing more — the rung the ladder exists to keep apart.
  await storage.addNode('a-1', {
    id: 'f-look',
    name: 'Readonly',
    type: 'folder',
    parentId: null,
    mcp: { view: true },
  });
  // Opened to nobody: it must not appear in the listing, and must not be a destination.
  await storage.addNode('a-1', { id: 'f-shut', name: 'Private', type: 'folder', parentId: null });

  // Its OWN window, and that is not tidiness. An unauthenticated caller may make a window prompt
  // five times a minute (`aliasThrottle.ts`) — a real defence against consent fatigue, and the
  // levels above have already spent that budget. A second window has its own, which is exactly
  // what a person opening one would get. Raising the limit for the test would have deleted the
  // property being relied on everywhere else in this file.
  const folderStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-mcp-itest-folders-'));
  const folderServer = new CredsAgentServer(new UseActionRegistry(), () => {}, { storageDir: folderStorageDir });
  folderServer.setFolderHooks(folderHooks(storage, () => {}));
  await folderServer.ensureStarted();
  const folderEnv = { CREDS_ENDPOINT_DIR: path.join(folderStorageDir, 'endpoints') };
  check(
    'the folder window announced itself',
    fs.existsSync(folderEnv.CREDS_ENDPOINT_DIR) && fs.readdirSync(folderEnv.CREDS_ENDPOINT_DIR).length > 0,
  );

  const folderTools = tools2.filter((t) => t.name.includes('folder')).map((t) => t.name).sort();
  check(
    'all four folder tools are offered',
    folderTools.join(',') === 'creds_create_folder,creds_delete_folder,creds_edit_folder,creds_folders',
    JSON.stringify(folderTools),
  );

  // 2. The listing — the call that was dead in 0.85.0 through 0.89.0.
  const folders = await speak(folderEnv, [
    ...HANDSHAKE,
    { jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'creds_folders', arguments: {} } },
  ]);
  const foldersText = folders.byId.get(20)?.result?.content?.[0]?.text ?? '';
  let parsedFolders;
  try {
    parsedFolders = JSON.parse(foldersText);
  } catch {
    /* reported by the check below */
  }
  // An ARRAY, not merely "some sentence is absent". Written the other way first, and the sabotage
  // run showed why that is worthless: the refusal's wording changed in the same release, so a
  // check for the old sentence passed against a window that served nothing at all.
  check(
    'creds_folders reaches the window and answers a LIST, not a refusal',
    Array.isArray(parsedFolders),
    foldersText.slice(0, 240),
  );
  const listedFolders = Array.isArray(parsedFolders) ? parsedFolders : [];
  const ids = listedFolders.map((f) => f.id).sort();
  check('only the folders opened to it are listed', ids.join(',') === 'f-look,f-open', JSON.stringify(ids));
  const openFolder = listedFolders.find((f) => f.id === 'f-open') ?? {};
  const lookFolder = listedFolders.find((f) => f.id === 'f-look') ?? {};
  check(
    'and `can` is what the switches say, per folder',
    openFolder.can?.create === true &&
      openFolder.can?.edit === true &&
      lookFolder.can?.create === false &&
      lookFolder.can?.edit === false,
    JSON.stringify([openFolder.can, lookFolder.can]),
  );

  // 3. Creating — it must reach the TREE, not a recording stub.
  consent.answers = ['Allow'];
  consent.asked = 0;
  const madeFolder = await speak(folderEnv, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: { name: 'creds_create_folder', arguments: { name: 'staging', parent: 'f-open' } },
    },
  ]);
  const madeFolderText = madeFolder.byId.get(21)?.result?.content?.[0]?.text ?? '';
  check('creds_create_folder answers that it made one', madeFolderText.includes('"created":true'), madeFolderText.slice(0, 240));
  const inTree = storage.getNodes('a-1').find((n) => n.name === 'staging');
  check('and the folder is in the tree, under the parent it named', inTree?.parentId === 'f-open', JSON.stringify(inTree));
  check(
    'marked as the agent\'s own, which is what the narrow delete scope keys on',
    inTree?.mcpCreatedByAgent === true,
    JSON.stringify(inTree?.mcpCreatedByAgent),
  );
  check('the human was asked exactly once', consent.asked === 1, String(consent.asked));

  // 4. A move into a part of the tree nobody opened — refused, and nothing moves.
  consent.answers = ['Allow'];
  consent.asked = 0;
  const moved = await speak(folderEnv, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: { name: 'creds_edit_folder', arguments: { folder: inTree?.id ?? 'x', parent: 'f-shut' } },
    },
  ]);
  const movedText = moved.byId.get(22)?.result?.content?.[0]?.text ?? '';
  check('a move into a closed folder is refused', movedText.includes('"error"'), movedText.slice(0, 240));
  check(
    'and nothing moved',
    storage.getNode('a-1', inTree?.id ?? 'x')?.parentId === 'f-open',
    String(storage.getNode('a-1', inTree?.id ?? 'x')?.parentId),
  );
  check('and nobody was asked about it', consent.asked === 0, String(consent.asked));

  // 5. THE CHECK WITH TEETH — self-granted permissions, at BOTH layers that stop them.
  //
  //    `research/PLAN_agent_folder_ops_itest.md` predicted one seam and named `readEdit`. Sabotage says
  //    there are THREE, in series, and the plan named the weakest:
  //      - the tool's delegate declares `folder`, `name`, `parent`, `folderType` and nothing
  //        else, so the MCP SDK never hands `mcp` to the binary. A model is stopped here and
  //        never reaches the rest — which is why spreading BOTH window-side narrowings leaves
  //        the first check below green.
  //      - `readEdit` narrows the request body to three fields;
  //      - `changesOf` narrows again on the way into the node.
  //    Measured: spreading `readEdit` alone stays green (`changesOf` catches it), spreading
  //    `changesOf` alone stays green (`readEdit` already dropped it), spreading BOTH goes red —
  //    with the folder holding the `delete: "any"` it granted itself.
  //
  //    So the level is checked twice, because the layers stop different callers. A MODEL is
  //    stopped by the schema. A hostile LOCAL PROCESS does not use the schema — it posts at the
  //    broker route it read out of the announcement file, and only the window's own narrowing is
  //    between it and the switches.
  consent.answers = ['Allow', 'Allow'];
  consent.asked = 0;
  const before = JSON.stringify(storage.getNode('a-1', inTree?.id ?? 'x')?.mcp ?? null);
  await speak(folderEnv, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'creds_edit_folder',
        arguments: {
          folder: inTree?.id ?? 'x',
          name: 'staging-2',
          mcp: { view: true, use: true, edit: true, create: true, delete: 'any', folderDelete: 'any' },
        },
      },
    },
  ]);
  const afterTool = storage.getNode('a-1', inTree?.id ?? 'x');
  check('a rename lands', afterTool?.name === 'staging-2', JSON.stringify(afterTool?.name));
  check(
    'a model cannot even send `mcp` — the tool schema has no such field',
    JSON.stringify(afterTool?.mcp ?? null) === before,
    `${before} -> ${JSON.stringify(afterTool?.mcp ?? null)}`,
  );

  // The same request, posted straight at the broker with no binary in the way — which is what a
  // local process that read the announcement file can do, and the case the window's own
  // field-by-field narrowing is the only defence against.
  const announced = JSON.parse(
    fs.readFileSync(
      path.join(folderEnv.CREDS_ENDPOINT_DIR, fs.readdirSync(folderEnv.CREDS_ENDPOINT_DIR)[0]),
      'utf8',
    ),
  );
  const posted = await postJson(announced.port, '/v1/mcp/folder/edit', {
    folder: inTree?.id ?? 'x',
    name: 'staging-3',
    mcp: { view: true, use: true, edit: true, create: true, delete: 'any', folderDelete: 'any' },
  });
  const afterPost = storage.getNode('a-1', inTree?.id ?? 'x');
  check('the raw route accepts the rename', afterPost?.name === 'staging-3', `${posted.status} ${posted.body.slice(0, 160)}`);
  check(
    'and the folder\'s Agent access is untouched — spreading BOTH narrowings lands HERE',
    JSON.stringify(afterPost?.mcp ?? null) === before,
    `${before} -> ${JSON.stringify(afterPost?.mcp ?? null)}`,
  );

  // 6. Deleting: what it made goes to the Trash; what it did not, does not.
  consent.answers = ['Allow'];
  consent.asked = 0;
  const removed = await speak(folderEnv, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: { name: 'creds_delete_folder', arguments: { folder: inTree?.id ?? 'x' } },
    },
  ]);
  const removedText = removed.byId.get(24)?.result?.content?.[0]?.text ?? '';
  check('a folder the agent made goes to the Trash', removedText.includes('"deleted":true'), removedText.slice(0, 240));
  check('and the answer says it can be undone', removedText.includes('"restorable":true'), removedText.slice(0, 240));

  consent.answers = ['Allow'];
  consent.asked = 0;
  const keptFolder = await speak(folderEnv, [
    ...HANDSHAKE,
    {
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: { name: 'creds_delete_folder', arguments: { folder: 'f-open' } },
    },
  ]);
  const keptFolderText = keptFolder.byId.get(25)?.result?.content?.[0]?.text ?? '';
  check(
    'a folder it did NOT make is refused under the `own` scope',
    keptFolderText.includes('"error"') && !keptFolderText.includes('"deleted":true'),
    keptFolderText.slice(0, 240),
  );
  check('and it is still in the tree', storage.getNode('a-1', 'f-open') !== undefined);

  await quietLeg();

  folderServer.dispose();
  server.dispose();
  console.log(`\n${checksRun} checks run`);
  console.log(fails === 0 ? 'all checks passed' : `${fails} check(s) failed`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((error) => {
  // Dispose before reporting. A throw used to leave both brokers listening, and a Node process
  // with an open server never exits — so a crashed check looked exactly like a hung test, which
  // is four minutes of watching nothing before anyone reads the stack.
  console.error(error);
  process.exitCode = 1;
  process.exit(1);
});
