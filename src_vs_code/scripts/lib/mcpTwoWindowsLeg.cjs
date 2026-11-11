'use strict';
// Checks H3 to H6 of `todo/PLAN_agent_refusal_names_unlisted_entry.md` (section 5.7): TWO windows at the same time, the REAL `creds-mcp`.
//
// What only this can show. `creds-mcp` walks the windows it finds, newest first, and a `denied` stops the walk while a `not_found` goes on
// (`src_mcp/tests/WindowsTests.cs` pins that half). Rule A makes a window answer `not_found` for an entry that the agent may not view. So
// the two halves together mean: a window that HIDES an entry lets the walk reach an older window that holds it. Each window's lookup here
// is the real `mcpUseHooks` over its own real `StorageManager`, wrapped only to count its calls.
//
// The caller gives what it already owns (its `speak`, `check`, the two folder helpers, the loaded modules), so the leg makes no helper of its
// own and no folder: every folder comes from the caller's `brokerDir`, which the harness's scope removes on every way out.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

/** The sentence and the hint of `creds_query` on an id that no window serves (`src_mcp/src/UseTools.cs`, the `reply is null` branch). */
const NO_WINDOW = 'No CredsForDevs window answered for that entry.';
const STALE_HINT = 'The entry id may be stale — call creds_list again.';

/** The marker that is in every name of the NEWER window: a name that reaches an answer or a dialog is found by a plain text search. */
const NEWER = 'NEWER-MARK';

/** How many checks the leg owns BEFORE its own contribution assertion. */
const EXPECTED_CHECKS = 15;

/** A tool's refusal is JSON, with the dash of the hint written as an escape: it is read as JSON, never searched as text. */
function failureOf(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Is this the answer for an id that no window serves: the binary's own sentence and its stale-id hint, and nothing of a node? */
const isMissingAnswer = (text) => failureOf(text).error === NO_WINDOW && String(failureOf(text).hint).startsWith(STALE_HINT);

/** One database entry, at the root or in a folder. */
const dbEntry = (id, name, parentId) => ({
  id,
  name,
  type: 'entity',
  parentId,
  details: { id, name, kind: 'db', isSshEnabled: false, dbType: 'mysql' },
});

/** A real vault of one account. `nodes` are added in order, so a folder comes before what it holds. */
async function vaultOf(h, nodes) {
  const storage = new h.StorageManager(h.memento(), h.secretStore());
  await storage.upsertAccount({ accountId: 'a-1', email: 'me@corp.com', provider: 'google' });
  for (const node of nodes) {
    await storage.addNode('a-1', node);
  }
  return storage;
}

/**
 * The NEWER window's tree: nothing here has a switch except the folder that holds `e-view`, which has `view` and no `use`.
 * `e-x` and `e-both` have no switch at all, so this window HIDES them (rule A).
 */
const newerNodes = () => [
  dbEntry('e-x', `${NEWER}-x`, null),
  dbEntry('e-both', `${NEWER}-both`, null),
  { id: 'f-look', name: `${NEWER}-folder`, type: 'folder', parentId: null, mcp: { view: true } },
  dbEntry('e-view', `${NEWER}-view`, 'f-look'),
];

/** The OLDER window's tree: `e-both` under a folder that opens it to use. It holds neither `e-x` nor `e-view`. */
const olderNodes = () => [
  { id: 'f-use', name: 'older-folder', type: 'folder', parentId: null, mcp: { view: true, use: true } },
  dbEntry('e-both', 'older-reports-db', 'f-use'),
];

/** A window over one vault. Its `query` action says which window ran it, and `log` gets a line for each id its lookup is asked about (shared, append-only). */
function windowOver(h, storage, label, log) {
  const actions = new h.UseActionRegistry();
  actions.register({
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query on',
    validate: () => ({ ok: true }),
    summarize: (body) => String(body.query ?? ''),
    describeOutcome: () => 'done',
    run: () => Promise.resolve({ status: 200, body: { exitCode: 0, rows: 1, stdout: `ran in the ${label} window` } }),
  });
  const hooks = h.mcpUseHooks(storage, h.memento(), () => Date.now());
  return new h.CredsAgentServer(actions, () => {}, {
    storageDir: h.brokerDir(),
    listMcpEntries: () => Promise.resolve([]),
    resolveMcpUse: (entryId, action, server) => {
      log.push({ window: label, entry: entryId });
      return hooks.resolveMcpUse(entryId, action, server);
    },
    rememberMcpConsent: hooks.rememberMcpConsent,
  });
}

/** `GET /v1/health` on a port: the service name it answers with, or the failure. */
function healthOf(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/v1/health' }, (res) => {
      let text = '';
      res.on('data', (d) => {
        text += d;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(text).service);
        } catch {
          resolve(`not JSON: ${text.slice(0, 80)}`);
        }
      });
    });
    req.on('error', (e) => resolve(String(e)));
  });
}

