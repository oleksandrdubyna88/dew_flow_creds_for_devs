import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import type { AgentUseDeps, dbQueryAction as DbQueryAction } from '../agentUseActions';
import { BRIDGE_USE_REFUSED } from '../bridgeScope';
import type { DbProfileRow } from '../bridgedDbProfile';
import type { DbClientCheck } from '../bridgedDbClient';
import type { DbType, EntityMetadata } from '../types';
import { LinksWorld, linksWorld } from './bridgeLinksWorld';
import { memoryStorage, seedEntry } from './pinWorld';
import { Ask, Door, WallWorld, send, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';
import { loadWithVscode } from './vscodeStub';
import { statusForErrorCode } from '../brokerProtocol';
import { allowListedNames } from './bridgeLinksRun';
import { code, message } from './bridgeDoorHarness';
import { DR5, dr2, dr4, dr6 } from './bridgedDbCases';
import type { DbVendor } from '../bridgedDbClient';
import { FOUND, verdictOf } from './bridgedDbVerdicts';

/**
 * Destination and recipient (change 6.2; the parent's §7): each run-site sentence of a bridged dialog is asserted BESIDE an observation of
 * what it describes, never by its words alone. A sentence about where something runs and who receives the data is a fact about a spawn:
 * a test that compares strings would pass on a sentence that is false, which is how the saved `query` line stayed wrong through every review.
 *
 * <p>`query`: the REAL `dbQueryAction` over a vault that holds a stored connection, with only `runBounded` (the one spawner it has) replaced by
 * a recorder. `exec`: the REAL `sshExecAction` of `bridgeLinksWorld`, with its `runSshExec` replaced by the recorder that world already has.
 * Both through a real bridge listener, in front of a dialog the world records.</p>
 */

const OUTPUT = { exitCode: 0, stdout: '1\n', stderr: '', stdoutTruncated: false, stderrTruncated: false, timedOut: false, durationMs: 1 };

interface Spawn {
  readonly command: string;
  readonly args: string[];
  readonly shell: boolean;
  readonly env: NodeJS.ProcessEnv;
}

interface QueryWorld {
  readonly action: unknown;
  readonly spawns: Spawn[];
  /** The lines the action wrote to the agent journal (`deps.note`). */
  readonly journal: string[];
  /** How many times the stored connection was read. */
  readonly reads: { count: number };
}

/** A table that serves the three clients on this platform: what a test that runs the launch (C10, Q4, DG3) names, since production serves no pair (§S6.15 Z1). */
const SERVED: readonly DbProfileRow[] = (['psql', 'mysql', 'sqlcmd'] as const).map((client) => ({ client, platform: process.platform, served: true }));

/**
 * The real `dbQueryAction` over the REAL `StorageManager` holding one stored connection (a real `database connection` slot, in the clear); the
 * spawner is a recorder that answers `OUTPUT`. The deps are a typed `AgentUseDeps` built from real defaults: nothing is cast.
 */
async function queryWorld(dbType: DbType, connection: string, profiles?: readonly DbProfileRow[]): Promise<QueryWorld> {
  const spawns: Spawn[] = [];
  const journal: string[] = [];
  const reads = { count: 0 };
  const real = require('../sshExecRunner') as Record<string, unknown>;
  const mocks = {
    './sshExecRunner': {
      ...real,
      runBounded: (command: string, args: string[], shell: boolean, options: { env: NodeJS.ProcessEnv }): Promise<unknown> => {
        spawns.push({ command, args, shell, env: options.env });
        return Promise.resolve(OUTPUT);
      },
    },
  };
  const stub = { window: {} };
  const { dbQueryAction } = loadWithVscode<{ dbQueryAction: typeof DbQueryAction }>('../agentUseActions', stub, mocks);
  const storage = memoryStorage(stub);
  await seedEntry(storage, { id: 'e1', name: 'prod', kind: 'db', dbType } as EntityMetadata, { 'database connection': connection });
  const read = storage.getDbConnection.bind(storage);
  storage.getDbConnection = (accountId, entityId) => {
    reads.count += 1;
    return read(accountId, entityId);
  };
  const deps: AgentUseDeps & { onPath: (exe: string) => boolean; profiles?: readonly DbProfileRow[]; dbClient?: DbClientCheck } = {
    storage,
    storageDir: '/unused',
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: (line) => {
      journal.push(line);
    },
    trustStore: { get: () => [], update: () => Promise.resolve() },
    applyEnv: () => Promise.resolve({ written: [], withheld: [] }),
    onPath: () => true,
    // A client check that passes: the vendor each client of the three types is read as. The check itself is the subject of `bridgedDbClient.test.ts` and of DG7-DG11 below.
    dbClient: (call) => Promise.resolve(verdictOf(VENDOR_OF[call.client])),
    ...(profiles === undefined ? {} : { profiles }),
  };
  return { action: dbQueryAction(deps), spawns, journal, reads };
}

/** The vendor a passing check reads for each client. */
const VENDOR_OF: Readonly<Record<'psql' | 'mysql' | 'sqlcmd', DbVendor>> = { psql: 'postgresql', mysql: 'oracle', sqlcmd: 'odbc-sqlcmd' };

const QUERY_SENTENCE = 'The database client runs on this computer, using the connection stored in "prod". Its output goes back to the agent on that server.';
const EXEC_SENTENCE = 'The connection starts on this computer; the command runs on "prod", and its output goes back to that server.';
const SAVED_FALSE = 'only its output goes to that server';

const query = (path: string): Ask => ({ path, body: { entry: 'e1', alias: 'one', query: 'select 1' } });

/** The word after a flag on an argv. */
const after = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

/**
 * The three clients: the stored connection, the program, and what each puts where. The launcher's own places (`dbCliLauncher.ts`, on a bridge):
 * postgres takes one keyword string this extension builds, after `--` (host, port, dbname, user, then three controls: never the stored URI); mysql `-h`, `-P`, `-u`, `-D`; sqlcmd `-S host,port` and
 * `-d`, with the USER in the environment (`SQLCMDUSER`); and every password in the client's own environment variable, never in an argument.
 */
const CLIENTS: readonly {
  readonly dbType: DbType;
  readonly connection: string;
  readonly command: string;
  readonly passwordEnv: string;
  readonly password: string;
  /** Whether the argv (and env) point the client at `app` on `db.example.test` and the `orders` database. */
  readonly pointsAtTheEntry: (spawn: Spawn) => boolean;
}[] = [
  {
    dbType: 'postgres',
    connection: 'postgresql://app:pw-one@db.example.test:5433/orders',
    command: 'psql',
    passwordEnv: 'PGPASSWORD',
    password: 'pw-one',
    pointsAtTheEntry: ({ args }) => /^host='db\.example\.test' port='5433' dbname='orders' user='app' passfile='[^']*no-client-file' sslcert='[^']*no-client-file' sslkey='[^']*no-client-file' gssencmode='disable' sslcertmode='disable' require_auth='password,md5,scram-sha-256'$/.test(args[args.length - 1]) && args[args.length - 2] === '--',
  },
  {
    dbType: 'mysql',
    connection: 'mysql://app:pw-two@db.example.test:3307/orders',
    command: 'mysql',
    passwordEnv: 'MYSQL_PWD',
    password: 'pw-two',
    pointsAtTheEntry: ({ args }) => after(args, '-h') === 'db.example.test' && after(args, '-P') === '3307' && after(args, '-u') === 'app' && after(args, '-D') === 'orders',
  },
  {
    dbType: 'mssql',
    connection: 'Server=db.example.test,1444;Database=orders;User Id=app;Password=pw-three',
    command: 'sqlcmd',
    passwordEnv: 'SQLCMDPASSWORD',
    password: 'pw-three',
    pointsAtTheEntry: ({ args, env }) => after(args, '-S') === 'db.example.test,1444' && after(args, '-d') === 'orders' && env.SQLCMDUSER === 'app',
  },
];

