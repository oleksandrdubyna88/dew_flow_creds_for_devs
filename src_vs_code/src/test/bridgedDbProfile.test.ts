import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGED_DB_PROFILES, BridgedDbConnection, bridgedDbConnection, bridgedDbPair, bridgedPsqlString } from '../bridgedDbProfile';
import type { DbType } from '../types';
import { DR5, ENTRY, REFUSED, SENTINEL, dr2, dr4, dr6, dr6q, stored } from './bridgedDbCases';

/**
 * E1.6 §S6.15 Z1 (parent §4.11, Q18): the gate. A bridged `query` is served only for a client and system whose profile was measured, and while E1.6
 * merges no pair is. A row is `served` in the commit that records the probe runs of its pair (E1.7): until then every bridged query is refused.
 */

const CLIENT_OF = { postgres: 'psql', mysql: 'mysql', mssql: 'sqlcmd' } as const;
const SYSTEMS = ['linux', 'win32', 'darwin'] as const;

/** The rows E1.7 has turned (§S7.7), as `client/platform`: each in the commit that recorded its candidate run. */
const SERVED_PAIRS = ['sqlcmd/linux'];

test('DP1: the table has a row for each client on linux, win32 and darwin, and exactly the turned rows are served, each with the builds its legs ran on', () => {
  for (const client of Object.values(CLIENT_OF)) {
    for (const platform of SYSTEMS) {
      const rows = BRIDGED_DB_PROFILES.filter((row) => row.client === client && row.platform === platform);
      assert.equal(rows.length, 1, `${client} on ${platform}: exactly one row`);
      assert.equal(rows[0].served, SERVED_PAIRS.includes(`${client}/${platform}`), `${client} on ${platform}`);
    }
  }
  assert.equal(BRIDGED_DB_PROFILES.length, 9, 'no row for anything else');
  const sqlcmd = BRIDGED_DB_PROFILES.filter((row) => row.served).map((row) => ({ ...row, clients: row.clients }));
  assert.deepEqual(sqlcmd, [{
    client: 'sqlcmd', platform: 'linux', served: true,
    clients: [{ vendor: 'odbc-sqlcmd', builds: [
      { version: '17.11.0001.1', tag: 'Linux', driver: '17.11.1.1', record: 'run 45390171118 at 35d59423' },
      { version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1', record: 'run 45390171118 at 35d59423' },
    ] }],
  }], 'the ODBC sqlcmd on Linux, the two builds of the candidate run, each with its driver; go-sqlcmd is not served');
});

/** The production table with exactly one row served. */
const withServed = (client: string, platform: string): typeof BRIDGED_DB_PROFILES => BRIDGED_DB_PROFILES.map((row) => ({ ...row, served: row.client === client && row.platform === platform }));

/** The DR1 sentence of a pair that is not served, written out. */
const DR1_OF = (client: string, platform: (typeof SYSTEMS)[number]): string =>
  `A Remote Bridge runs a database query only with a client and system whose behaviour was measured. ${client} on ${{ linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[platform]} is not among them.`;

interface Pair {
  readonly dbType: DbType;
  readonly client: string;
  readonly platform: (typeof SYSTEMS)[number];
}

const ALL_PAIRS: readonly Pair[] = (Object.entries(CLIENT_OF) as Array<[DbType, string]>).flatMap(([dbType, client]) => SYSTEMS.map((platform) => ({ dbType, client, platform })));

/** What the table with only `turned` served must answer for `pair`: served for that pair, DR1 with the pair's own client and system for every other. */
const answerFor = (turned: Pair, pair: Pair): ReturnType<typeof bridgedDbPair> =>
  turned.dbType === pair.dbType && turned.platform === pair.platform ? { served: true } : { served: false, sentence: DR1_OF(pair.client, pair.platform) };

test('DP1b: turning one row of the production table to served serves exactly its own pair, and every other pair answers DR1 with its client and system', () => {
  for (const turned of ALL_PAIRS) {
    const rows = withServed(turned.client, turned.platform);
    for (const pair of ALL_PAIRS) {
      assert.deepEqual(bridgedDbPair(rows, pair.dbType, pair.platform), answerFor(turned, pair), `${pair.dbType} on ${pair.platform} with only ${turned.dbType} on ${turned.platform} served`);
    }
  }
});

test('DP2: a platform with no row, and a type with no client, are not served, and the sentence is DR1', () => {
  const freebsd = bridgedDbPair(BRIDGED_DB_PROFILES, 'postgres', 'freebsd');
  assert.deepEqual(freebsd, { served: false, sentence: 'A Remote Bridge runs a database query only with a client and system whose behaviour was measured. psql on freebsd is not among them.' });
  const mongo = bridgedDbPair(BRIDGED_DB_PROFILES, 'mongodb', 'linux');
  assert.deepEqual(mongo, { served: false, sentence: 'A Remote Bridge runs a database query only with a client and system whose behaviour was measured. mongosh on Linux is not among them.' });
  const unknown = bridgedDbPair(BRIDGED_DB_PROFILES, 'oracle' as DbType, 'linux');
  assert.equal(unknown.served, false, 'a type the code does not know is not served');
});

test('DP2b: the three system words, and a table that serves a row serves exactly that pair', () => {
  const words = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' } as const;
  for (const platform of SYSTEMS) {
    const answer = bridgedDbPair([], 'mysql', platform);
    assert.equal(answer.served === false && answer.sentence.endsWith(`mysql on ${words[platform]} is not among them.`), true, platform);
  }
  const rows = [{ client: 'mysql', platform: 'linux', served: true }, { client: 'psql', platform: 'linux', served: false }] as const;
  assert.deepEqual(bridgedDbPair(rows, 'mysql', 'linux'), { served: true });
  assert.equal(bridgedDbPair(rows, 'mysql', 'win32').served, false, 'another platform');
  assert.equal(bridgedDbPair(rows, 'postgres', 'linux').served, false, 'a row that is not served');
  assert.equal(bridgedDbPair(rows, 'mssql', 'linux').served, false, 'a client with no row');
});

/* ---------------------------------------------------------------------------------------------------------------
 * §S6.15 Z2 and Z3: the connection is built from checked fields, and what is not built from is refused with a sentence of the journal
 * ------------------------------------------------------------------------------------------------------------- */

type Built = Extract<BridgedDbConnection, { ok: true }>;

const build = (dbType: DbType, text: string): BridgedDbConnection => bridgedDbConnection(dbType, text, ENTRY);

/** A connection that must be built. */
function built(dbType: DbType, text: string): Built {
  const answer = build(dbType, text);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  return answer as Built;
}

/** The sentence of a connection that must be refused. */
function refusal(dbType: DbType, text: string): string {
  const answer = build(dbType, text);
  assert.equal(answer.ok, false, `built: ${JSON.stringify(answer)}`);
  return (answer as { sentence: string }).sentence;
}

test('DP3: a postgres URI with the three keys of the profile is built: five fields and exactly those three settings, in the order the builder writes them', () => {
  const answer = built('postgres', 'postgresql://u:p@db.example:5432/app?sslmode=require&connect_timeout=5&application_name=x');
  assert.deepEqual(answer, { ok: true, host: 'db.example', port: '5432', database: 'app', user: 'u', password: 'p', settings: { sslmode: 'require', connect_timeout: '5', application_name: 'x' } });
  const reversed = built('postgres', 'postgresql://u:p@db.example:5432/app?application_name=x&connect_timeout=5&sslmode=require');
  assert.deepEqual(Object.keys(reversed.settings), ['sslmode', 'connect_timeout', 'application_name'], 'the order is the builder\'s, whatever the stored order');
});

test('DP3b: the fields are read as they are written: percent-decoded once, a port and a database optional, no setting without a query', () => {
  assert.deepEqual(built('postgres', 'postgres://a%40b:p%3Aw%25@db.example/'), { ok: true, host: 'db.example', user: 'a@b', password: 'p:w%', settings: {} });
  assert.deepEqual(built('postgres', '  postgresql://u:p@db_1.example:1/a%20b  '), { ok: true, host: 'db_1.example', port: '1', database: 'a b', user: 'u', password: 'p', settings: {} }, 'trimmed, and one decoding');
  assert.equal(built('postgres', 'postgresql://u:p%2541@db.example/d').password, 'p%41', 'decoded once, not twice');
  assert.equal(built('postgres', 'postgresql://u:p@db.example:65535/d?application_name=a%20b.c-d_e').settings.application_name, 'a b.c-d_e');
  assert.equal(built('mysql', 'mysql://u:p@db.example:3306/d/e').database, 'd/e', 'a database name is what the path says');
});

const GROUPS: ReadonlyArray<readonly [string, string, number]> = [
  ['DP4', 'a key of the stored URI outside the profile is refused by name, whatever its value', 22],
  ['DP5', 'a key spelled another way, doubled, malformed or in a fragment is refused', 13],
  ['DP6', 'a setting of the profile with a value of the wrong shape is refused', 7],
  ['DP7', 'no user, or no password, is refused for every type and dialect, naming which', 15],
  ['DP8', 'no host, a socket folder and a list of hosts are refused', 13],
  ['DP10', 'a database name that psql would read as a connection string, or that holds a line break, is refused', 5],
  ['DP11', 'a key the profile does not carry in a mysql URI or a key-value string is refused, the known keys named', 15],
  ['field', 'a port, a host, a user, a password or a text outside its shape is refused', 32],
];

for (const [group, what, count] of GROUPS) {
  test(`${group} (§S6.15 Z4): ${what}, with the sentence of its rule`, () => {
    const cases = REFUSED.filter((refused) => (group === 'field' ? !refused.id.startsWith('DP') : refused.id.startsWith(`${group} `)));
    assert.equal(cases.length, count, `the ${group} cases are all there`);
    for (const refused of cases) {
      assert.equal(refusal(refused.dbType, stored(refused)), refused.sentence, refused.id);
    }
  });
}

test('DP13 (T54): no sentence holds the sentinel that stands in every value of every refused case, nor the entry\'s text', () => {
  for (const refused of REFUSED) {
    const sentence = refusal(refused.dbType, refused.stored(SENTINEL));
    assert.equal(sentence.includes(SENTINEL), false, refused.id);
    assert.equal(sentence.includes('db.example'), false, `${refused.id}: no host`);
    assert.equal(sentence.includes('orders'), false, `${refused.id}: no database`);
  }
});

test('DP7b: the host is asked before the user and the password, and the settings before the host: the order of the rules when two apply', () => {
  assert.equal(refusal('postgres', 'postgresql:///orders'), DR5, 'no host and no user: the host');
  assert.equal(refusal('postgres', 'postgresql://db.example/orders'), dr4('user'), 'no user and no password: the user');
  assert.equal(refusal('postgres', 'postgresql:///orders?service=s1'), dr2('"service"'), 'a setting and no host: the setting');
  assert.equal(refusal('postgres', 'postgresql://app@db.example/orders?service=s1'), dr2('"service"'), 'a setting and no password: the setting');
  assert.equal(refusal('postgres', 'postgresql://app:p@db.example:0/o%0A'), dr6('port', 'psql'), 'the port before the database');
});

test('DP16: a key=value value that begins with a quote is refused, whatever the field; a quote inside a value, and a quoted value of a URI, are carried as they are', () => {
  assert.equal(refusal('mssql', 'Server=db.example;User Id=u;Password="a"'), dr6q('password', 'sqlcmd'));
  assert.equal(refusal('mssql', "Server=db.example;User Id=u;Password='a'"), dr6q('password', 'sqlcmd'));
  assert.equal(built('mssql', 'Server=db.example;User Id=u;Password=a"b').password, 'a"b', 'a quote inside is the password\'s');
  assert.equal(built('mssql', 'mssql://u:%22a%22@db.example/d').password, '"a"', 'a URI\'s percent-decoded value is what it says');
});

test('DP17: the host of a key=value mssql string is one host name after the split: an IPv6 address is not read as host and port, and an empty one is the host rule', () => {
  assert.equal(refusal('mssql', 'Server=::1;User Id=u;Password=p'), dr6('host', 'sqlcmd'));
  assert.equal(refusal('mssql', 'Server=::1,1433;User Id=u;Password=p'), dr6('host', 'sqlcmd'));
  assert.equal(refusal('mssql', 'Server=,1433;User Id=u;Password=p'), DR5);
  assert.deepEqual(built('mssql', 'Server=db-1.example_x,1433;User Id=u;Password=p'), { ok: true, host: 'db-1.example_x', port: '1433', user: 'u', password: 'p', settings: {} });
});

test('DP9: a mysql entry for localhost and one for an IPv6 address in brackets are built; the brackets are the URI\'s and not the client\'s', () => {
  assert.equal(built('mysql', 'mysql://u:p@localhost:3306/d').host, 'localhost');
  assert.equal(built('mysql', 'mysql://u:p@[::1]:3306/d').host, '::1');
  assert.equal(built('postgres', 'postgresql://u:p@[2001:db8::1]/d').host, '2001:db8::1');
  assert.equal(built('mysql', 'Server=[::1];User Id=u;Password=p').host, '::1');
  assert.equal(built('mssql', 'Server=db.example;User Id=u;Password=p').host, 'db.example');
  assert.equal(built('postgres', 'postgresql://u:p@127.0.0.1/d').host, '127.0.0.1');
  assert.equal(refusal('postgres', 'postgresql://u:p@[nothex]/d'), dr6('connection', 'psql'), 'not an address: the URI cannot be read');
  assert.equal(refusal('mysql', 'Server=[nothex];User Id=u;Password=p'), dr6('host', 'mysql'), 'not an address, in a key-value string');
});

test('DP12: the key-value spellings the parser reads give the same fields; a field given by two keys is refused', () => {
  const spellings = [
    'Server=db.example,1433;Database=orders;User Id=app;Password=pw',
    'Data Source=db.example,1433;Initial Catalog=orders;UID=app;PWD=pw',
    'host=db.example:1433;database=orders;user=app;password=pw',
    'SERVER=db.example;PORT=1433;DATABASE=orders;USERNAME=app;PASSWORD=pw',
    ' Server = db.example,1433 ; Database = orders ; User Id = app ; Password = pw ;',
  ];
  for (const text of spellings) {
    assert.deepEqual(built('mssql', text), { ok: true, host: 'db.example', port: '1433', database: 'orders', user: 'app', password: 'pw', settings: {} }, text);
  }
  assert.equal(built('mysql', 'Server=db.example;Port=3307;Database=d;User Id=u;Password=p').port, '3307');
  assert.equal(built('mssql', 'Server=db.example,1433;Port=1500;User Id=u;Password=p').port, '1500', 'the Port key wins over the suffix, as the parser has it');
  assert.equal(refusal('mssql', 'Server=h,1433;Database=d;User Id=u;UID=v;Password=p'), 'The connection stored in "prod" holds the setting "uid" more than once.');
});

test('DP12b: the dialects are the parser\'s: mysql and mssql take a URI or a key-value string, postgres a URI alone, and a URI\'s scheme is not checked for them', () => {
  assert.equal(built('mssql', 'mssql://u:p@db.example:1433/d').port, '1433');
  assert.equal(built('mysql', 'mariadb://u:p@db.example/d').user, 'u');
  assert.equal(refusal('postgres', 'mysql://u:p@db.example/d'), dr6('connection', 'psql'), 'a postgres entry holds a postgres URI');
  assert.equal(refusal('mongodb', 'mongodb://u:p@db.example/d'), dr6('connection', 'mongosh'));
});

/** The value that starts at `from` (after the opening quote) and where the closing quote is: a backslash escapes a backslash or a quote. */
function readValue(text: string, from: number): { value: string; end: number } {
  let value = '';
  let cursor = from;
  while (text[cursor] !== "'") {
    assert.ok(cursor < text.length, 'the value ends');
    cursor += text[cursor] === '\\' ? 1 : 0;
    assert.ok(text[cursor] !== undefined, 'a backslash escapes something');
    value += text[cursor];
    cursor += 1;
  }
  return { value, end: cursor };
}

/** A libpq keyword string read back: `key='value'` pairs, one space between them. */
function readKeywords(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  let at = 0;
  while (at < text.length) {
    const equals = text.indexOf("='", at);
    assert.ok(equals > at, `a keyword at ${at} of the string`);
    assert.match(text.slice(at, equals), /^[a-z_]+$/, 'a keyword is plain');
    const { value, end } = readValue(text, equals + 2);
    pairs.push([text.slice(at, equals), value]);
    at = end + 1;
    assert.ok(at >= text.length || text[at] === ' ', 'one space between pairs');
    at += 1;
  }
  return pairs;
}

const ABSENT = '/k/keys/1/no-client-file';

/** The three keywords the builder ends the psql string with (E1.7 §S7.5; probes PK1, PE1 of 2026-11-19), in their order. */
const POLICY: ReadonlyArray<[string, string]> = [['gssencmode', 'disable'], ['sslcertmode', 'disable'], ['require_auth', 'password,md5,scram-sha-256']];

test('DP14 (T55, V3): the psql string holds the fields in order, quoted so a reader gets them back, no password keyword, and ends with passfile, sslcert and sslkey at the absent file, then the three policy keywords', () => {
  const answer = built('postgres', 'postgresql://o%27brien:pw@db.example:5432/a%20b%5Cc%27d?sslmode=require&connect_timeout=7&application_name=my%20app');
  const pairs = readKeywords(bridgedPsqlString(answer, ABSENT));
  assert.deepEqual(pairs, [
    ['host', 'db.example'], ['port', '5432'], ['dbname', "a b\\c'd"], ['user', "o'brien"],
    ['sslmode', 'require'], ['connect_timeout', '7'], ['application_name', 'my app'],
    ['passfile', ABSENT], ['sslcert', ABSENT], ['sslkey', ABSENT], ...POLICY,
  ]);
  assert.equal(pairs.some(([key]) => key === 'password'), false, 'there is no password keyword, ever');
  assert.equal(bridgedPsqlString(answer, ABSENT).includes('pw'), false, 'and the password is not in the string');
  assert.deepEqual(pairs.slice(-6, -3).map(([key, value]) => [key, value]), [['passfile', ABSENT], ['sslcert', ABSENT], ['sslkey', ABSENT]]);
});

test('DP14b (V3): with no port and no database the string still names host, port 5432 and dbname (the user name, libpq\'s own default), for ~/.postgresqlrc fills any of the three it is not told; an IPv6 host is written without its brackets; the absent file is quoted like any value', () => {
  const answer = built('postgres', 'postgresql://u:p@[::1]/');
  assert.deepEqual(readKeywords(bridgedPsqlString(answer, "/k/it's\\x")), [
    ['host', '::1'], ['port', '5432'], ['dbname', 'u'], ['user', 'u'], ['passfile', "/k/it's\\x"], ['sslcert', "/k/it's\\x"], ['sslkey', "/k/it's\\x"], ...POLICY,
  ]);
});

test('DP18 (V3, T57, T58, T60, T61): the psql string ends with passfile, sslcert, sslkey and then the three policy keywords, and nothing the entry gave stands after them, whatever settings it carried', () => {
  const settings = 'postgresql://alice:pw@db.example:6543/orders?sslmode=require&connect_timeout=7&application_name=x';
  for (const text of [settings, 'postgresql://alice:pw@db.example/', 'postgresql://alice:pw@db.example/orders']) {
    const pairs = readKeywords(bridgedPsqlString(built('postgres', text), ABSENT));
    assert.deepEqual(pairs.slice(-6), [['passfile', ABSENT], ['sslcert', ABSENT], ['sslkey', ABSENT], ...POLICY], text);
    assert.deepEqual(pairs.slice(0, 4).map(([key]) => key), ['host', 'port', 'dbname', 'user'], `${text}: the three libpq would fill from ~/.postgresqlrc stand in every string`);
    for (const [key] of POLICY) {
      assert.equal(pairs.filter(([given]) => given === key).length, 1, `${text}: ${key} is written once, by the builder`);
    }
  }
});

test('DP18b (V3): host, port and dbname are explicit when the entry names none: port 5432, and the database the user name', () => {
  const pairs = readKeywords(bridgedPsqlString(built('postgres', 'postgresql://alice:pw@db.example/'), ABSENT));
  assert.deepEqual(pairs.slice(0, 4), [['host', 'db.example'], ['port', '5432'], ['dbname', 'alice'], ['user', 'alice']]);
  const named = readKeywords(bridgedPsqlString(built('postgres', 'postgresql://alice:pw@db.example:6543/orders'), ABSENT));
  assert.deepEqual(named.slice(0, 4), [['host', 'db.example'], ['port', '6543'], ['dbname', 'orders'], ['user', 'alice']], 'a value the entry names is the value written');
});

test('DP19 (V3, T59): require_auth names password methods and nothing else; gss, sspi and none are not in it, and the three methods PE1 logged in with are', () => {
  const pairs = readKeywords(bridgedPsqlString(built('postgres', 'postgresql://alice:pw@db.example/'), ABSENT));
  const methods = (pairs.find(([key]) => key === 'require_auth')?.[1] ?? '').split(',');
  assert.deepEqual(methods, ['password', 'md5', 'scram-sha-256']);
  for (const word of ['gss', 'sspi', 'none', 'cert', 'oauth', 'ldap']) {
    assert.equal(methods.includes(word), false, `${word} is not a method the entry's own password can answer`);
    assert.equal(methods.includes('!' + word), false);
  }
});

test('DP15: a field refusal says the constraint the field did not meet, in fixed words, and never the stored value', () => {
  const ends = (dbType: DbType, text: string, constraint: string): void => assert.ok(refusal(dbType, text).endsWith(`: ${constraint}.`), `${dbType} ${text}`);
  ends('mysql', 'mysql://u:p@db.example:0/d', 'it must be a whole number from 1 to 65535');
  ends('mssql', 'Server=db.example;Port=70000;User Id=u;Password=p', 'it must be a whole number from 1 to 65535');
  ends('postgres', 'postgresql://u:p@db.example/d?sslmode=nope', 'it must be one of disable, allow, prefer, require, verify-ca or verify-full');
  ends('postgres', 'postgresql://u:p@db.example/d?connect_timeout=x', 'it must be one to four digits');
  ends('postgres', 'postgresql://u:p@db.example/a%0Ab', "it must hold no control character and must not begin with '-', must hold no \"=\" and must not begin with a postgres URL scheme");
  ends('mysql', 'mysql://u:p@db.example/a%0Ab', "it must hold no control character and must not begin with '-'");
  ends('postgres', 'postgresql://u:p%0A@db.example/d', 'it must hold no control character');
  assert.equal(refusal('mysql', 'mysql://u:p@db.example:0/d').includes('0/d'), false, 'no part of the connection');
});