/**
 * Announce two windows in one folder, as `oldWindowLeg` does for one: a file per window under its own name, the newer one with the
 * later `startedAt`. Both windows run in this process, so each one's own announcement carries the same pid and the same file name.
 */
function announce(dir, newer, older) {
  const now = Date.now();
  const write = (name, server, startedAt) =>
    fs.writeFileSync(
      path.join(dir, name),
      JSON.stringify({ pid: process.pid, port: server.port, socket: null, startedAt: new Date(startedAt).toISOString() }),
    );
  write('window-new.json', newer, now);
  write('window-old.json', older, now - 60_000);
}

/** The ports in the discovery folder, and what each one answers to a health probe. */
async function discovered(dir) {
  const ports = fs
    .readdirSync(dir)
    .filter((name) => /^window-.*\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).port);
  const services = await Promise.all(ports.map(healthOf));
  return { ports, services };
}

/** What a call returns: its text, the consent record of THAT call, and how often each window's lookup saw its id; these three read it for a check message. */
const countsOf = (call) => `newer ${call.newer}, older ${call.older}`;
const dialogsOf = (call) => JSON.stringify(call.consent.messages).slice(0, 200);
const oneEach = (call) => call.newer === 1 && call.older === 1;

/** The text of the first content part of a tool result, or an empty text. */
const firstText = (content) => content?.[0]?.text ?? '';
const replyText = (said, rpcId) => firstText(said.byId.get(rpcId)?.result?.content);

/** A new record of one call's dialogs: the answers it will be given, how often it was asked, and what each dialog said. Never reused by a second call. */
const freshConsent = (answers) => ({ answers: [...answers], asked: 0, messages: [] });

/**
 * Run `work` with `state` as the record that the fake window's dialog reads (`global.__CREDS_MCP_CONSENT__`), and put the harness's own record
 * back on every way out. The harness's record is never written here, so no call sees what another call left.
 */
async function withConsent(state, work) {
  const harnessOwn = global.__CREDS_MCP_CONSENT__;
  global.__CREDS_MCP_CONSENT__ = state;
  try {
    return await work();
  } finally {
    global.__CREDS_MCP_CONSENT__ = harnessOwn;
  }
}

/**
 * One `creds_query` through the real binary, with a consent record of its own. `log` only ever grows, and every id of this leg is asked ONCE,
 * so a call's lookups are the lines of its own entry.
 */
async function ask(h, env, log, { rpcId, entry, answers = [] }) {
  const consent = freshConsent(answers);
  const request = { jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name: 'creds_query', arguments: { entry, query: 'select 1' } } };
  const said = await withConsent(consent, () => h.speak(env, [...h.HANDSHAKE, request]));
  const lookups = (window) => log.filter((line) => line.window === window && line.entry === entry).length;
  return { text: replyText(said, rpcId), consent, newer: lookups('newer'), older: lookups('older') };
}

/** Without these the checks of the walk could pass with ONE window discovered, and say nothing about a walk. */
async function discoveryChecks(h, discoveryDir) {
  const found = await discovered(discoveryDir);
  h.check('two windows are discovered, on two different ports', found.ports.length === 2 && new Set(found.ports).size === 2, JSON.stringify(found.ports));
  h.check(
    'and each port answers the health probe with the service name',
    found.services.length === 2 && found.services.every((s) => s === h.SERVICE_NAME),
    JSON.stringify(found.services),
  );
}

