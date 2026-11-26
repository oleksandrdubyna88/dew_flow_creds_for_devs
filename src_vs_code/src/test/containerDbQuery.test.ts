import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import { BRIDGE_USE_REFUSED } from '../bridgeScope';
import { BRIDGED_DB_PROFILES, CONTAINER_SQLCMD_ROW } from '../bridgedDbProfile';

/** The production table with the container's candidate row turned (it is turned in the commit that adds its CI job). */
const WITH_CONTAINER = BRIDGED_DB_PROFILES.map((row) => (row.client === 'sqlcmd' && row.platform === 'container' ? CONTAINER_SQLCMD_ROW : row));
import { SQLCMD_IN_IMAGE } from '../containerDb';
import { CONTAINER_NOT_READY, type ContainerDeps } from '../containerDbQuery';
import type { DbType } from '../types';
import { message } from './bridgeDoorHarness';
import { type Ask, send, viaBridge, wallWorld } from './bridgeWallWorld';
import { OUTPUT, type QueryWorld, queryWorld } from './bridgedDbQueryWorld';

/**
 * Change 11.1, the 72-hour slice, S3: a bridged database query on Windows runs its client in a Linux container, through the REAL bridge door,
 * the real `dbQueryAction` and the production table. The container tool is a stand-in that records each run and reads the env file while the
 * run is going (that is when the file must exist); the image's probe answers what the real image answered on wslc 3.0.5 (2026-11-26).
 */

/** What the image built from `containers/db-sqlcmd.Containerfile` printed to the probe on the laptop. */
const PROBE_OK = 'Microsoft (R) SQL Server Command Line Tool\nVersion 18.7.0001.1 Linux\nCopyright (C) 2017 Microsoft Corporation. All rights reserved.\n/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.7.so.1.1\nmissing 0\n';
const PASSWORD = 'pw three=x y';
const MSSQL = { dbType: 'mssql' as DbType, connection: `Server=db.example.test,1444;Database=orders;User Id=app;Password=${PASSWORD}` };
const query = (text = 'select 1'): Ask => ({ path: '/v1/mcp/use/query', body: { entry: 'e1', alias: 'one', query: text } });

interface Run {
  readonly program: string;
  readonly argv: string[];
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly envFile?: string;
  readonly envText?: string;
  readonly envMode?: number;
}

/** One run as the tool saw it, with the env file read WHILE the run goes (that is when it must exist). */
function recorded(program: string, argv: string[], env: NodeJS.ProcessEnv | undefined): Run {
  const at = argv.indexOf('--env-file');
  if (at < 0) {
    return { program, argv, env };
  }
  const envFile = argv[at + 1];
  return { program, argv, env, envFile, envText: fs.readFileSync(envFile, 'utf8'), envMode: fs.statSync(envFile).mode & 0o777 };
}

/** The held words every run starts with, and the probe's lack of network. */
function heldRuns(probe: Run, run: Run): void {
  for (const one of [probe, run]) {
    assert.equal(one.program, '/fake/wslc');
    assert.deepEqual(one.argv.slice(0, 8), ['run', '--rm', '--pull', 'never', '--cap-drop', 'ALL', '--user', '65534:65534'], 'removed after, the local image only, no capability, as nobody');
  }
  assert.equal(probe.argv[probe.argv.indexOf('--network') + 1], 'none', 'the probe has no network');
}

/** The password is in no argument and in no variable of the tool; the env file holds it, owner-only, in the storage folder, and is gone after. */
function passwordOnlyInTheFile(runs: Run[], run: Run, storageDir: string): void {
  for (const one of runs) {
    assert.ok(!one.argv.join('\n').includes('pw three'), 'no password in any argument');
    assert.ok(!Object.values(one.env ?? {}).some((value) => String(value).includes('pw three')), 'nor in the tool\'s own environment');
  }
  assert.equal(run.envText, `SQLCMDPASSWORD=${PASSWORD}\nSQLCMDUSER=app\n`, 'the env file holds the password and the user, spaces and = kept');
  envFileHeld(run, storageDir);
}

/** The env file was owner-only, in the storage folder, and is gone after the run. */
function envFileHeld(run: Run, storageDir: string): void {
  const file = String(run.envFile);
  assert.ok(process.platform === 'win32' || run.envMode === 0o600, 'owner-only');
  assert.ok(file.startsWith(storageDir), 'in the extension\'s own storage folder');
  assert.equal(fs.existsSync(file), false, 'removed after the run');
}

/** A stand-in container tool. `probe` is what the image answers; each test names its own image, so no kept verdict crosses tests. */
function tool(image: string, probe: { exitCode: number; stdout: string; stderr?: string } = { exitCode: 0, stdout: PROBE_OK }): { container: ContainerDeps; runs: Run[] } {
  const runs: Run[] = [];
  return {
    runs,
    container: {
      runtime: { tool: '/fake/wslc', image },
      run: (program, argv, options) => {
        runs.push(recorded(program, argv, options.env));
        return Promise.resolve(argv.includes('--network') ? { ...OUTPUT, exitCode: probe.exitCode, stdout: probe.stdout, stderr: probe.stderr ?? '' } : OUTPUT);
      },
    },
  };
}

async function through(entry: { dbType: DbType; connection: string }, container: ContainerDeps, use: (qw: QueryWorld, ask: (text?: string) => ReturnType<typeof send>) => Promise<void>): Promise<void> {
  const qw = await queryWorld(entry.dbType, entry.connection, WITH_CONTAINER, { container });
  const ww = await wallWorld({ query: qw.action });
  try {
    await use(qw, (text) => send(viaBridge(ww.bridge), query(text)));
  } finally {
    ww.dispose();
  }
}