const DOORS = ['mcp', 'alias', 'token'] as const;

test('C10 (change 6.2): every client through every door — the sentence says the database client runs here with the entry\'s connection, and the client IS spawned here, pointed at it, and the body is its output alone', async () => {
  for (const client of CLIENTS) {
    for (const door of DOORS) {
      const what = `${client.dbType} through ${door}`;
      const qw = await queryWorld(client.dbType, client.connection, SERVED);
      const ww = await wallWorld({ query: qw.action });
      try {
        const token = await ww.tokenFor('a1', 'e1', 'prod');
        const ask: Ask = {
          mcp: query('/v1/mcp/use/query'),
          alias: query('/v1/alias/query'),
          token: { path: '/v1/use/query', token, body: { query: 'select 1' } },
        }[door];
        const reply = await send(viaBridge(ww.bridge), ask);
        assert.equal(reply.status, 200, `${what}: ${reply.body}`);
        // The words.
        assert.equal(ww.w.dialogs[0].split('\n')[2], `Through the Remote Bridge of "prod server". ${QUERY_SENTENCE}`, `${what}: the words`);
        assert.equal(ww.w.dialogs[0].includes(SAVED_FALSE), false, `${what}: the saved sentence is gone`);
        // The observation beside them: one spawn, on this computer, of the client, never of a shell, pointed at the entry's own connection.
        assert.equal(qw.spawns.length, 1, `${what}: exactly one process was spawned, here`);
        const [spawn] = qw.spawns;
        assert.equal(spawn.command, FOUND[VENDOR_OF[client.command as 'psql' | 'mysql' | 'sqlcmd']], `${what}: the spawned program is the file the client check found, not the bare word`);
        assert.equal(spawn.shell, false, `${what}: no shell`);
        assert.ok(client.pointsAtTheEntry(spawn), `${what}: pointed at the entry's own host, port, user and database: ${spawn.args.join(' ')} ${spawn.env.SQLCMDUSER ?? ''}`);
        assert.equal(spawn.args.filter((arg) => arg.includes('select 1')).length, 1, `${what}: the agent's SQL is one argument to the client, run by the database`);
        assert.equal(spawn.args.some((arg) => arg.includes('pw-')), false, `${what}: the stored password is in no argument`);
        assert.equal(spawn.env[client.passwordEnv], client.password, `${what}: it travels in the client's own environment variable`);
        // The recipient: the body is the client's output and nothing else.
        assert.deepEqual(JSON.parse(reply.body), OUTPUT, `${what}: the body holds the client's output alone`);
        assert.equal(reply.body.includes('pw-'), false, `${what}: and no password`);
      } finally {
        ww.dispose();
      }
    }
  }
});

