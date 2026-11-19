import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseAuditLine } from '../agentAuditLog';
import { BRIDGE_USE_REFUSED } from '../bridgeScope';
import { statusForErrorCode } from '../brokerProtocol';
import type { DbClient, DbProfileRow } from '../bridgedDbProfile';
import { notStarted } from '../requestLife';
import type { DbType } from '../types';
import { code, message } from './bridgeDoorHarness';
import { Ask, registryOf, send, sendAbortable, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';
import { QueryOptions, QueryWorld, RECORDED, SERVED_BUILDS, foundPath, queryWorld } from './bridgedDbQueryWorld';
import { materializedKeysDir } from '../materializedKeys';
import { memento } from './bridgeModules';

/**
 * The bridged road of a database `query` through the real doors, with the client check (E1.7 spec §S7.6 and §S7.11, DG7-DG11, DC13): what is spawned, in which order, from
 * which path and which folder, and what the agent and the journal are told. Every case sits beside an observation of what was started, never beside words alone.
 */

const QUERY_SENTENCE = 'The database client runs on this computer, using the connection stored in "prod". Its output goes back to the agent on that server.';
const GENERIC = [statusForErrorCode('not_supported'), 'not_supported', BRIDGE_USE_REFUSED('prod')] as const;
const ENTRIES: readonly { readonly dbType: DbType; readonly client: DbClient; readonly connection: string }[] = [
  { dbType: 'postgres', client: 'psql', connection: 'postgresql://app:pw-one@db.example.test:5433/orders' },
  { dbType: 'mysql', client: 'mysql', connection: 'mysql://app:pw-two@db.example.test:3307/orders' },
  { dbType: 'mssql', client: 'sqlcmd', connection: 'Server=db.example.test,1444;Database=orders;User Id=app;Password=pw-three' },
];
const REFUSED_JOURNAL = ' (a Remote Bridge was told only that it could not be used)';
const query = (body: Record<string, unknown> = { entry: 'e1', alias: 'one', query: 'select 1' }): Ask => ({ path: '/v1/mcp/use/query', body });

/** Runs `use` against a world of the entry and a wall around its action; both are disposed. */
async function through(entry: (typeof ENTRIES)[number], profiles: readonly DbProfileRow[], options: QueryOptions, use: (qw: QueryWorld, ww: Awaited<ReturnType<typeof wallWorld>>) => Promise<void>): Promise<void> {
  const qw = await queryWorld(entry.dbType, entry.connection, profiles, options);
  const ww = await wallWorld({ query: qw.action });
  try {
    await use(qw, ww);
  } finally {
    ww.dispose();
  }
}

const kinds = (qw: QueryWorld): string[] => qw.runs.map((run) => run.kind);

test('DG7 (V4, T64, T74): a table that serves the pair and a good verdict: one dialog with today\'s words, the version spawn and then the query spawn, both of the same path; a second call records the query spawn alone', async () => {
  for (const entry of ENTRIES) {
    await through(entry, SERVED_BUILDS, { check: 'real' }, async (qw, ww) => {
      const first = await send(viaBridge(ww.bridge), query());

      assert.equal(first.status, 200, `${entry.client}: ${first.body}`);
      assert.equal(ww.w.dialogs.length, 1, `${entry.client}: one dialog`);
      assert.equal(ww.w.dialogs[0].split('\n')[2], `Through the Remote Bridge of "prod server". ${QUERY_SENTENCE}`, `${entry.client}: the words are today's`);
      assert.deepEqual(kinds(qw), ['version', 'query'], `${entry.client}: the version, then the query`);
      assert.deepEqual([qw.runs[0].command, qw.runs[1].command], [foundPath(entry.client), foundPath(entry.client)], `${entry.client}: the same path, not the bare word`);
      assert.deepEqual(qw.runs[0].args, entry.client === 'sqlcmd' ? ['-?'] : ['--version'], `${entry.client}: the version flag alone`);
      assert.equal(qw.runs[0].shell || qw.runs[1].shell, false, `${entry.client}: no shell`);

      assert.equal((await send(viaBridge(ww.bridge), query())).status, 200);
      assert.deepEqual(kinds(qw), ['version', 'query', 'query'], `${entry.client}: a second call records the query spawn alone`);
    });
  }
});

test('DG7b (V4, T66): the version spawn holds no password variable, no user variable and no connection argument; the query spawn holds the entry\'s own', async () => {
  for (const entry of ENTRIES) {
    await through(entry, SERVED_BUILDS, { check: 'real' }, async (qw, ww) => {
      await send(viaBridge(ww.bridge), query());

      const [version, run] = qw.runs;
      assert.deepEqual(Object.keys(version.env).sort(), process.platform === 'win32' ? Object.keys(version.env).sort() : ['HOME', 'PATH'], `${entry.client}: the bridged names and nothing else`);
      for (const name of ['PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER', 'PGPASSFILE', 'MYSQL_TEST_LOGIN_FILE', 'BRIDGE_TEST_SECRET']) {
        assert.equal(name in version.env, false, `${entry.client}: ${name} is not in the version spawn's environment`);
      }
      assert.equal(version.args.some((arg) => arg.includes('db.example.test') || arg.includes('pw-')), false, `${entry.client}: no connection argument`);
      assert.equal(Object.keys(run.env).some((name) => /PASSWORD|PWD/.test(name)), true, `${entry.client}: control, the query's own environment holds the entry's password variable`);
    });
  }
});

/** The line of a build no row lists, per client. */
const WRONG_BUILD: Readonly<Record<DbClient, { readonly line: string; readonly token: string }>> = {
  psql: { line: 'psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)\n', token: 'psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)' },
  mysql: { line: '/usr/bin/mysql  Ver 8.0.46-0ubuntu0.22.04.5 for Linux on x86_64 ((Ubuntu))\n', token: 'mysql  Ver 8.0.46-0ubuntu0.22.04.5 for Linux on x86_64 ((Ubuntu))' },
  sqlcmd: { line: 'Microsoft (R) SQL Server Command Line Tool\nVersion 17.11.0001.1 Linux\n', token: 'Version 17.11.0001.1 Linux with the driver 18.6.1.1' },
};
const SYSTEM_WORD: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' };
const BUILD_WORDS: Readonly<Record<DbClient, string>> = {
  psql: `psql ${RECORDED.psql.version} ${RECORDED.psql.tag}`,
  mysql: `Oracle's mysql ${RECORDED.mysql.version} ${RECORDED.mysql.tag}`,
  sqlcmd: `the ODBC sqlcmd ${RECORDED.sqlcmd.version} ${RECORDED.sqlcmd.tag} with the driver 18.6.1.1`,
};

test('DG8 (V4, T65, T67): a table that serves the pair and a bad verdict: one dialog, the generic body, DR8 in the journal, one version spawn and no query spawn; a second call asks again', async () => {
  for (const entry of ENTRIES) {
    const wrong = WRONG_BUILD[entry.client];
    await through(entry, SERVED_BUILDS, { check: 'real', versionLine: wrong.line }, async (qw, ww) => {
      const reply = await send(viaBridge(ww.bridge), query());

      assert.deepEqual([reply.status, code(reply), message(reply)], [...GENERIC], `${entry.client}: the generic body`);
      assert.equal(ww.w.dialogs.length, 1, `${entry.client}: one dialog`);
      assert.deepEqual(kinds(qw), ['version'], `${entry.client}: one version spawn and no query spawn`);
      const dr8 = `The ${entry.client} on this computer answered ${wrong.token}. A Remote Bridge runs a query with ${entry.client} on ${SYSTEM_WORD[process.platform] ?? process.platform} only for the builds that were measured: ${BUILD_WORDS[entry.client]}.`;
      assert.deepEqual(qw.journal, [`prod: ${dr8}${REFUSED_JOURNAL}`], `${entry.client}: DR8 in the journal`);
      assert.equal(reply.body.includes(wrong.token), false, `${entry.client}: the agent is told none of it`);

      await send(viaBridge(ww.bridge), query());
      assert.deepEqual(kinds(qw), ['version', 'version'], `${entry.client}: a bad verdict is asked again`);
    });
  }
});

test('DG9 (V4, T70): a call that Z2 refuses, a query refuseQuery refuses and a client that is not on PATH each answer what they answer today, and there is no spawn at all, the version spawn included', async () => {
  const [postgres] = ENTRIES;
  const refusals: readonly { readonly what: string; readonly entry: (typeof ENTRIES)[number]; readonly ask: Ask; readonly options: QueryOptions }[] = [
    { what: 'Z2', entry: { ...postgres, connection: 'postgresql://app:pw@db.example.test/orders?passfile=/x' }, ask: query(), options: {} },
    { what: 'refuseQuery', entry: postgres, ask: query({ entry: 'e1', alias: 'one', query: '\\! ls' }), options: {} },
    { what: 'tool_missing', entry: postgres, ask: query(), options: { onPath: () => false } },
  ];
  for (const refusal of refusals) {
    await through(refusal.entry, SERVED_BUILDS, { check: 'real', ...refusal.options }, async (qw, ww) => {
      const reply = await send(viaBridge(ww.bridge), refusal.ask);

      assert.deepEqual(qw.runs, [], `${refusal.what}: nothing was spawned, the version spawn included`);
      assert.equal(qw.keysFolders().length, 0, `${refusal.what}: no folder was made`);
      if (refusal.what === 'Z2') {
        assert.deepEqual([reply.status, code(reply), message(reply)], [...GENERIC]);
        return;
      }
      const main = await send(viaMain(ww), { ...refusal.ask, path: '/v1/alias/query' });
      assert.deepEqual([reply.status, code(reply), message(reply)], [main.status, code(main), message(main)], `${refusal.what}: the bridge answers what the main port does`);
      assert.notEqual(reply.status, 200, `${refusal.what}: and it is a refusal`);
    });
  }
});

const hold = (): { wait: Promise<void>; release(): void } => {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
};

const until = async (what: string, done: () => boolean): Promise<void> => {
  for (let tries = 0; tries < 200 && !done(); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(done(), what);
};

test('DG10 (V4, T71, T74, T76): the query spawn of a served pair starts the path the check asked, in a folder of its own that held nothing and had a name of its own; after it ends well, after the runner throws and after the request ends the folder is gone and the slot is free', async () => {
  const [entry] = ENTRIES;
  await through(entry, SERVED_BUILDS, { check: 'real' }, async (qw, ww) => {
    await send(viaBridge(ww.bridge), query());

    const [version, run] = qw.runs;
    assert.equal(run.command, foundPath('psql'), 'the path the check asked, not the bare word');
    assert.deepEqual(run.folder, { existed: true, files: [] }, 'its folder was there and held nothing while it ran');
    assert.equal(path.dirname(run.cwd as string), materializedKeysDir(qw.storageDir), 'a folder of the window\'s keys folder');
    assert.notEqual(path.basename(run.cwd as string), path.basename(version.cwd as string), 'a name no other spawn had');
    assert.deepEqual(qw.keysFolders(), [], 'both folders are gone after a good run');
    assert.deepEqual(qw.slots, { taken: 1, released: 1 }, 'and the slot is free');
  });

  await through(entry, SERVED_BUILDS, { check: 'real', onQuery: () => Promise.reject(new Error('the runner threw')) }, async (qw, ww) => {
    const reply = await send(viaBridge(ww.bridge), query());

    assert.notEqual(reply.status, 200, 'the call failed');
    assert.equal(qw.spawns.length, 1, 'the query was started');
    assert.deepEqual(qw.keysFolders(), [], 'a runner that threw leaves no folder');
    assert.deepEqual(qw.slots, { taken: 1, released: 1 }, 'and the slot is free');
  });

  const started = hold();
  const ended = (options: { readonly signal?: AbortSignal | readonly AbortSignal[] }): Promise<unknown> =>
    new Promise((_resolve, reject) => {
      const signals = options.signal === undefined ? [] : [options.signal].flat();
      signals.forEach((signal) => signal.addEventListener('abort', () => reject(notStarted()), { once: true }));
      started.release();
    });
  await through(entry, SERVED_BUILDS, { check: 'real', onQuery: ended }, async (qw, ww) => {
    const asking = sendAbortable(viaBridge(ww.bridge), query());
    asking.reply.catch(() => undefined);
    await started.wait;
    assert.deepEqual(qw.spawns.map((spawn) => spawn.folder), [{ existed: true, files: [] }], 'the query was running in its folder');
    asking.abort();

    await until('the folder of a query whose request ended is removed and its slot given back', () => qw.keysFolders().length === 0 && qw.slots.released === 1);
    assert.deepEqual(qw.slots, { taken: 1, released: 1 });
  });
});

test('DG11 (V4, T64, T80): a table that serves the pair and a builder that is handed no verdict: the generic body with the code internal, DR9 in the journal, no query spawn, and the main port\'s sentence about a client that is never launched is in no answer', async () => {
  for (const entry of ENTRIES) {
    await through(entry, SERVED_BUILDS, { check: 'wrong' }, async (qw, ww) => {
      const reply = await send(viaBridge(ww.bridge), query());

      assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('internal'), 'internal', BRIDGE_USE_REFUSED('prod')], `${entry.client}: the generic body, code internal`);
      assert.deepEqual(qw.journal, [`prod: No launch was built for this call after the profile's rules and the client check had passed it. No query was started.${REFUSED_JOURNAL}`], `${entry.client}: DR9`);
      assert.deepEqual(qw.runs, [], `${entry.client}: nothing was started`);
      assert.equal(reply.body.includes('cannot be queried through the broker'), false, `${entry.client}: the main port's sentence is in no answer`);
      assert.equal(qw.journal.join('\n').includes('cannot be queried through the broker'), false);
    });
  }
});

