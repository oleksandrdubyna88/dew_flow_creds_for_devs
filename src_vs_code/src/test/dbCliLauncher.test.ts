import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDbQueryLaunch, isSafePostgresUri, refuseQuery, resolveDbCli } from '../dbCliLauncher';

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

test('isSafePostgresUri accepts a real URL and rejects anything that could be an option', () => {
  // A stored dbConnection arrives by sync, Accept Share or external import — it is data
  // from elsewhere, so "it is a postgres URL" has to be proven, not assumed.
  assert.equal(isSafePostgresUri('postgresql://alice:pw@db:5432/orders'), true);
  assert.equal(isSafePostgresUri('postgres://db/orders'), true);
  assert.equal(isSafePostgresUri('-o|touch /tmp/pwned'), false); // the injection payload
  assert.equal(isSafePostgresUri('--help'), false);
  assert.equal(isSafePostgresUri('host=db user=alice'), false); // conninfo, not a URL
  assert.equal(isSafePostgresUri(''), false);
});

test('postgres hands the connection string as a `--`-guarded positional, never an option', () => {
  const launch = buildDbQueryLaunch('postgres', 'postgresql://alice:pw@db:5432/orders', 'select 1');
  const args = launch?.args ?? [];
  const sep = args.indexOf('--');
  assert.notEqual(sep, -1); // there IS a `--`
  // the connection string comes AFTER it, so psql's getopt can never read it as an option
  const uriIdx = args.findIndex((a) => a.includes('db:5432/orders'));
  assert.equal(uriIdx > sep, true);
  // and -c / the query stay BEFORE the `--`, as real options
  assert.equal(args.indexOf('-c') < sep, true);
  assert.equal(args.indexOf('select 1') < sep, true);
});

test('a postgres connection string that could carry psql options is refused, not launched', () => {
  // psql's own `-o |command` opens a pipe through a shell; a leading-dash bare argument
  // reaches that parser. The launcher must refuse it rather than build a psql invocation.
  assert.equal(buildDbQueryLaunch('postgres', '-o|touch /tmp/pwned', 'select 1'), undefined);
});

/**
 * Client meta-commands are a shell escape, and the shell inherits the password.
 *
 * The broker's promise is that an agent can USE a database credential without ever
 * receiving it. Every SQL client here has a client-side command language that runs local
 * programs — psql's `\!`, mysql's `\!` / `system`, sqlcmd's `:!!` — and the child process
 * carries the password in its environment by design (PGPASSWORD, MYSQL_PWD,
 * SQLCMDPASSWORD). So `\! echo $PGPASSWORD` is a syntactically valid "query" whose stdout
 * IS the password, returned to the agent verbatim, with no further consent after the first
 * Allow. mongodb was refused for exactly this reason; these three were not checked against
 * it. Prove the shape, never sanitize.
 */

const PG = 'postgresql://alice:hunter2@db:5432/orders';
const MY = 'mysql://alice:hunter2@db:3306/orders';
const MS = 'mssql://alice:hunter2@db:1433/orders';
// Spelled out rather than escaped: a backslash literal is exactly the character that gets
// mangled by every layer between an editor and a test file, and this test is ABOUT it.
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);

test('psql: a backslash meta-command is refused, whatever it is', () => {
  for (const q of [
    BS + '! echo $PGPASSWORD',
    '  ' + BS + '! id',
    BS + "copy t to program 'cat'",
    'select 1;' + NL + BS + '! id',
  ]) {
    assert.notEqual(refuseQuery('postgres', q), undefined, `should refuse: ${q}`);
    assert.equal(buildDbQueryLaunch('postgres', PG, q), undefined, `should not launch: ${q}`);
  }
});

test('psql: ordinary SQL, including a backslash inside a string, still runs', () => {
  for (const q of ['select 1', "select E'" + BS + "n'", 'select * from t where x = 1;']) {
    assert.equal(refuseQuery('postgres', q), undefined, `should allow: ${q}`);
    assert.notEqual(buildDbQueryLaunch('postgres', PG, q), undefined);
  }
});

test('mysql: any backslash is refused — the client executes \\! wherever it sees it outside quotes', () => {
  for (const q of [BS + '! id', 'select 1 ' + BS + '! id', 'select 1; ' + BS + '. /etc/passwd']) {
    assert.notEqual(refuseQuery('mysql', q), undefined, `should refuse: ${q}`);
    assert.equal(buildDbQueryLaunch('mysql', MY, q), undefined);
  }
});

test('mysql: long-form client commands at a statement start are refused', () => {
  for (const q of [
    'system id',
    'SYSTEM id',
    'select 1; system id',
    'select 1;' + NL + 'source /etc/passwd',
    'tee /tmp/out',
    'pager cat',
  ]) {
    assert.notEqual(refuseQuery('mysql', q), undefined, `should refuse: ${q}`);
  }
  // A word that merely begins with the same letters is SQL, not a command.
  assert.equal(refuseQuery('mysql', 'select system_user()'), undefined);
  assert.equal(refuseQuery('mysql', 'select * from pager_log'), undefined);
});

test('sqlcmd: a line starting with ":" or "!!" is a client command and is refused', () => {
  for (const q of [
    ':!! echo %SQLCMDPASSWORD%',
    '!! whoami',
    ':r c:' + BS + 'x.sql',
    'select 1' + NL + 'GO' + NL + ':!! id',
    '  :out c:' + BS + 'dump.txt',
  ]) {
    assert.notEqual(refuseQuery('mssql', q), undefined, `should refuse: ${q}`);
    assert.equal(buildDbQueryLaunch('mssql', MS, q), undefined);
  }
  assert.equal(refuseQuery('mssql', 'select 1'), undefined);
});

test('sqlcmd: scripting-variable substitution is switched off, so $(SQLCMDPASSWORD) is text', () => {
  // sqlcmd resolves $(NAME) from its scripting variables and then from the environment —
  // SQLCMDPASSWORD included. -x makes the sequence literal.
  const launch = buildDbQueryLaunch('mssql', MS, "select '$(SQLCMDPASSWORD)'");
  assert.notEqual(launch, undefined);
  assert.ok(launch!.args.includes('-x'), `args: ${launch!.args.join(' ')}`);
});

test('the refusal names the escape, so the agent learns what not to do', () => {
  const reason = refuseQuery('postgres', BS + '! id') ?? '';
  assert.ok(/meta-command|backslash/i.test(reason), reason);
  assert.ok(reason.includes('password'), 'says what the refusal protects');
});
