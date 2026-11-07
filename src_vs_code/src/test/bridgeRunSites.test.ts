import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { dbQueryAction as DbQueryAction } from '../agentUseActions';
import type { DbType } from '../types';
import { LinksWorld, linksWorld } from './bridgeLinksWorld';
import { Ask, Door, WallWorld, send, viaBridge, wallWorld } from './bridgeWallWorld';
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

/** The real `dbQueryAction` for one stored connection; the spawner is a recorder that answers `OUTPUT`. */
function queryWorld(dbType: DbType, connection: string): QueryWorld {
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
  const { dbQueryAction } = loadWithVscode<{ dbQueryAction: typeof DbQueryAction }>('../agentUseActions', { window: {} }, mocks);
  const deps = {
    storage: {
      getNode: () => ({ details: { id: 'e1', name: 'prod', kind: 'db', dbType } }),
      getDbConnection: () => Promise.resolve(connection),
    },
    storageDir: '/unused',
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: () => undefined,
    onPath: () => true,
  };
  return { action: dbQueryAction(deps as never), spawns };
}

const QUERY_SENTENCE = 'The database client runs on this computer, using the connection stored in "prod". Its output goes back to the agent on that server.';
const EXEC_SENTENCE = 'The connection starts on this computer; the command runs on "prod", and its output goes back to that server.';
const SAVED_FALSE = 'only its output goes to that server';

const query = (path: string): Ask => ({ path, body: { entry: 'e1', alias: 'one', query: 'select 1' } });

/** The stored connections of the three clients: what each puts on its own argv, the part that names the database the SQL runs on. */
const CLIENTS: readonly { readonly dbType: DbType; readonly connection: string; readonly command: string; readonly names: (args: string[]) => boolean }[] = [
  { dbType: 'postgres', connection: 'postgresql://app:pw-one@db.example.test:5433/orders', command: 'psql', names: (args) => args[args.indexOf('--') + 1] === 'postgresql://app@db.example.test:5433/orders' },
  { dbType: 'mysql', connection: 'mysql://app:pw-two@db.example.test:3307/orders', command: 'mysql', names: (args) => args[args.indexOf('-h') + 1] === 'db.example.test' && args[args.indexOf('-P') + 1] === '3307' },
  { dbType: 'mssql', connection: 'Server=db.example.test,1444;Database=orders;User Id=app;Password=pw-three', command: 'sqlcmd', names: (args) => args[args.indexOf('-S') + 1] === 'db.example.test,1444' },
];

test('C10 (change 6.2): a bridged query says the database client runs here with the connection stored in the entry — and the client IS spawned here, with that connection, and the body is its output alone', async () => {
  for (const client of CLIENTS) {
    const qw = queryWorld(client.dbType, client.connection);
    const ww = await wallWorld({ query: qw.action });
    try {
      const reply = await send(viaBridge(ww.bridge), query('/v1/mcp/use/query'));
      assert.equal(reply.status, 200, `${client.dbType}: ${reply.body}`);
      const dialog = ww.w.dialogs[0];
      assert.equal(dialog.split('\n')[2], `Through the Remote Bridge of "prod server". ${QUERY_SENTENCE}`, `${client.dbType}: the words`);
      assert.equal(dialog.includes(SAVED_FALSE), false, `${client.dbType}: the saved sentence is gone`);
      // The observation beside the words: one spawn, on this computer, of the database client, never of a shell, naming the entry's own database.
      assert.equal(qw.spawns.length, 1, `${client.dbType}: exactly one process was spawned, here`);
      const [spawn] = qw.spawns;
      assert.equal(spawn.command, client.command, `${client.dbType}: the spawned program is the database client`);
      assert.equal(spawn.shell, false, `${client.dbType}: no shell`);
      assert.ok(client.names(spawn.args), `${client.dbType}: the client is pointed at the entry's own connection: ${spawn.args.join(' ')}`);
      assert.ok(spawn.args.includes('select 1') || spawn.args.includes(' select 1'), `${client.dbType}: the agent's SQL is an argument to the client, run by the database`);
      assert.equal(spawn.args.some((arg) => arg.includes('pw-')), false, `${client.dbType}: the stored password is in no argument`);
      // The recipient: the body is the client's output and nothing else.
      assert.deepEqual(JSON.parse(reply.body), OUTPUT, `${client.dbType}: the body holds the client's output alone`);
    } finally {
      ww.dispose();
    }
  }
});

test('C10 (change 6.2): the same words and the same launch through the alias and token doors', async () => {
  for (const door of ['alias', 'token'] as const) {
    const qw = queryWorld('postgres', CLIENTS[0].connection);
    const ww = await wallWorld({ query: qw.action });
    try {
      const token = await ww.tokenFor('a1', 'e1', 'prod');
      const ask: Ask = door === 'alias' ? query('/v1/alias/query') : { path: '/v1/use/query', token, body: { query: 'select 1' } };
      const reply = await send(viaBridge(ww.bridge), ask);
      assert.equal(reply.status, 200, `${door}: ${reply.body}`);
      assert.equal(ww.w.dialogs[0].split('\n')[2], `Through the Remote Bridge of "prod server". ${QUERY_SENTENCE}`, `${door}: the words`);
      assert.deepEqual(qw.spawns.map((spawn) => spawn.command), ['psql'], `${door}: the client, here`);
      assert.deepEqual(JSON.parse(reply.body), OUTPUT, `${door}: its output alone`);
    } finally {
      ww.dispose();
    }
  }
});

/** The destination `ssh` is given after `--`: the last word of the argv the real action composed for the entry. */
const destinationOf = (argv: string[]): string => argv[argv.indexOf('--') + 1];

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
    assert.equal(destinationOf(lw.runs[0].argv), 'deploy@prod.corp.com', `the destination after "--" is the entry's: ${lw.runs[0].argv.join(' ')}`);
    assert.equal(lw.runs[0].argv.includes('id'), true, 'and the agent\'s command is what runs there');
    // The recipient: the command's output goes back to the agent as the body.
    const body = JSON.parse(reply.body) as { exitCode: number; stdout: string; stderr: string };
    assert.deepEqual([body.exitCode, body.stdout, body.stderr], [0, 'ok\n', ''], 'the body is the output of the command');
  } finally {
    ww.dispose();
    lw.cleanup();
  }
});