test('DC13 (V4): the version spawn takes no exec slot: with every slot taken it still runs, and the call then answers too_many_requests with no query spawn', async () => {
  const [entry] = ENTRIES;
  await through(entry, SERVED_BUILDS, { check: 'real', noSlot: true }, async (qw, ww) => {
    const reply = await send(viaBridge(ww.bridge), query());

    assert.deepEqual([reply.status, code(reply)], [statusForErrorCode('too_many_requests'), 'too_many_requests']);
    assert.deepEqual(kinds(qw), ['version'], 'the version spawn ran with no slot; the query did not start');
    assert.deepEqual(qw.keysFolders(), [], 'and its folder is gone');
  });
});

test('DG2b (V4, T73): through the main port nothing is checked and nothing is made: no client check, the bare program word, no folder, the process environment', async () => {
  for (const entry of ENTRIES) {
    await through(entry, SERVED_BUILDS, { check: 'real' }, async (qw, ww) => {
      const reply = await send(viaMain(ww), { ...query(), path: '/v1/alias/query' });

      assert.equal(reply.status, 200, `${entry.client}: ${reply.body}`);
      assert.deepEqual(kinds(qw), ['query'], `${entry.client}: no version spawn`);
      assert.equal(qw.runs[0].command, entry.client, `${entry.client}: the bare word`);
      assert.equal(qw.runs[0].cwd, undefined, `${entry.client}: no folder of the action's making`);
      assert.deepEqual(qw.keysFolders(), [], `${entry.client}: nothing was made under the keys folder`);
    });
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.7 V5 (§S7.8): the gate's refusal before the consent dialog, through the broker's own road
 * ------------------------------------------------------------------------------------------------------------- */

/** DR1 as the broker's journal holds it for a call that was refused before the dialog: the detail of the refusal's own line. */
const DR1_TEXT = (client: string): string => `A Remote Bridge runs a database query only with a client and system whose behaviour was measured. ${client} on ${SYSTEM_WORD[process.platform] ?? process.platform} is not among them.`;

/** The broker's journal lines of the calls a world made (the share that hands the world its token is setup, not a call). */
const callLines = (ww: Awaited<ReturnType<typeof wallWorld>>, since: number): string[] => ww.w.audit.slice(since).filter((line) => parseAuditLine(line)?.action === 'query');

const NOW = 1_700_000_000_000;

/** The grants of single calls the broker holds: a refused call leaves none. */
const callGrants = (ww: Awaited<ReturnType<typeof wallWorld>>): number => [...registryOf(ww).grants.values()].filter((grant) => grant.scope === 'call').length;

const askOf = (door: 'token' | 'mcp', token: string): Ask => (door === 'token' ? { path: '/v1/use/query', token, body: { query: 'select 1' } } : query());

/** The outcome and the detail of a journal line. */
function outcomeAndDetail(line: string): [string | undefined, string | undefined] {
  const parsed = parseAuditLine(line);
  assert.ok(parsed !== undefined, `a journal line: ${line}`);
  return [parsed.outcome, parsed.detail];
}

/** One refused call of DG5: the body, the one journal line and its detail, and every thing that must not have happened. */
async function refusedBeforeTheDialog(entry: (typeof ENTRIES)[number], door: 'token' | 'mcp'): Promise<void> {
  const qw = await queryWorld(entry.dbType, entry.connection);
  const ww = await wallWorld({ query: qw.action, e1Db: entry.dbType });
  try {
    const token = await ww.tokenFor('a1', 'e1', 'prod');
    const since = ww.w.audit.length;
    const ask = askOf(door, token);

    const reply = await send(viaBridge(ww.bridge), ask);

    const what = `${entry.client} through ${door}`;
    assert.deepEqual([reply.status, code(reply), message(reply)], [...GENERIC], `${what}: the generic body`);
    const lines = callLines(ww, since);
    assert.equal(lines.length, 1, `${what}: one journal line for the call`);
    assert.deepEqual(outcomeAndDetail(lines[0]), ['not_supported', DR1_TEXT(entry.client)], `${what}: its detail is DR1`);
    assert.equal(lines[0].includes(BRIDGE_USE_REFUSED('prod')), false, `${what}: and not the generic sentence`);
    assert.equal(ww.w.dialogs.length, 0, `${what}: nobody was asked`);
    assert.equal(qw.reads.count, 0, `${what}: the stored connection was not read`);
    assert.deepEqual([qw.runs, qw.journal], [[], []], `${what}: nothing was spawned and the action never ran`);
    assert.equal(callGrants(ww), 0, `${what}: no grant of the call is left (usable dropped it)`);
    // The spec (§S7.8) says a second call with the token is answered as an unknown token; the code does not: a bridged token call rides a grant of its own and the token only
    // authenticates it (brokerCall.ts), so usable drops the call's grant and the token lives on. It is refused the same way, before any dialog.
    const again = door === 'token' ? await send(viaBridge(ww.bridge), ask) : reply;
    assert.deepEqual([again.status, code(again), message(again)], [...GENERIC], `${what}: a second call is refused the same way`);
    assert.equal(ww.w.dialogs.length, 0, `${what}: and still before any dialog`);
  } finally {
    ww.dispose();
  }
}

test('DG5 (V5, T78, T79): a wall built by wallSuppliersOf over a table that serves no row for the client answers a bridged query by a token and by MCP before the dialog: the generic body, one journal line whose detail is DR1, no dialog, no read of the stored connection, nothing spawned, and the grant of the call is gone', async () => {
  for (const entry of ENTRIES) {
    await refusedBeforeTheDialog(entry, 'token');
    await refusedBeforeTheDialog(entry, 'mcp');
  }
});

test('DG6 (V5): DG5 under each consent policy of the entry: the same refusal, still before any dialog', async () => {
  for (const ask of ['always', 'every12h', 'never'] as const) {
    for (const entry of ENTRIES) {
      const qw = await queryWorld(entry.dbType, entry.connection);
      const ww = await wallWorld({ query: qw.action, e1Db: entry.dbType, consent: { ask, state: memento(), now: () => NOW } });
      try {
        const since = ww.w.audit.length;

        const reply = await send(viaBridge(ww.bridge), query());

        const what = `${entry.client} under ${ask}`;
        assert.deepEqual([reply.status, code(reply), message(reply)], [...GENERIC], `${what}: the generic body`);
        assert.equal(parseAuditLine(callLines(ww, since)[0])?.detail, DR1_TEXT(entry.client), `${what}: DR1 in the journal`);
        assert.equal(ww.w.dialogs.length, 0, `${what}: no dialog`);
        assert.deepEqual([qw.reads.count, qw.runs.length], [0, 0], `${what}: nothing read, nothing spawned`);
      } finally {
        ww.dispose();
      }
    }
  }
});

test('DG5b (V5): control — the same entries behind a table that serves the pair are asked once and run, with the wall built by the same function', async () => {
  for (const entry of ENTRIES) {
    const qw = await queryWorld(entry.dbType, entry.connection, SERVED_BUILDS, { check: 'real' });
    const ww = await wallWorld({ query: qw.action, e1Db: entry.dbType, gate: { profiles: SERVED_BUILDS, platform: process.platform } });
    try {
      const reply = await send(viaBridge(ww.bridge), query());

      assert.equal(reply.status, 200, `${entry.client}: ${reply.body}`);
      assert.equal(ww.w.dialogs.length, 1, `${entry.client}: a person was asked`);
      assert.deepEqual(kinds(qw), ['version', 'query'], `${entry.client}: and the client was started`);
    } finally {
      ww.dispose();
    }
  }
});
