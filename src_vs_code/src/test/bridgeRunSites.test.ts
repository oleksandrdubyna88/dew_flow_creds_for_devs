import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentUseDeps, dbQueryAction as DbQueryAction } from '../agentUseActions';
import type { DbType, EntityMetadata } from '../types';
import { LinksWorld, linksWorld } from './bridgeLinksWorld';
import { memoryStorage, seedEntry } from './pinWorld';
import { Ask, Door, WallWorld, send, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';
import { loadWithVscode } from './vscodeStub';

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
}

/**
 * The real `dbQueryAction` over the REAL `StorageManager` holding one stored connection (a real `database connection` slot, in the clear); the
 * spawner is a recorder that answers `OUTPUT`. The deps are a typed `AgentUseDeps` built from real defaults: nothing is cast.
 */
async function queryWorld(dbType: DbType, connection: string): Promise<QueryWorld> {
  const spawns: Spawn[] = [];
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
  const deps: AgentUseDeps & { onPath: (exe: string) => boolean } = {
    storage,
    storageDir: '/unused',
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: () => undefined,
    trustStore: { get: () => [], update: () => Promise.resolve() },
    applyEnv: () => Promise.resolve({ written: [], withheld: [] }),
    onPath: () => true,
  };
  return { action: dbQueryAction(deps), spawns };
}

const QUERY_SENTENCE = 'The database client runs on this computer, using the connection stored in "prod". Its output goes back to the agent on that server.';
const EXEC_SENTENCE = 'The connection starts on this computer; the command runs on "prod", and its output goes back to that server.';
const SAVED_FALSE = 'only its output goes to that server';

const query = (path: string): Ask => ({ path, body: { entry: 'e1', alias: 'one', query: 'select 1' } });

/** The word after a flag on an argv. */
const after = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

/**
 * The three clients: the stored connection, the program, and what each puts where. The launcher's own places (`dbCliLauncher.ts`):
 * postgres takes the whole URI, user and database in it, minus its password, after `--`; mysql `-h`, `-P`, `-u`, `-D`; sqlcmd `-S host,port` and
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
    pointsAtTheEntry: ({ args }) => after(args, '--') === 'postgresql://app@db.example.test:5433/orders',
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
      const qw = await queryWorld(client.dbType, client.connection);
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
        assert.equal(spawn.command, client.command, `${what}: the spawned program is the database client`);
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

test('Q4 (E1.6): the environment of a bridged database client is the allow-list and its password variable; through the main port the process environment is there', async () => {
  const before = process.env.PGOPTIONS;
  process.env.PGOPTIONS = '-c search_path=somewhere-else';
  try {
    const qw = await queryWorld('postgres', 'postgresql://app:pw-one@db.example.test:5433/orders');
    const ww = await wallWorld({ query: qw.action });
    try {
      assert.equal((await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'))).status, 200);
      assert.equal((await send(viaMain(ww), query('/v1/alias/query'))).status, 200);
      const allowed = ['PATH', 'HOME'].filter((name) => process.env[name] !== undefined);
      assert.deepEqual(Object.keys(qw.spawns[0].env).sort(), [...allowed, 'PGPASSWORD'].sort(), 'through the bridge');
      assert.equal(qw.spawns[1].env.PGOPTIONS, '-c search_path=somewhere-else', 'through the main port: the whole environment, as today');
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
});