/** H3: the newer window hides `e-x` and the older one does not hold it. Nothing names it. */
function checkHidden(h, call) {
  h.check('H3: an entry that the newest window hides reads as a missing one', isMissingAnswer(call.text), call.text.slice(0, 240));
  h.check('H3: and the answer does not hold its name', !call.text.includes(NEWER), call.text.slice(0, 240));
  h.check('H3: each window\'s lookup was called one time', oneEach(call), countsOf(call));
  h.check('H3: and nobody was asked', call.consent.asked === 0, String(call.consent.asked));
}

/**
 * H4: an id that no window holds. The same sentence and the same counts as H3. It asserts the sentence itself and not H3's text, so it stays
 * green when a mutation turns H3 red (a guard): H3 and H4 both equal the one sentence, so they equal each other.
 */
function checkMissing(h, call) {
  h.check('H4: an id that no window holds gives the same sentence as H3', isMissingAnswer(call.text), call.text.slice(0, 240));
  h.check('H4: with the same two counts', oneEach(call), countsOf(call));
}

/** H5: an entry that the agent MAY view and may not use. The sentence names it, and the walk stops at the window that holds it. */
function checkVisible(h, call) {
  h.check(
    'H5: an entry that the agent may view and not use is named, with the switch to turn on',
    call.text.includes(`${NEWER}-view`) && call.text.includes('Usable by agents'),
    call.text.slice(0, 240),
  );
  h.check('H5: the newer window\'s lookup was called one time', call.newer === 1, countsOf(call));
  h.check('H5: the older window\'s lookup was NOT called, because a denial stops the walk', call.older === 0, countsOf(call));
}

/** H6: the newer window hides `e-both`; the older window holds it with `use` on. The OLDER window decides, under its own consent policy. */
function checkBoth(h, call) {
  const { asked, messages } = call.consent;
  h.check('H6: the walk goes on to the older window, and it answers', call.text.includes('ran in the older window'), call.text.slice(0, 240));
  h.check('H6: each window\'s lookup was called one time', oneEach(call), countsOf(call));
  h.check(
    'H6: one dialog was raised, and it names the older window\'s entry',
    asked === 1 && messages.some((m) => m.includes('older-reports-db')),
    `asked ${asked}: ${dialogsOf(call)}`,
  );
  h.check(
    'H6: the answer and the dialog hold nothing of the newer window',
    !call.text.includes(NEWER) && !messages.some((m) => m.includes(NEWER)),
    `${call.text.slice(0, 120)} | ${dialogsOf(call)}`,
  );
}

/** The four walks, each with its own consent record and its own rpc id. */
async function walkChecks(h, env, log) {
  const askFor = (rpcId, entry, answers) => ask(h, env, log, { rpcId, entry, answers });
  checkHidden(h, await askFor(101, 'e-x'));
  checkMissing(h, await askFor(102, 'e-nope'));
  checkVisible(h, await askFor(103, 'e-view'));
  checkBoth(h, await askFor(104, 'e-both', ['Allow']));
}

/**
 * Level 9 — a hidden entry is a missing one, with two windows (H3 to H6).
 *
 * @param {object} h what the harness owns: `speak`, `check`, `checksRun` (a getter), `HANDSHAKE`, `brokerDir`, `memento`, `secretStore`,
 *   `SERVICE_NAME`, and the loaded `CredsAgentServer`, `UseActionRegistry`, `StorageManager`, `mcpUseHooks`. The consent record is NOT given:
 *   each call makes its own.
 * @param {string} discoveryDir the folder that `creds-mcp` is told to read (`CREDS_ENDPOINT_DIR`); the caller made it, so its sweep owns it.
 */
async function twoWindowsLeg(h, discoveryDir) {
  const before = h.checksRun();
  const log = [];
  const newer = windowOver(h, await vaultOf(h, newerNodes()), 'newer', log);
  const older = windowOver(h, await vaultOf(h, olderNodes()), 'older', log);
  try {
    await newer.ensureStarted();
    await older.ensureStarted();
    announce(discoveryDir, newer, older);
    await discoveryChecks(h, discoveryDir);
    await walkChecks(h, { CREDS_ENDPOINT_DIR: discoveryDir }, log);
  } finally {
    newer.dispose();
    older.dispose();
  }

  const ran = h.checksRun() - before;
  h.check('the two-windows leg contributed every check it owns', ran === EXPECTED_CHECKS, `ran ${ran} of ${EXPECTED_CHECKS}`);
}

module.exports = { twoWindowsLeg };