/** The user and host `bridgeLinksWorld` stores on `e1`. */
const ENTRY_USER = 'deploy';
const ENTRY_HOST = 'prod.corp.com';

/** The destination `ssh` is given after `--`: the last word of the argv the real action composed for the entry. */
const destinationOf = (argv: string[]): string | undefined => after(argv, '--');

test('C10 (change 6.2): a bridged exec says the connection starts here and the command runs on the entry — and ssh is spawned here for the ENTRY\'s own destination, and the output goes back as the body', async () => {
  const lw: LinksWorld = await linksWorld({});
  const ww: WallWorld = await wallWorld({ exec: lw.exec });
  try {
    const door: Door = viaBridge(ww.bridge);
    const reply = await send(door, { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } });
    assert.equal(reply.status, 200, reply.body);
    assert.equal(ww.w.dialogs[0].split('\n')[2], `Through the Remote Bridge of "prod server". ${EXEC_SENTENCE}`, 'the words');
    // The observation beside the words: one ssh, started on this computer, whose destination is the host of the entry the dialog names.
    assert.equal(lw.runs.length, 1, 'one connection was started, here');
    assert.equal(destinationOf(lw.runs[0].argv), `${ENTRY_USER}@${ENTRY_HOST}`, `the destination after "--" is the entry's: ${lw.runs[0].argv.join(' ')}`);
    assert.equal(lw.runs[0].argv.includes('id'), true, 'and the agent\'s command is what runs there');
    // The recipient: the command's output goes back to the agent as the body.
    const body = JSON.parse(reply.body) as { exitCode: number; stdout: string; stderr: string };
    assert.deepEqual([body.exitCode, body.stdout, body.stderr], [0, 'ok\n', ''], 'the body is the output of the command');
  } finally {
    ww.dispose();
    lw.cleanup();
  }
});

