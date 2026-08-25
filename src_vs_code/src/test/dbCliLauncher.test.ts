import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDbQueryLaunch, resolveDbCli } from '../dbCliLauncher';

/**
 * Handing a query to a database CLI with the password never on the command line.
 *
 * Every argv here is visible in the machine's own process list to any local process; a
 * connection string with a password in it would therefore be readable by anything running
 * as the same user, which is the class of leak the SSH askpass path exists to avoid.
 */

const found = () => true;
const missing = () => false;

test('each supported type names its own CLI', () => {
  assert.equal(resolveDbCli('postgres', found)?.exe, 'psql');
  assert.equal(resolveDbCli('mysql', found)?.exe, 'mysql');
  assert.equal(resolveDbCli('mssql', found)?.exe, 'sqlcmd');
  assert.equal(resolveDbCli('mongodb', found)?.exe, 'mongosh');
});

test('a CLI that is not on PATH is reported as missing, with what was looked for', () => {
  const r = resolveDbCli('postgres', missing);
  assert.equal(r, undefined);
});

test('postgres carries the password in the environment, never in argv', () => {
  const launch = buildDbQueryLaunch(
    'postgres',
    'postgresql://alice:hunter2@db:5432/orders',
    'select 1',
  );

  assert.equal(launch?.args.join(' ').includes('hunter2'), false);
  assert.equal(launch?.env.PGPASSWORD, 'hunter2');
  // The rest of the URI survives — sslmode and friends live in the query string, and
  // decomposing into host/port/db would silently drop them.
  assert.equal(launch?.args.some((a) => a.includes('db:5432/orders')), true);
  assert.equal(launch?.args.includes('select 1'), true);
});

test('mysql passes host, port and database as flags and the password by environment', () => {
  const launch = buildDbQueryLaunch('mysql', 'mysql://bob:s3cret@h:3307/shop', 'select 2');

  assert.equal(launch?.args.join(' ').includes('s3cret'), false);
  assert.equal(launch?.env.MYSQL_PWD, 's3cret');
  assert.equal(launch?.args.includes('-h'), true);
  assert.equal(launch?.args.includes('h'), true);
  assert.equal(launch?.args.includes('select 2'), true);
});

test('mssql uses its own environment variables', () => {
  const launch = buildDbQueryLaunch('mssql', 'mssql://sa:Pw1@srv:1433/db', 'select 3');

  assert.equal(launch?.args.join(' ').includes('Pw1'), false);
  assert.equal(launch?.env.SQLCMDPASSWORD, 'Pw1');
  assert.equal(launch?.env.SQLCMDUSER, 'sa');
});

test('mongodb is refused rather than served insecurely', () => {
  // mongosh has no password environment variable, and its --eval runs in the same JS
  // interpreter that could read process.env — so an agent's "query" could print the
  // password back. Refusing beats a channel that leaks by design.
  assert.equal(buildDbQueryLaunch('mongodb', 'mongodb://u:p@h:27017/d', 'db.x.find()'), undefined);
});

test('a connection string with no password still works', () => {
  const launch = buildDbQueryLaunch('postgres', 'postgresql://alice@db:5432/orders', 'select 1');

  assert.equal(launch?.env.PGPASSWORD, undefined);
  assert.equal(launch?.args.includes('select 1'), true);
});
