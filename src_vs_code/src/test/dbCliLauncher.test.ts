import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DbType } from '../types';
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

// eslint-disable-next-line complexity
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

// eslint-disable-next-line complexity
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
  assert.equal(launch?.args.includes(' select 1'), true);
});

// eslint-disable-next-line complexity
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
  // refuseQuery stays silent for it on purpose: the caller then reaches buildDbQueryLaunch,
  // whose refusal is the sentence an agent has always seen for mongodb.
  assert.equal(refuseQuery('mongodb', 'db.x.find()'), undefined);
  // mongosh has no password environment variable, and its --eval runs in the same JS
  // interpreter that could read process.env — so an agent's "query" could print the
  // password back. Refusing beats a channel that leaks by design.
  assert.equal(buildDbQueryLaunch('mongodb', 'mongodb://u:p@h:27017/d', 'db.x.find()'), undefined);
});

test('a connection string with no password still works', () => {
  const launch = buildDbQueryLaunch('postgres', 'postgresql://alice@db:5432/orders', 'select 1');

  assert.equal(launch?.env.PGPASSWORD, undefined);
  assert.equal(launch?.args.includes(' select 1'), true);
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
  assert.notEqual(args.indexOf(' select 1'), -1); // indexOf's -1 would make the next line vacuously true
  assert.equal(args.indexOf(' select 1') < sep, true);
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

/**
 * The gate against the client's own commands, row by row (todo/PLAN_query_refuses_client_commands.md §4.1).
 *
 * Every refused input uses the sentinel ZQ9SENT where a command needs an argument, and
 * 127.0.0.2 where it names a host, so the last test can prove that a refusal repeats nothing
 * from the query. Rows named "guard" pass on the unfixed function by design: they pin an allow
 * or an existing refusal so a later edit cannot move it.
 */
const SENT = 'ZQ9SENT';
const HOST2 = '127.0.0.2';
const CR = String.fromCharCode(13);
const BOM = '﻿';
const FW_BS = '＼'; // fullwidth reverse solidus
const FW_COLON = '：';
const FW_SYSTEM = 'ｓｙｓｔｅｍ';

function assertRefused(dbType: DbType, query: string, named?: string): void {
  const reason = refuseQuery(dbType, query);
  assert.notEqual(reason, undefined, `should refuse (${dbType}): ${JSON.stringify(query)}`);
  if (named !== undefined) {
    assert.ok((reason ?? '').includes(`"${named}"`), `should name ${named}: ${reason}`);
  }
}

function refuses(label: string, dbType: DbType, inputs: string[], named?: string): void {
  for (const q of inputs) {
    test(`${label}: ${dbType} refuses ${JSON.stringify(q)}`, () => assertRefused(dbType, q, named));
  }
}

function allows(label: string, dbType: DbType, inputs: string[]): void {
  for (const q of inputs) {
    test(`${label}: ${dbType} allows ${JSON.stringify(q)}`, () => {
      assert.equal(refuseQuery(dbType, q), undefined);
    });
  }
}

const MYSQL_CONNECT = [
  `connect ${SENT} ${HOST2}`,
  `CONNECT ${SENT} ${HOST2}`,
  `select 1;${NL}connect ${SENT} ${HOST2}`,
];
const MYSQL_SSL_PRINT = [`ssl_session_data_print ${SENT}`];
const MYSQL_DELIMITER = ['delimiter //'];
const MYSQL_COMMENT_HIDDEN: Array<[string, string]> = [
  [`/* ; */ connect ${SENT} ${HOST2}`, 'connect'],
  [`/*${NL}*/ connect ${SENT};`, 'connect'],
  [`connect/*x*/ ${SENT};`, 'connect'],
  [`system/*+*/ ${SENT};`, 'system'],
  [`/*!*/ system ${SENT};`, 'system'],
  [`system#x${NL}${SENT}`, 'system'],
  [`system-- x${NL}${SENT}`, 'system'],
  [`/*x*/connect ${SENT}`, 'connect'],
  [`-- x${NL}connect ${SENT}`, 'connect'],
  [`# x${NL}connect ${SENT}`, 'connect'],
  [`  /* a */ /* b */ system ${SENT}`, 'system'],
];
const MYSQL_CR = [`select 1${CR}system ${SENT}`];
const MYSQL_OVER_REFUSED = [`select a,${NL}connect${NL}from t`];
const MYSQL_INSIDE_COMMENT = [
  // Accepted over-refusal (plan 2.1): the split cuts at the end of a block comment and at every
  // line break, so a refused word first on a line INSIDE a multi-line comment is refused. Both
  // real clients would only run the comment and the select; the gate cannot tell a comment's
  // inside from a statement start without parsing SQL, which it refuses to do.
  `/*${NL}system maintenance notes${NL}*/${NL}select 1`,
];
const MYSQL_FOLDED = [`${FW_SYSTEM} ${SENT}`, `${FW_BS}! ${SENT}`];
const MYSQL_ALREADY_REFUSED = [
  `${BOM}system ${SENT}`,
  `select 1;${CR}system ${SENT}`,
  `system ${SENT}`,
  `source ${SENT}`,
  `tee ${SENT}`,
  `pager ${SENT}`,
  `select 1; system ${SENT}`,
];
const MYSQL_ALLOWED = [
  'use orders',
  'USE orders;',
  'help contents',
  "HELP 'contents'",
  'select system_user()',
  'select * from pager_log',
  'select * from connect_log',
  'select status from jobs',
  `select *${NL}from jobs${NL}where${NL}  status = 3`,
  `select id,${NL}  status${NL}from jobs`,
  'warnings',
  'print',
  'charset utf8mb4',
  'prompt x',
  'clear',
  'status',
  'select a, connect from t',
  `select \`connect\`${NL}from t`,
  'sources x',
  'connected',
];
const MSSQL_COMMAND_AFTER_CR = [`select 1${CR}:!! ${SENT}`, `/*x*/:!! ${SENT}`, `${FW_COLON}!! ${SENT}`];
const MSSQL_ED = ['ed', '  ED', 'ed -- x', `select 1${NL}ed`];
const MSSQL_ALREADY_REFUSED = [`:connect ${SENT}`, `select 1${NL}:!! ${SENT}`];
const MSSQL_ALLOWED = ['edition_id', 'select edited from t', `select 1${NL}GO`, 'RESET', `select 1${NL}EXIT`];
const PG_CR_AND_FOLDED = [`select 1${CR}${BS}! ${SENT}`, `${FW_BS}! ${SENT}`];
const PG_ALREADY_REFUSED = [`${BS}! ${SENT}`, `select 1;${NL}${BS}! ${SENT}`];
const NON_ASCII_DATA = [
  "select 'Яблоко'",
  "select '日本語'",
  "select 'café'",
  "select '🍎'",
  "select '山田（太郎）、東京都　新宿区，１２３'",
  "select '…'",
];

refuses('RED', 'mysql', MYSQL_CONNECT, 'connect');
refuses('RED', 'mysql', MYSQL_SSL_PRINT, 'ssl_session_data_print');
refuses('RED', 'mysql', MYSQL_DELIMITER, 'delimiter');
for (const [q, word] of MYSQL_COMMENT_HIDDEN) {
  refuses('RED comment-hidden', 'mysql', [q], word);
}
refuses('RED bare CR', 'mysql', MYSQL_CR, 'system');
refuses('RED accepted over-refusal', 'mysql', MYSQL_OVER_REFUSED, 'connect');
refuses('guard accepted over-refusal inside a comment', 'mysql', MYSQL_INSIDE_COMMENT, 'system');
refuses('RED folded', 'mysql', MYSQL_FOLDED);
refuses('guard', 'mysql', MYSQL_ALREADY_REFUSED);
allows('guard', 'mysql', MYSQL_ALLOWED);
for (const dbType of ['postgres', 'mysql', 'mssql'] as const) {
  allows('guard non-ASCII data', dbType, NON_ASCII_DATA);
}
refuses('RED', 'mssql', MSSQL_COMMAND_AFTER_CR);
refuses('RED ed', 'mssql', MSSQL_ED);
refuses('guard', 'mssql', MSSQL_ALREADY_REFUSED);
allows('guard', 'mssql', MSSQL_ALLOWED);
refuses('RED', 'postgres', PG_CR_AND_FOLDED);
refuses('guard', 'postgres', PG_ALREADY_REFUSED);

test('the folded mysql forms are refused by the sentence of the rule that fired', () => {
  assertRefused('mysql', `${FW_SYSTEM} ${SENT}`, 'system');
  assert.ok((refuseQuery('mysql', `${FW_BS}! ${SENT}`) ?? '').includes('backslash'));
});

test('a refusal repeats nothing from the query: not the sentinel, not the host', () => {
  const refused: Array<[DbType, string]> = [
    ...[...MYSQL_CONNECT, ...MYSQL_SSL_PRINT, ...MYSQL_DELIMITER, ...MYSQL_CR].map((q): [DbType, string] => ['mysql', q]),
    ...MYSQL_COMMENT_HIDDEN.map(([q]): [DbType, string] => ['mysql', q]),
    ...[...MYSQL_OVER_REFUSED, ...MYSQL_INSIDE_COMMENT, ...MYSQL_FOLDED, ...MYSQL_ALREADY_REFUSED].map((q): [DbType, string] => ['mysql', q]),
    ...[...MSSQL_COMMAND_AFTER_CR, ...MSSQL_ED, ...MSSQL_ALREADY_REFUSED].map((q): [DbType, string] => ['mssql', q]),
    ...[...PG_CR_AND_FOLDED, ...PG_ALREADY_REFUSED].map((q): [DbType, string] => ['postgres', q]),
  ];
  for (const [dbType, q] of refused) {
    const reason = refuseQuery(dbType, q);
    assert.notEqual(reason, undefined, `should refuse (${dbType}): ${JSON.stringify(q)}`);
    assert.equal((reason ?? '').includes(SENT), false, `repeats the sentinel: ${reason}`);
    assert.equal((reason ?? '').includes(HOST2), false, `repeats the host: ${reason}`);
  }
});

test("psql: the -c string begins with one space, because psql reads a -c string as a meta-command only when its FIRST character is a backslash", () => {
  const launch = buildDbQueryLaunch('postgres', PG, 'select 1');
  const args = launch?.args ?? [];
  assert.notEqual(args.indexOf('-c'), -1);
  assert.equal(args[args.indexOf('-c') + 1], ' select 1');
});

function assertBetween(args: string[], flag: string, after: number, before: number): void {
  const at = args.indexOf(flag);
  assert.notEqual(at, -1, `missing ${flag}: ${args.join(' ')}`);
  assert.ok(at > after, `${flag} must follow the connection flags: ${args.join(' ')}`);
  assert.ok(at < before, `${flag} must precede -e: ${args.join(' ')}`);
}

test('mysql: the launch pins named commands, the delimiter and LOCAL INFILE after the connection flags and before -e, and never --no-defaults', () => {
  const args = buildDbQueryLaunch('mysql', MY, 'select 2')?.args ?? [];
  assert.notEqual(args.indexOf('-D'), -1);
  assert.notEqual(args.indexOf('-e'), -1);
  for (const flag of ['--skip-named-commands', '--delimiter=;', '--local-infile=0']) {
    assertBetween(args, flag, args.indexOf('-D'), args.indexOf('-e'));
  }
  assert.equal(args.includes('--no-defaults'), false);
});

test('guard: the mssql argv is exactly what it was before the gate changed', () => {
  const launch = buildDbQueryLaunch('mssql', MS, 'select 1');
  assert.deepEqual(launch?.args, ['-S', 'db,1433', '-d', 'orders', '-Q', 'select 1', '-b', '-x']);
  assert.deepEqual(launch?.env, { SQLCMDPASSWORD: 'hunter2', SQLCMDUSER: 'alice' });
});

test('fail closed: a database type with no rule is refused, not allowed', () => {
  // A SQL client added to DbType later, with a password variable and no case in the gate,
  // must not let every client command through.
  const reason = refuseQuery('oracle' as DbType, 'select 1');
  assert.notEqual(reason, undefined);
  assert.equal(buildDbQueryLaunch('oracle' as DbType, 'oracle://u:p@h:1521/d', 'select 1'), undefined);
});

test('the over-refusal sentences say how to write the word as SQL, and that way passes', () => {
  assert.ok((refuseQuery('mysql', `select a,${NL}connect${NL}from t`) ?? '').includes('same line'));
  assert.ok((refuseQuery('mssql', `select 1${NL}ed`) ?? '').includes('same line'));
  assert.equal(refuseQuery('mysql', 'select a, connect from t'), undefined);
  assert.equal(refuseQuery('mysql', `select a,${NL}  b from t`), undefined);
  assert.equal(refuseQuery('mssql', 'select a, ed from t'), undefined);
  assert.equal(refuseQuery('mssql', 'select x ed from t'), undefined);
  // The clause is only true for the cases it names: a ";" or a comment before the word still fires.
  assert.notEqual(refuseQuery('mysql', 'select 1; connect x'), undefined);
  assert.notEqual(refuseQuery('mysql', 'select a, /* c */ connect from t'), undefined);
  assert.notEqual(refuseQuery('mssql', 'select a /* c */ ed from t'), undefined);
});