/** Q4 (E1.6) for one client: the keys of a bridged spawn's environment are the allow-list, its password variable and the names that close the person's own files (Y6); through the main port the whole process environment is there and none of those names is added. */
async function assertClientEnvironment(dbType: DbType, connection: string, passwordEnv: string, passwordValue: string, closing: readonly string[]): Promise<void> {
  const before = process.env.PGOPTIONS;
  process.env.PGOPTIONS = '-c search_path=somewhere-else';
  try {
    const qw = await queryWorld(dbType, connection, SERVED);
    const ww = await wallWorld({ query: qw.action });
    try {
      assert.equal((await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'))).status, 200);
      assert.equal((await send(viaMain(ww), query('/v1/alias/query'))).status, 200);
      const allowed = allowListedNames();
      assert.deepEqual(Object.keys(qw.spawns[0].env).sort(), [...allowed, passwordEnv, ...closing].sort(), 'through the bridge');
      for (const name of closing) {
        const absent = qw.spawns[0].env[name] as string;
        assert.ok(absent.includes('no-client-file') && !fs.existsSync(absent), `${name} names a path in the keys folder that nothing writes: ${absent}`);
      }
      assert.equal(qw.spawns[1].env.PGOPTIONS, '-c search_path=somewhere-else', 'through the main port: the whole environment, as today');
      assert.deepEqual(qw.spawns[1].env, { ...process.env, [passwordEnv]: passwordValue }, 'through the main port: today\'s environment and nothing added');
    } finally {
      ww.dispose();
    }
  } finally {
    if (before === undefined) {
      delete process.env.PGOPTIONS;
    } else {
      process.env.PGOPTIONS = before;
    }
  }
}

test('Q4a (E1.6, Y6): the environment of a bridged mysql is the allow-list, its password variable and MYSQL_TEST_LOGIN_FILE at a path nothing writes; through the main port the process environment and no such name', async () => {
  await assertClientEnvironment('mysql', 'mysql://app:pw-two@db.example.test:3307/orders', 'MYSQL_PWD', 'pw-two', ['MYSQL_TEST_LOGIN_FILE']);
});

test('Q4b (E1.6, Y6): the environment of a bridged psql is the allow-list, its password variable and PGPASSFILE, PGSSLCERT and PGSSLKEY at a path nothing writes; through the main port the process environment and no such name', async () => {
  await assertClientEnvironment('postgres', 'postgresql://app:pw-one@db.example.test:5433/orders', 'PGPASSWORD', 'pw-one', ['PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY']);
});

/** DR1's words, as the journal line a bridged refusal writes (the form of `bridgedRefusal`). */
const DR1_LINE = (client: string): string => `prod: A Remote Bridge runs a database query only with a client and system whose behaviour was measured. ${client} on ${SYSTEM_WORD[process.platform] ?? process.platform} is not among them. (a Remote Bridge was told only that it could not be used)`;
const SYSTEM_WORD: Partial<Record<NodeJS.Platform, string>> = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' };

test('DG1 (§S6.15 Z1): through the production table a bridged query on each client is refused with the generic sentence, DR1 is in the journal, nothing is spawned and the stored connection is not read', async () => {
  for (const client of CLIENTS) {
    for (const door of DOORS) {
      const what = `${client.dbType} through ${door}`;
      const qw = await queryWorld(client.dbType, client.connection);
      const ww = await wallWorld({ query: qw.action });
      try {
        const token = await ww.tokenFor('a1', 'e1', 'prod');
        const ask: Ask = {
          mcp: query('/v1/mcp/use/query'),
          alias: query('/v1/alias/query'),
          token: { path: '/v1/use/query', token, body: { query: 'select 1' } },
        }[door];
        const readsBefore = qw.reads.count;
        const reply = await send(viaBridge(ww.bridge), ask);
        assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('not_supported'), 'not_supported', BRIDGE_USE_REFUSED('prod')], `${what}: the generic body`);
        assert.deepEqual(qw.spawns, [], `${what}: nothing was spawned`);
        assert.deepEqual(qw.journal, [DR1_LINE(client.command)], `${what}: the journal has DR1 and nothing else`);
        assert.equal(qw.reads.count, readsBefore, `${what}: the gate stands before the stored connection is read`);
        assert.equal(reply.body.includes(client.command), false, `${what}: the body names no client`);
      } finally {
        ww.dispose();
      }
    }
  }
});

/** Entries a bridge refuses and the main port has always served: no password, a service file, a query string, an encryption key (§S6.15 Z2, T53). */
const TODAY_ONLY: readonly { readonly dbType: DbType; readonly connection: string }[] = [
  { dbType: 'postgres', connection: 'postgresql://app@db.example.test/orders?service=s1' },
  { dbType: 'mysql', connection: 'mysql://app@localhost/orders?ssl-mode=DISABLED' },
  { dbType: 'mssql', connection: 'Server=db.example.test;Encrypt=True;User Id=app' },
];

test('DG2 (§S6.15 Z1, Z2): through the main port the same three entries run, as they do today, and so do entries a bridge refuses; the production table is not asked', async () => {
  for (const client of [...CLIENTS, ...TODAY_ONLY.map((entry) => ({ ...entry, command: undefined }))]) {
    const qw = await queryWorld(client.dbType, client.connection);
    const ww = await wallWorld({ query: qw.action });
    try {
      const reply = await send(viaMain(ww), query('/v1/alias/query'));
      assert.equal(reply.status, 200, `${client.dbType}: ${reply.body}`);
      assert.equal(qw.spawns.length, 1, `${client.dbType}: spawned`);
      assert.deepEqual(qw.journal, [], `${client.dbType}: nothing in the journal`);
      assert.equal(qw.spawns[0].args.includes('--protocol=TCP'), false, `${client.dbType}: off a bridge, no flag a bridge adds`);
    } finally {
      ww.dispose();
    }
  }
});

