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

/** A window over one vault. Its `query` action says which window ran it, and `calls` records each id its lookup was asked about. */
function windowOver(h, storage, label, calls) {
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
      calls.push(entryId);
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

/**
 * Level 9 — a hidden entry is a missing one, with two windows (H3 to H6).
 *
 * @param {object} h what the harness owns: `speak`, `check`, `checksRun` (a getter), `HANDSHAKE`, `consent`, `brokerDir`, `memento`, `secretStore`,
 *   `SERVICE_NAME`, and the loaded `CredsAgentServer`, `UseActionRegistry`, `StorageManager`, `mcpUseHooks`.
 * @param {string} discoveryDir the folder that `creds-mcp` is told to read (`CREDS_ENDPOINT_DIR`); the caller made it, so its sweep owns it.
 */
async function twoWindowsLeg(h, discoveryDir) {
  const before = h.checksRun();
  const newerCalls = [];
  const olderCalls = [];
  const newer = windowOver(h, await vaultOf(h, newerNodes()), 'newer', newerCalls);
  const older = windowOver(h, await vaultOf(h, olderNodes()), 'older', olderCalls);
  try {
    await newer.ensureStarted();
    await older.ensureStarted();
    announce(discoveryDir, newer, older);
    const env = { CREDS_ENDPOINT_DIR: discoveryDir };

    // Without this the checks below could pass with ONE window discovered, and say nothing about a walk.
    const found = await discovered(discoveryDir);
    h.check('two windows are discovered, on two different ports', found.ports.length === 2 && new Set(found.ports).size === 2, JSON.stringify(found.ports));
    h.check(
      'and each port answers the health probe with the service name',
      found.services.length === 2 && found.services.every((s) => s === h.SERVICE_NAME),
      JSON.stringify(found.services),
    );

    let id = 100;
    /** One `creds_query` through the real binary, with the counters and the dialog record cleared first. */
    const ask = async (entry, answers = []) => {
      newerCalls.length = 0;
      olderCalls.length = 0;
      h.consent.answers = [...answers];
      h.consent.asked = 0;
      h.consent.messages.length = 0;
      id += 1;
      const said = await h.speak(env, [
        ...h.HANDSHAKE,
        { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'creds_query', arguments: { entry, query: 'select 1' } } },
      ]);
      return said.byId.get(id)?.result?.content?.[0]?.text ?? '';
    };
    const counts = () => `newer ${newerCalls.length}, older ${olderCalls.length}`;
    const dialogs = () => JSON.stringify(h.consent.messages).slice(0, 200);

    // H3: the newer window hides `e-x` and the older one does not hold it. Nothing names it.
    const hidden = await ask('e-x');
    h.check('H3: an entry that the newest window hides reads as a missing one', isMissingAnswer(hidden), hidden.slice(0, 240));
    h.check('H3: and the answer does not hold its name', !hidden.includes(NEWER), hidden.slice(0, 240));
    h.check('H3: each window\'s lookup was called one time', newerCalls.length === 1 && olderCalls.length === 1, counts());
    h.check('H3: and nobody was asked', h.consent.asked === 0, String(h.consent.asked));

    // H4: an id that no window holds. The same sentence and the same counts as H3. It asserts the sentence itself and not H3's text, so it stays
    // green when a mutation turns H3 red (a guard): H3 and H4 both equal the one sentence, so they equal each other.
    const missing = await ask('e-nope');
    h.check('H4: an id that no window holds gives the same sentence as H3', isMissingAnswer(missing), missing.slice(0, 240));
    h.check('H4: with the same two counts', newerCalls.length === 1 && olderCalls.length === 1, counts());

    // H5: an entry that the agent MAY view and may not use. The sentence names it, and the walk stops at the window that holds it.
    const visible = await ask('e-view');
    h.check(
      'H5: an entry that the agent may view and not use is named, with the switch to turn on',
      visible.includes(`${NEWER}-view`) && visible.includes('Usable by agents'),
      visible.slice(0, 240),
    );
    h.check('H5: the newer window\'s lookup was called one time', newerCalls.length === 1, counts());
    h.check('H5: the older window\'s lookup was NOT called, because a denial stops the walk', olderCalls.length === 0, counts());

    // H6: the newer window hides `e-both`; the older window holds it with `use` on. The OLDER window decides, under its own consent policy.
    const both = await ask('e-both', ['Allow']);
    h.check('H6: the walk goes on to the older window, and it answers', both.includes('ran in the older window'), both.slice(0, 240));
    h.check('H6: each window\'s lookup was called one time', newerCalls.length === 1 && olderCalls.length === 1, counts());
    h.check(
      'H6: one dialog was raised, and it names the older window\'s entry',
      h.consent.asked === 1 && h.consent.messages.some((m) => m.includes('older-reports-db')),
      `asked ${h.consent.asked}: ${dialogs()}`,
    );
    h.check('H6: the answer and the dialog hold nothing of the newer window', !both.includes(NEWER) && !h.consent.messages.some((m) => m.includes(NEWER)), `${both.slice(0, 120)} | ${dialogs()}`);
  } finally {
    newer.dispose();
    older.dispose();
  }

  const ran = h.checksRun() - before;
  h.check('the two-windows leg contributed every check it owns', ran === EXPECTED_CHECKS, `ran ${ran} of ${EXPECTED_CHECKS}`);
}

module.exports = { twoWindowsLeg };