test('S3: a served query runs the client IN the image: probe first (no network), then the query, with the password and the user only in an owner-only env file that is gone after the run', async () => {
  const t = tool('creds-db-sqlcmd:c1');
  await through(MSSQL, t.container, async (qw, ask) => {
    const reply = await ask("select 'a b' as x");
    assert.equal(reply.status, 200, reply.body);
    assert.equal(t.runs.length, 2, 'the probe, then the query');
    const [probe, run] = t.runs;
    heldRuns(probe, run);
    const image = run.argv.indexOf('creds-db-sqlcmd:c1');
    assert.equal(run.argv[image + 1], SQLCMD_IN_IMAGE, 'the client is the image\'s own, by its path there');
    assert.deepEqual(run.argv.slice(image + 2, image + 8), ['-S', 'db.example.test,1444', '-d', 'orders', '-Q', "select 'a b' as x"]);
    passwordOnlyInTheFile(t.runs, run, qw.storageDir);
    assert.deepEqual(qw.spawns, [], 'nothing ran on the host');

    assert.equal((await ask()).status, 200);
    assert.equal(t.runs.filter((one) => one.argv.includes('--network')).length, 1, 'a good verdict of the image is kept: the second query asks no probe');
  });
});

test('S3: psql has no served container row: refused at the gate, before the stored connection is read and before any run', async () => {
  const t = tool('creds-db-sqlcmd:c2');
  await through({ dbType: 'postgres', connection: 'postgresql://app:pw-one@db.example.test:5433/orders' }, t.container, async (qw, ask) => {
    const reply = await ask();
    assert.equal(message(reply), BRIDGE_USE_REFUSED('prod'));
    assert.equal(qw.reads.count, 0, 'the stored connection was not read');
    assert.deepEqual(t.runs, []);
    assert.ok(qw.journal.some((line) => line.includes('a Linux container on this machine')), qw.journal.join('\n'));
  });
});

test('S3: no container tool on this machine: refused, and the journal says how to prepare it; nothing runs', async () => {
  await through(MSSQL, { runtime: undefined }, async (qw, ask) => {
    const reply = await ask();
    assert.equal(message(reply), BRIDGE_USE_REFUSED('prod'));
    assert.ok(qw.journal.some((line) => line.includes(CONTAINER_NOT_READY)), qw.journal.join('\n'));
    assert.deepEqual(qw.spawns, []);
  });
});

test('S3: the image was not built: the probe ends at once (--pull never), the query is refused with the same words, and no env file is written', async () => {
  const t = tool('creds-db-sqlcmd:c4', { exitCode: 125, stdout: '', stderr: 'Error: No such image: creds-db-sqlcmd:c4' });
  await through(MSSQL, t.container, async (qw, ask) => {
    assert.equal(message(await ask()), BRIDGE_USE_REFUSED('prod'));
    assert.ok(qw.journal.some((line) => line.includes(CONTAINER_NOT_READY)), qw.journal.join('\n'));
    assert.equal(t.runs.length, 1, 'the probe alone');
  });
});

test('S3: an image whose client is another build is refused (DR8) and runs no query', async () => {
  const t = tool('creds-db-sqlcmd:c5', { exitCode: 0, stdout: PROBE_OK.replace('18.7.0001.1', '18.6.0001.1').replace('18.7.so.1.1', '18.6.so.1.1') });
  await through(MSSQL, t.container, async (qw, ask) => {
    assert.equal(message(await ask()), BRIDGE_USE_REFUSED('prod'));
    assert.equal(t.runs.length, 1, 'the probe alone');
    assert.ok(qw.journal.some((line) => line.includes('18.6.0001.1')), qw.journal.join('\n'));
  });
});

test('S3: the env file is removed when the run throws too', async () => {
  const t = tool('creds-db-sqlcmd:c6');
  const files: string[] = [];
  const throwing: ContainerDeps = {
    runtime: t.container.runtime,
    run: (program, argv, options) => {
      if (argv.includes('--env-file')) {
        files.push(argv[argv.indexOf('--env-file') + 1]);
        return Promise.reject(new Error('the tool crashed'));
      }
      return (t.container.run as NonNullable<ContainerDeps['run']>)(program, argv, options);
    },
  };
  await through(MSSQL, throwing, async (_qw, ask) => {
    await ask();
    assert.equal(files.length, 1);
    assert.equal(fs.existsSync(files[0]), false, 'removed in the finally');
  });
});

test('S3: the PRODUCTION table serves the container row on the record of its CI run: a bridged sqlcmd query runs in the image, with nothing handed in', async () => {
  assert.equal(BRIDGED_DB_PROFILES.find((row) => row.client === 'sqlcmd' && row.platform === 'container'), CONTAINER_SQLCMD_ROW, 'the production row is the recorded one');
  assert.match(String(CONTAINER_SQLCMD_ROW.clients?.[0].builds[0].record), /^run \d+ at [0-9a-f]{8}$/, 'it names the run that showed its legs');
  const t = tool('creds-db-sqlcmd:c7');
  const qw = await queryWorld(MSSQL.dbType, MSSQL.connection, BRIDGED_DB_PROFILES, { container: t.container });
  const ww = await wallWorld({ query: qw.action });
  try {
    const reply = await send(viaBridge(ww.bridge), query());
    assert.equal(reply.status, 200, reply.body);
    assert.equal(t.runs.length, 2, 'the probe, then the query');
    passwordOnlyInTheFile(t.runs, t.runs[1], qw.storageDir);
    assert.deepEqual(qw.spawns, [], 'nothing ran on the host');
  } finally {
    ww.dispose();
  }
});