test('DG3 (§S6.15 Z1, Z2): under a table that serves the pair the bridged psql is handed the built string and never the stored URI; mysql is asked over TCP; sqlcmd names its user', async () => {
  const seen: Record<string, Spawn> = {};
  for (const client of CLIENTS) {
    const qw = await queryWorld(client.dbType, client.connection, SERVED);
    const ww = await wallWorld({ query: qw.action });
    try {
      assert.equal((await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'))).status, 200);
      seen[client.dbType] = qw.spawns[0];
    } finally {
      ww.dispose();
    }
  }
  const { postgres, mysql, mssql } = seen;
  assert.equal(postgres.args.some((arg) => arg.includes('postgresql://')), false, 'the stored URI is no argument');
  assert.deepEqual(postgres.args.slice(0, 4), ['-X', '-c', ' select 1', '--']);
  assert.deepEqual(mysql.args.slice(0, 2), ['--no-defaults', '--protocol=TCP']);
  assert.match(mysql.args[2], /^--plugin-dir=.*no-client-file$/);
  assert.deepEqual([mysql.args[3], mysql.args[4]], ['--skip-enable-cleartext-plugin', '-h']);
  assert.equal(mssql.env.SQLCMDUSER, 'app');
});

test('DG4b (§S6.15 Z2): a postgres entry that is not a plain URL is refused on a bridge with the generic body and the profile\'s sentence in the journal; the main port still tells the agent why', async () => {
  const conninfo = 'host=db.example.test user=app password=pw';
  const qw = await queryWorld('postgres', conninfo, SERVED);
  const ww = await wallWorld({ query: qw.action });
  try {
    const reply = await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'));
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('not_supported'), 'not_supported', BRIDGE_USE_REFUSED('prod')], 'the generic body, not the detailed sentence');
    assert.deepEqual(qw.journal, [`prod: ${dr6('connection', 'psql')} (a Remote Bridge was told only that it could not be used)`], 'the detail is in the journal');
    assert.deepEqual(qw.spawns, [], 'nothing was spawned');
    const main = await send(viaMain(ww), query('/v1/alias/query'));
    assert.equal(code(main), 'not_supported', 'off a bridge the same entry is refused');
    assert.ok(message(main).includes('is not a plain postgres:// URL'), `off a bridge the agent is told why: ${message(main)}`);
  } finally {
    ww.dispose();
  }
});

/** An entry the profile refuses, the journal sentence it earns, and the stored connection that earns it: DG4's cases, the sentences written out word for word. */
const DG4_CASES: readonly { readonly what: string; readonly dbType: DbType; readonly connection: string; readonly sentence: string }[] = [
  { what: 'a setting outside the profile', dbType: 'postgres', connection: 'postgresql://app:pw@db.example.test/orders?passfile=/x', sentence: dr2('"passfile"') },
  { what: 'no user', dbType: 'mysql', connection: 'mysql://:pw@db.example.test/orders', sentence: dr4('user') },
  { what: 'no password', dbType: 'mssql', connection: 'Server=db.example.test,1433;Database=orders;User Id=app', sentence: dr4('password') },
  { what: 'a socket host', dbType: 'postgres', connection: 'postgresql://app:pw@%2Fvar%2Frun%2Fpostgresql/orders', sentence: DR5 },
];

test('DG4 (§S6.15 Z2): under a table that serves the pair, an entry the profile refuses answers the generic body, the journal has the rule\'s sentence, and nothing is spawned; the main port runs it', async () => {
  for (const refused of DG4_CASES) {
    const qw = await queryWorld(refused.dbType, refused.connection, SERVED);
    const ww = await wallWorld({ query: qw.action });
    try {
      const reply = await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'));
      assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('not_supported'), 'not_supported', BRIDGE_USE_REFUSED('prod')], `${refused.what}: the generic body`);
      assert.deepEqual(qw.journal, [`prod: ${refused.sentence} (a Remote Bridge was told only that it could not be used)`], `${refused.what}: the journal`);
      assert.deepEqual(qw.spawns, [], `${refused.what}: nothing was spawned`);
      assert.equal(reply.body.includes('pw'), false, `${refused.what}: no value in the body`);
      assert.equal((await send(viaMain(ww), query('/v1/alias/query'))).status, 200, `${refused.what}: control, the main port serves the entry as today`);
      assert.equal(qw.spawns.length, 1, `${refused.what}: and spawns it`);
    } finally {
      ww.dispose();
    }
  }
});
