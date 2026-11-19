import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { BRIDGED_ENV_POSIX, bridgedSshEnv } from '../bridgedSshEnv';
import { ClientRunner, CLIENT_CHECK_TIMEOUT_MS } from '../bridgedSshClient';
import { DbClientCheck, DbDriverFile, DbFiles, DbVendor, bridgedDbClientCheck, dbClientVerdict, resolveDbProgram } from '../bridgedDbClient';
import type { DbClient, DbProfileRow, DbServedClient } from '../bridgedDbProfile';
import { materializedKeysDir } from '../materializedKeys';

/**
 * The database client check and its reading (E1.7 spec §S7.6 and §S7.11, DC1-DC13). The version lines are written out here in the forms the clients print them (the
 * spec's N16 and the rig's own readers: `psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)`, `mysql  Ver 8.4.13 for Linux on x86_64 (MySQL Community Server - GPL)`,
 * `Distrib 10.6.23-MariaDB`, `from 11.8.6-MariaDB`, go-sqlcmd's `Version: v1.10.0`, the ODBC client's `Version 18.6.0001.1 Linux`); each is a case, and the CI run that recorded
 * the real line goes beside it when a row is turned (§S7.7).
 */

type Reading = ReturnType<typeof dbClientVerdict>;

const SENTINEL = 'zq9x7k2m-after-the-line';
const MORE = `Copyright (c) Somebody\nusage: ${SENTINEL}\n`;

const build = (version: string, tag: string, driver?: string): { version: string; tag: string; record: string; driver?: string } => ({ version, tag, record: 'run 1 at 0123abc', ...(driver === undefined ? {} : { driver }) });
const served = (vendor: DbVendor, ...builds: ReturnType<typeof build>[]): DbServedClient => ({ vendor, builds });
const rowOf = (client: DbClient, platform: NodeJS.Platform, ...clients: DbServedClient[]): DbProfileRow => ({ client, platform, served: true, clients });

/** One recorded version line: the client it was asked of, what it printed on stdout, and what the check must read from it. */
interface Line {
  readonly id: string;
  readonly client: DbClient;
  readonly platform: NodeJS.Platform;
  readonly stdout: string;
  readonly vendor: DbVendor;
  readonly version: string;
  readonly tag: string;
  /** The version of the ODBC driver file the client loads (L11), read from its file name: `libmsodbcsql-18.6.so.1.1` is `18.6.1.1`. Absent where no driver file can be read (Windows). */
  readonly driver?: string;
}

/**
 * The version lines the clients printed on CI, each as the third probe run recorded it (CI run 44543740467, the `record (PA1-a)` lines and the `CANDIDATE` lines of its jobs; the job is named
 * in each id). Nothing here is written from memory (E1.7 spec §S7.6 item 8): the Linux lines of `mysql` and `mariadb` lead with the absolute path of the file that answered, the ODBC client's
 * version is four numbers (`18.6.0001.1`, never `18.6.1.1`) and go-sqlcmd's first line is its own name, with its version on a line of its own.
 */
const GO_SQLCMD = 'sqlcmd: Install/Create/Query SQL Server, Azure SQL, and Tools\n\nVersion: v1.10.0\nCopyright (c) Microsoft Corporation\n';
const ODBC = (version: string, system: string): string => `Microsoft (R) SQL Server Command Line Tool\nVersion ${version} ${system}\nCopyright (C) 2022 Microsoft Corporation. All rights reserved.\n\nusage: sqlcmd [-U login id]\n`;

const LINES: readonly Line[] = [
  { id: 'psql 18.7, ubuntu-latest', client: 'psql', platform: 'linux', stdout: 'psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)\n', vendor: 'postgresql', version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)' },
  { id: 'psql 16.16, ubuntu-24.04', client: 'psql', platform: 'linux', stdout: 'psql (PostgreSQL) 16.16 (Ubuntu 16.16-1.pgdg24.04+1)\n', vendor: 'postgresql', version: '16.16', tag: '(Ubuntu 16.16-1.pgdg24.04+1)' },
  { id: 'psql 17.11 on Windows, an upstream build prints no tag, windows-latest', client: 'psql', platform: 'win32', stdout: 'psql (PostgreSQL) 17.11\r\n', vendor: 'postgresql', version: '17.11', tag: '' },
  { id: "Oracle's own mysql 8.4.13, the generic archive, ubuntu-latest", client: 'mysql', platform: 'linux', stdout: '/usr/local/mysql/bin/mysql  Ver 8.4.13 for Linux on x86_64 (MySQL Community Server - GPL)\n', vendor: 'oracle', version: '8.4.13', tag: 'for Linux on x86_64 (MySQL Community Server - GPL)' },
  { id: "the distribution's mysql 8.0.46, ubuntu-22.04", client: 'mysql', platform: 'linux', stdout: '/usr/bin/mysql  Ver 8.0.46-0ubuntu0.22.04.5 for Linux on x86_64 ((Ubuntu))\n', vendor: 'oracle', version: '8.0.46', tag: '-0ubuntu0.22.04.5 for Linux on x86_64 ((Ubuntu))' },
  { id: "Oracle's mysql 8.4.13 on Windows, its path leads the line, windows-latest", client: 'mysql', platform: 'win32', stdout: 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe  Ver 8.4.13 for Win64 on x86_64 (MySQL Community Server - GPL)\r\n', vendor: 'oracle', version: '8.4.13', tag: 'for Win64 on x86_64 (MySQL Community Server - GPL)' },
  { id: 'MariaDB 10.6.23, Distrib, ubuntu-22.04', client: 'mysql', platform: 'linux', stdout: '/home/runner/mariadb-client/usr/bin/mariadb  Ver 15.1 Distrib 10.6.23-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper\n', vendor: 'mariadb', version: '10.6.23', tag: '-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper' },
  { id: 'MariaDB 11.8.6, from, ubuntu-latest', client: 'mysql', platform: 'linux', stdout: '/home/runner/mariadb-client/usr/bin/mariadb from 11.8.6-MariaDB, client 15.2 for debian-linux-gnu (x86_64) using  EditLine wrapper\n', vendor: 'mariadb', version: '11.8.6', tag: ', client 15.2 for debian-linux-gnu (x86_64) using  EditLine wrapper' },
  { id: 'go-sqlcmd 1.10.0, every Linux job and windows-latest', client: 'sqlcmd', platform: 'linux', stdout: GO_SQLCMD, vendor: 'go-sqlcmd', version: '1.10.0', tag: '' },
  { id: 'the ODBC sqlcmd 18.6.0001.1, the PS1 Linux job', client: 'sqlcmd', platform: 'linux', stdout: ODBC('18.6.0001.1', 'Linux'), vendor: 'odbc-sqlcmd', version: '18.6.0001.1', tag: 'Linux', driver: '18.6.1.1' },
  { id: 'the ODBC sqlcmd 18.7.0001.1, ubuntu-24.04 and ubuntu-latest', client: 'sqlcmd', platform: 'linux', stdout: ODBC('18.7.0001.1', 'Linux'), vendor: 'odbc-sqlcmd', version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1' },
  { id: 'the ODBC sqlcmd 17.11.0001.1, ubuntu-22.04', client: 'sqlcmd', platform: 'linux', stdout: ODBC('17.11.0001.1', 'Linux'), vendor: 'odbc-sqlcmd', version: '17.11.0001.1', tag: 'Linux', driver: '17.11.1.1' },
  { id: 'the ODBC sqlcmd 16.0.1000.6 on Windows, the PS1 Windows job', client: 'sqlcmd', platform: 'win32', stdout: ODBC('16.0.1000.6', 'NT'), vendor: 'odbc-sqlcmd', version: '16.0.1000.6', tag: 'NT' },
  { id: 'the ODBC sqlcmd 15.0.1300.359 on Windows, windows-latest', client: 'sqlcmd', platform: 'win32', stdout: ODBC('15.0.1300.359', 'NT'), vendor: 'odbc-sqlcmd', version: '15.0.1300.359', tag: 'NT' },
  { id: 'MariaDB 10.11.14, Distrib, ubuntu-24.04', client: 'mysql', platform: 'linux', stdout: '/home/runner/mariadb-client/usr/bin/mariadb  Ver 15.1 Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper\n', vendor: 'mariadb', version: '10.11.14', tag: '-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper' },
  { id: "the distribution's mysql 8.4.13, ubuntu-latest", client: 'mysql', platform: 'linux', stdout: '/usr/bin/mysql  Ver 8.4.13-0ubuntu0.26.04.2 for Linux on x86_64 ((Ubuntu))\n', vendor: 'oracle', version: '8.4.13', tag: '-0ubuntu0.26.04.2 for Linux on x86_64 ((Ubuntu))' },
  { id: 'psql 14.24, ubuntu-22.04', client: 'psql', platform: 'linux', stdout: 'psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)\n', vendor: 'postgresql', version: '14.24', tag: '(Ubuntu 14.24-1.pgdg22.04+2)' },
];

const ORACLE_5_7 = '/usr/bin/mysql  Ver 14.14 Distrib 5.7.44, for Linux (x86_64) using  EditLine wrapper\n';

/** A table that serves exactly the build of `line`, as a turned row would list it. */
const tableFor = (line: Line): DbProfileRow[] => [rowOf(line.client, line.platform, served(line.vendor, build(line.version, line.tag, line.driver)))];

/** The driver file of a recorded driver version, as the check reads it from the ODBC configuration (L11). */
const driverOf = (version: string | undefined, over: Partial<DbDriverFile> = {}): DbDriverFile | undefined =>
  version === undefined ? undefined : { path: `/opt/microsoft/msodbcsql/lib64/libmsodbcsql-${version}.so`, realPath: `/opt/microsoft/msodbcsql/lib64/libmsodbcsql-${version}.so`, size: 500, mtimeMs: 50, version, ...over };

const dr7 = (client: string, exit: string): string =>
  `${client} did not answer its version under the environment a Remote Bridge gives it (exit ${exit}). No database query can go through a Remote Bridge with ${client} from this computer until it does.`;

/** What the check must say of a recorded line: its reading, or DR7 for the ODBC client where no driver file can be read (Windows, L11). */
function expectedReading(line: Line, driver: DbDriverFile | undefined): Reading {
  if (line.vendor === 'odbc-sqlcmd' && driver === undefined) {
    return { ok: false, sentence: dr7('sqlcmd', '0') };
  }
  return { ok: true, vendor: line.vendor, version: line.version, tag: line.tag, ...(driver === undefined ? {} : { driver }) };
}

test('DC1: each version line is read as its vendor, its version and its build tag, and a table that lists that build (and, for the ODBC client, its driver) serves it', () => {
  for (const line of LINES) {
    const driver = driverOf(line.driver);
    assert.deepEqual(dbClientVerdict(tableFor(line), line.client, line.platform, 0, line.stdout, driver), expectedReading(line, driver), line.id);
  }
});

test('DC2: an exit that is not 0, no output, a version word later in the line, and the line on the other stream (nothing on stdout) are DR7 with the exit code or the word unknown', () => {
  const table = tableFor(LINES[0]);
  const read = (exit: number | null, stdout: string): Reading => dbClientVerdict(table, 'psql', 'linux', exit, stdout);

  assert.deepEqual(read(1, LINES[0].stdout), { ok: false, sentence: dr7('psql', '1') }, 'a good line with a bad exit');
  assert.deepEqual(read(null, LINES[0].stdout), { ok: false, sentence: dr7('psql', 'unknown') }, 'a killed child');
  assert.deepEqual(read(0, ''), { ok: false, sentence: dr7('psql', '0') }, 'empty output');
  assert.deepEqual(read(0, 'banner psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)\n'), { ok: false, sentence: dr7('psql', '0') }, 'a version word later in the line');
  assert.deepEqual(read(0, 'wrapper says hello\n' + LINES[0].stdout), { ok: false, sentence: dr7('psql', '0') }, 'the line is not the first');
  assert.deepEqual(read(0, 'no version here\n'), { ok: false, sentence: dr7('psql', '0') });
  for (const line of LINES.filter((one) => one.client !== 'sqlcmd')) {
    assert.deepEqual(dbClientVerdict(tableFor(line), line.client, line.platform, 0, `banner ${line.stdout}`), { ok: false, sentence: dr7(line.client, '0') }, `${line.id}: a word before the program's own`);
  }
});

const dr8 = (client: string, token: string, system: string, builds: string): string =>
  `The ${client} on this computer answered ${token}. A Remote Bridge runs a query with ${client} on ${system} only for the builds that were measured: ${builds}.`;

test('DC3: a version below every recorded build, above every one, between two, a recorded version with another tag, and a vendor with no served row are DR8 with the token and the recorded builds; nothing else of the output is in the sentence', () => {
  const table = [rowOf('psql', 'linux', served('postgresql', build('16.16', '(Ubuntu 16.16-1.pgdg24.04+1)'), build('18.7', '(Ubuntu 18.7-1.pgdg26.04+2)')))];
  const builds = 'psql 16.16 (Ubuntu 16.16-1.pgdg24.04+1); psql 18.7 (Ubuntu 18.7-1.pgdg26.04+2)';
  const read = (line: string): Reading => dbClientVerdict(table, 'psql', 'linux', 0, `${line}\n${MORE}`);
  const refused = (token: string): Reading => ({ ok: false, sentence: dr8('psql', token, 'Linux', builds) });

  assert.deepEqual(read('psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)'), refused('psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)'), 'below');
  assert.deepEqual(read('psql (PostgreSQL) 19.1 (Ubuntu 19.1-1.pgdg26.04+1)'), refused('psql (PostgreSQL) 19.1 (Ubuntu 19.1-1.pgdg26.04+1)'), 'above');
  assert.deepEqual(read('psql (PostgreSQL) 17.2 (Ubuntu 17.2-1.pgdg26.04+1)'), refused('psql (PostgreSQL) 17.2 (Ubuntu 17.2-1.pgdg26.04+1)'), 'between two recorded builds');
  assert.deepEqual(read('psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+3)'), refused('psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+3)'), 'a recorded version with another build tag');
  assert.deepEqual(read('psql (PostgreSQL) 18.7'), refused('psql (PostgreSQL) 18.7'), 'a recorded version with no tag at all');
  assert.equal(read('psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)').ok, true, 'control: a recorded build, with the same trailing output, is served');
  for (const answer of [read('psql (PostgreSQL) 14.24 (x)'), read('psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+3)')]) {
    assert.equal(!answer.ok && answer.sentence.includes(SENTINEL), false, 'a sentinel in the rest of the output is in no sentence');
    assert.equal(!answer.ok && answer.sentence.includes('Copyright'), false);
  }

  const oracleOnly = [rowOf('mysql', 'linux', served('oracle', build('8.4.13', 'for Linux on x86_64 (MySQL Community Server - GPL)')))];
  assert.deepEqual(dbClientVerdict(oracleOnly, 'mysql', 'linux', 0, LINES[6].stdout), {
    ok: false,
    sentence: dr8('mysql', 'mariadb  Ver 15.1 Distrib 10.6.23-MariaDB, for debian-linux-gnu (x86_64) using  EditLine wrapper', 'Linux', "Oracle's mysql 8.4.13 for Linux on x86_64 (MySQL Community Server - GPL)"),
  }, 'a vendor with no served row');
  assert.deepEqual(dbClientVerdict([], 'psql', 'linux', 0, LINES[0].stdout), { ok: false, sentence: dr8('psql', 'psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)', 'Linux', 'none') }, 'a table with no row for the pair lists no build');
});

test('DC3b: the token of Oracle\'s client on Windows holds no path, and DR8 says Windows for win32', () => {
  const answer = dbClientVerdict([rowOf('mysql', 'win32', served('oracle', build('8.4.14', 'x')))], 'mysql', 'win32', 0, LINES[5].stdout);

  assert.equal(answer.ok, false);
  const sentence = answer.ok ? '' : answer.sentence;
  assert.equal(sentence.includes('Program Files'), false, sentence);
  assert.equal(sentence.includes('C:'), false, sentence);
  assert.ok(sentence.includes('mysql.exe  Ver 8.4.13 for Win64 on x86_64 (MySQL Community Server - GPL)') && sentence.includes(' on Windows only for the builds'), sentence);
});

test('DC4: MariaDB\'s line and Oracle\'s, go-sqlcmd\'s and the ODBC client\'s: neither is read as the other', () => {
  const both = [
    rowOf('mysql', 'linux', served('oracle', build('8.4.13', 'for Linux on x86_64 (MySQL Community Server - GPL)')), served('mariadb', build('10.6.23', LINES[6].tag))),
    rowOf('sqlcmd', 'linux', served('go-sqlcmd', build('1.10.0', '')), served('odbc-sqlcmd', build('18.6.0001.1', 'Linux', '18.6.1.1'))),
  ];
  const read = (client: DbClient, line: Line): Reading => dbClientVerdict(both, client, 'linux', 0, line.stdout);

  assert.deepEqual(read('mysql', LINES[3]), { ok: true, vendor: 'oracle', version: '8.4.13', tag: LINES[3].tag });
  assert.deepEqual(read('mysql', LINES[6]), { ok: true, vendor: 'mariadb', version: '10.6.23', tag: LINES[6].tag });
  assert.deepEqual(read('sqlcmd', LINES[8]), { ok: true, vendor: 'go-sqlcmd', version: '1.10.0', tag: '' });
  assert.deepEqual(dbClientVerdict(both, 'sqlcmd', 'linux', 0, LINES[9].stdout, driverOf('18.6.1.1')), { ok: true, vendor: 'odbc-sqlcmd', version: '18.6.0001.1', tag: 'Linux', driver: driverOf('18.6.1.1') });
  const mariaOnly = [rowOf('mysql', 'linux', served('mariadb', build('10.6.23', LINES[6].tag)))];
  assert.equal(dbClientVerdict(mariaOnly, 'mysql', 'linux', 0, LINES[3].stdout).ok, false, 'Oracle\'s line is not read as MariaDB\'s');
  const oracleOnly = [rowOf('mysql', 'linux', served('oracle', build('8.4.13', LINES[3].tag)))];
  assert.equal(dbClientVerdict(oracleOnly, 'mysql', 'linux', 0, LINES[6].stdout).ok, false, 'MariaDB\'s line is not read as Oracle\'s');
  assert.equal(dbClientVerdict(oracleOnly, 'mysql', 'linux', 0, LINES[7].stdout).ok, false, 'nor its newer "from" form');
  const goOnly = [rowOf('sqlcmd', 'linux', served('go-sqlcmd', build('1.10.0', '')))];
  assert.equal(dbClientVerdict(goOnly, 'sqlcmd', 'linux', 0, LINES[9].stdout).ok, false, 'the ODBC client is not read as go-sqlcmd');
  const odbcOnly = [rowOf('sqlcmd', 'linux', served('odbc-sqlcmd', build('18.6.0001.1', 'Linux', '18.6.1.1')))];
  assert.equal(dbClientVerdict(odbcOnly, 'sqlcmd', 'linux', 0, LINES[8].stdout).ok, false, 'go-sqlcmd is not read as the ODBC client');
});

test('DC4b: Oracle 5.7\'s "Ver 14.14 Distrib 5.7.44" is Oracle\'s 5.7.44: never MariaDB\'s ("Distrib" alone is no MariaDB word), and never the version 14.14', () => {
  const oracle57 = [rowOf('mysql', 'linux', served('oracle', build('5.7.44', ', for Linux (x86_64) using  EditLine wrapper')))];
  const mariaOnly = [rowOf('mysql', 'linux', served('mariadb', build('5.7.44', ', for Linux (x86_64) using  EditLine wrapper')))];

  assert.deepEqual(dbClientVerdict(oracle57, 'mysql', 'linux', 0, ORACLE_5_7), { ok: true, vendor: 'oracle', version: '5.7.44', tag: ', for Linux (x86_64) using  EditLine wrapper' });
  assert.equal(dbClientVerdict(mariaOnly, 'mysql', 'linux', 0, ORACLE_5_7).ok, false, 'a table that serves MariaDB 5.7.44 does not serve Oracle\'s 5.7.44');
  const unrecorded = dbClientVerdict([rowOf('mysql', 'linux', served('oracle', build('8.4.13', LINES[3].tag)))], 'mysql', 'linux', 0, ORACLE_5_7);
  assert.equal(!unrecorded.ok && unrecorded.sentence.includes('Ver 14.14 Distrib 5.7.44'), true, 'DR8 names the line as Oracle\'s');
  for (const line of LINES.filter((one) => one.vendor === 'mariadb')) {
    assert.equal(dbClientVerdict([rowOf('mysql', 'linux', served('oracle', build(line.version, line.tag)))], 'mysql', 'linux', 0, line.stdout).ok, false, `${line.id}: MariaDB's own line is not Oracle's`);
  }
});

const sentenceOf = (answer: Reading): string => (answer.ok ? '' : answer.sentence);

test('DC4c: a line is read where the client prints it: go-sqlcmd\'s first line is its name, the ODBC client\'s version has four numbers, and a Linux path before the program is not in the token', () => {
  const first = (line: Line): string => line.stdout.split('\n')[0];
  assert.equal(first(LINES[8]), 'sqlcmd: Install/Create/Query SQL Server, Azure SQL, and Tools');
  assert.equal(LINES.filter((one) => one.vendor === 'odbc-sqlcmd').every((one) => /^\d+\.\d+\.\d{4}\.\d+$/.test(one.version)), true, 'the recorded ODBC versions are 18.6.0001.1, not 18.6.1.1');
  for (const line of LINES.filter((one) => one.client === 'mysql' && one.platform === 'linux')) {
    const answer = dbClientVerdict([rowOf('mysql', 'linux')], 'mysql', 'linux', 0, line.stdout);
    assert.equal(/\/(?:usr|home)\//.test(sentenceOf(answer)), false, `${line.id}: no path in the sentence`);
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * The walk (DC11) and the spawn that asks (DC5-DC10, DC12, DC13)
 * ------------------------------------------------------------------------------------------------------------- */

interface FakeFile {
  size: number;
  mtimeMs: number;
  realPath?: string;
  launcher?: boolean;
}

/** A file system of named files: `identityOf` is what the walk reads of a file, the identity of the file behind a link. */
function fakeFiles(files: Map<string, FakeFile>, texts: Map<string, string> = new Map(), onRead: (file: string) => void = () => undefined): DbFiles {
  return {
    readText: (file) => {
      onRead(file);
      return texts.get(file);
    },
    identityOf: (file) => {
      const found = files.get(file);
      return found === undefined ? undefined : { realPath: found.realPath ?? file, size: found.size, mtimeMs: found.mtimeMs, launcher: found.launcher === true };
    },
  };
}

const PSQL_FILE = '/opt/found/bin/psql';
const SOURCE: NodeJS.ProcessEnv = { PATH: '/opt/found/bin:/usr/bin', HOME: '/home/someone', BRIDGE_TEST_SECRET: 'a-secret', PGPASSWORD: 'leaked', SSH_AUTH_SOCK: '/run/agent.sock' };

test('DC11: the walk takes the first file for the word in an absolute folder of PATH: a relative folder first is skipped, a link is read as the file behind it, no file at all is undefined, and on win32 the word gets .exe', () => {
  const files = new Map<string, FakeFile>([
    ['bin/psql', { size: 1, mtimeMs: 1 }],
    ['/usr/bin/psql', { size: 7, mtimeMs: 9, realPath: '/usr/lib/postgresql/18/bin/psql' }],
    ['/later/psql', { size: 2, mtimeMs: 2 }],
  ]);
  const walk = (word: string, pathValue: string | undefined, platform: NodeJS.Platform, known = files): ReturnType<typeof resolveDbProgram> => resolveDbProgram(word, pathValue, platform, fakeFiles(known));

  assert.deepEqual(walk('psql', 'bin:/usr/bin:/later', 'linux'), { program: 'psql', path: '/usr/bin/psql', realPath: '/usr/lib/postgresql/18/bin/psql', size: 7, mtimeMs: 9, launcher: false }, 'a relative folder is skipped; the identity is of the file behind the link; the path is the one found, not its real path');
  assert.equal(walk('psql', '/elsewhere:bin', 'linux'), undefined, 'no file in an absolute folder');
  assert.equal(walk('psql', undefined, 'linux'), undefined, 'no PATH');
  assert.equal(walk('psql', '.:', 'linux'), undefined, 'an empty entry and a dot are relative');
  const win = new Map<string, FakeFile>([['C:\\tools\\psql.exe', { size: 3, mtimeMs: 4 }], ['bin\\psql.exe', { size: 5, mtimeMs: 6 }]]);
  assert.deepEqual(walk('psql', 'bin;C:\\tools', 'win32', win), { program: 'psql', path: 'C:\\tools\\psql.exe', realPath: 'C:\\tools\\psql.exe', size: 3, mtimeMs: 4, launcher: false }, 'on win32 the word with .exe, the folders split at a semicolon');
});

interface Run {
  readonly program: string | undefined;
  readonly argv: string[];
  readonly options: Parameters<ClientRunner>[1];
  readonly folder: { readonly existed: boolean; readonly files: string[] };
}

interface Rig {
  readonly check: DbClientCheck;
  readonly runs: Run[];
  readonly notes: string[];
  readonly files: Map<string, FakeFile>;
  readonly texts: Map<string, string>;
  readonly dir: string;
}

const GOOD_PSQL = (): ReturnType<ClientRunner> => Promise.resolve({ exitCode: 0, stdout: LINES[0].stdout, stderr: '' });
const BAD_PSQL = (): ReturnType<ClientRunner> => Promise.resolve({ exitCode: 0, stdout: 'psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)\n', stderr: '' });
const SERVED_PSQL = [rowOf('psql', 'linux', served('postgresql', build('18.7', '(Ubuntu 18.7-1.pgdg26.04+2)')))];

/** A check over a fake file system and a runner that records what it was given and what its folder held while it ran; `answers` are used in turn, the last again. */
function rig(t: TestContext, answers: readonly (() => ReturnType<ClientRunner>)[], over: { rows?: readonly DbProfileRow[]; platform?: NodeJS.Platform; source?: NodeJS.ProcessEnv; extra?: Map<string, FakeFile>; texts?: Map<string, string>; onRead?: (file: string) => void } = {}): Rig {
  const dir = ownedDir(t, 'dbclient');
  const given = { texts: over.texts, onRead: over.onRead, rows: SERVED_PSQL, platform: 'linux' as NodeJS.Platform, source: SOURCE, extra: new Map<string, FakeFile>([[PSQL_FILE, { size: 10, mtimeMs: 100 }]]), ...over };
  const files = given.extra;
  const texts = given.texts ?? new Map<string, string>();
  const runs: Run[] = [];
  const notes: string[] = [];
  const run: ClientRunner = (argv, options) => {
    const cwd = options.cwd as string;
    runs.push({ program: options.program, argv, options, folder: { existed: fs.existsSync(cwd), files: fs.existsSync(cwd) ? fs.readdirSync(cwd) : [] } });
    return answers[Math.min(runs.length - 1, answers.length - 1)]();
  };
  const check = bridgedDbClientCheck({ storageDir: dir, rows: given.rows, run, platform: given.platform, source: given.source, files: fakeFiles(files, texts, given.onRead), note: (line) => notes.push(line) });
  return { check, runs, notes, files, texts, dir };
}

const GOOD_OK = { ok: true, vendor: 'postgresql', version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)' } as const;
const FILE = { program: 'psql', path: PSQL_FILE, realPath: PSQL_FILE, size: 10, mtimeMs: 100, launcher: false } as const;

test('DC5: a good answer is kept (a second call spawns nothing), a bad one is not (a second call spawns again)', async (t) => {
  const good = rig(t, [GOOD_PSQL]);
  const first = await good.check({ client: 'psql' });
  const second = await good.check({ client: 'psql' });

  assert.deepEqual([first, second], [{ ...GOOD_OK, file: FILE }, { ...GOOD_OK, file: FILE }]);
  assert.equal(good.runs.length, 1, 'one spawn for two calls');

  const bad = rig(t, [BAD_PSQL]);
  const one = await bad.check({ client: 'psql' });
  const two = await bad.check({ client: 'psql' });

  assert.equal(one.ok || two.ok, false);
  assert.equal(bad.runs.length, 2, 'a bad verdict is asked again');
});

test('DC6: the version spawn starts the path the walk found with --version alone (sqlcmd: -?), under the bridged names only, in a folder of its own that held nothing, had a name no other check had and is gone afterwards, also when the runner throws', async (t) => {
  const first = rig(t, [GOOD_PSQL]);
  const guards = { window: new AbortController().signal };

  await first.check({ client: 'psql', ...guards });

  const [one] = first.runs;
  assert.equal(one.program, PSQL_FILE, 'the path found, not the bare word');
  assert.deepEqual(one.argv, ['--version']);
  assert.deepEqual(one.options.env, bridgedSshEnv(SOURCE, 'linux'));
  assert.deepEqual(Object.keys(one.options.env).sort(), [...BRIDGED_ENV_POSIX].sort(), 'no password variable, no secret of the host, no agent socket');
  assert.equal(one.options.timeoutMs, CLIENT_CHECK_TIMEOUT_MS);
  assert.equal(one.options.timeoutMs, 10_000);
  assert.equal(path.dirname(one.options.cwd as string), materializedKeysDir(first.dir), 'a folder under keys/<pid>/');
  assert.deepEqual(one.folder, { existed: true, files: [] }, 'it was there and held nothing while the client ran');
  assert.equal(fs.existsSync(one.options.cwd as string), false, 'and it is gone afterwards');

  const other = rig(t, [BAD_PSQL, GOOD_PSQL]);
  await other.check({ client: 'psql' });
  await other.check({ client: 'psql' });
  const names = [...first.runs, ...other.runs].map((run) => path.basename(run.options.cwd as string));
  assert.equal(new Set(names).size, names.length, 'no two spawns, of one check or of two, shared a folder name');

  const throwing = rig(t, [() => Promise.reject(Object.assign(new Error('spawn psql EACCES'), { code: 'EACCES' }))]);
  await throwing.check({ client: 'psql' });
  assert.deepEqual(fs.readdirSync(materializedKeysDir(throwing.dir)), [], 'a runner that threw leaves no folder');

  const sqlcmd = rig(t, [() => Promise.resolve({ exitCode: 0, stdout: LINES[8].stdout, stderr: '' })], {
    rows: [rowOf('sqlcmd', 'linux', served('go-sqlcmd', build('1.10.0', '')))],
    extra: new Map([['/opt/found/bin/sqlcmd', { size: 1, mtimeMs: 1 }]]),
  });
  assert.equal((await sqlcmd.check({ client: 'sqlcmd' })).ok, true);
  assert.deepEqual(sqlcmd.runs[0].argv, ['-?'], 'sqlcmd answers its version in its help; both clients take -?');
});

test('DC7: a request that ends during the spawn is not an answer (the caller goes on as ended); a runner that cannot start the client is DR7 with the cause in the journal', async (t) => {
  const request = new AbortController();
  const held = rig(t, [() => new Promise((resolve) => setTimeout(() => resolve({ exitCode: 0, stdout: LINES[0].stdout, stderr: '' }), 100))]);
  const asking = held.check({ client: 'psql', request: request.signal });
  request.abort();

  await assert.rejects(asking, (error: Error) => error.name === 'AbortError');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(held.runs.length, 1, 'the spawn was started and was not ended by the request');
  assert.deepEqual(fs.readdirSync(materializedKeysDir(held.dir)), [], 'and its folder is gone once it ended');

  const missing = rig(t, [() => Promise.reject(Object.assign(new Error('spawn /opt/found/bin/psql ENOENT'), { code: 'ENOENT' }))]);
  assert.deepEqual(await missing.check({ client: 'psql' }), { ok: false, sentence: dr7('psql', 'unknown') });
  assert.deepEqual(missing.notes, ['psql: the client check could not start the client: spawn /opt/found/bin/psql ENOENT']);

  const gone = rig(t, [GOOD_PSQL]);
  await assert.rejects(gone.check({ client: 'psql', request: AbortSignal.abort() }), (error: Error) => error.name === 'AbortError', 'a request that ended before the start starts nothing');
  assert.equal(gone.runs.length, 0);
  const window = rig(t, [GOOD_PSQL]);
  await assert.rejects(window.check({ client: 'psql', window: AbortSignal.abort() }), (error: Error) => error.name === 'AbortError', 'a window that ended starts nothing');
  assert.equal(window.runs.length, 0);
});

test('DC8: a table that serves no row for the client on this platform starts nothing', async (t) => {
  for (const rows of [[], [rowOf('psql', 'win32', served('postgresql', build('18.7', '(Ubuntu 18.7-1.pgdg26.04+2)')))], [{ client: 'psql', platform: 'linux', served: false } as DbProfileRow]]) {
    const world = rig(t, [GOOD_PSQL], { rows });

    const answer = await world.check({ client: 'psql' });

    assert.equal(answer.ok, false);
    assert.deepEqual(world.runs, [], 'nothing was started');
    assert.deepEqual(fs.existsSync(materializedKeysDir(world.dir)) ? fs.readdirSync(materializedKeysDir(world.dir)) : [], [], 'no folder was made');
  }
});

test('DC9: a good verdict stands while the file is the same; another size, another time, a link that points elsewhere, and another file first on PATH each cost one new version spawn of the file that is there now', async (t) => {
  const world = rig(t, [GOOD_PSQL]);
  await world.check({ client: 'psql' });
  await world.check({ client: 'psql' });
  assert.equal(world.runs.length, 1, 'with nothing changed: no spawn');

  world.files.set(PSQL_FILE, { size: 11, mtimeMs: 100 });
  const sized = await world.check({ client: 'psql' });
  assert.equal(world.runs.length, 2, 'another size');
  assert.equal(sized.ok && sized.file.size, 11, 'and the verdict carries the file that answered');

  world.files.set(PSQL_FILE, { size: 11, mtimeMs: 101 });
  await world.check({ client: 'psql' });
  assert.equal(world.runs.length, 3, 'another modification time');

  world.files.set(PSQL_FILE, { size: 11, mtimeMs: 101, realPath: '/usr/lib/postgresql/16/bin/psql' });
  await world.check({ client: 'psql' });
  assert.equal(world.runs.length, 4, 'a link that points elsewhere');

  world.files.set('/usr/bin/psql', { size: 1, mtimeMs: 1 });
  world.files.set(PSQL_FILE, { size: 11, mtimeMs: 101, realPath: '/usr/lib/postgresql/16/bin/psql' });
  await world.check({ client: 'psql' });
  assert.equal(world.runs.length, 4, 'a file that is later on PATH changes nothing');
  const earlier = rig(t, [GOOD_PSQL], { source: { ...SOURCE, PATH: '/usr/bin:/opt/found/bin' }, extra: new Map([[PSQL_FILE, { size: 10, mtimeMs: 100 }]]) });
  await earlier.check({ client: 'psql' });
  earlier.files.set('/usr/bin/psql', { size: 2, mtimeMs: 2 });
  await earlier.check({ client: 'psql' });
  assert.deepEqual(earlier.runs.map((run) => run.program), [PSQL_FILE, '/usr/bin/psql'], 'another file first on PATH: the new file is asked, not the old one');
});

/** A runner whose answer the test releases. */
function deferred(): { run: () => ReturnType<ClientRunner>; release: (stdout: string) => void } {
  let release: (stdout: string) => void = () => undefined;
  const wait = new Promise<string>((resolve) => {
    release = resolve;
  });
  return { run: async () => ({ exitCode: 0, stdout: await wait, stderr: '' }), release };
}

test('DC10: two calls for one file before the first verdict share one spawn; the first caller\'s request ending does not end it, and the second still gets the verdict; a bad verdict reaches both and a third call spawns again', async (t) => {
  const gate = deferred();
  const world = rig(t, [gate.run]);
  const first = new AbortController();
  const a = world.check({ client: 'psql', request: first.signal });
  const b = world.check({ client: 'psql' });
  await new Promise((resolve) => setImmediate(resolve));
  first.abort();
  gate.release(LINES[0].stdout);

  await assert.rejects(a, (error: Error) => error.name === 'AbortError', 'the first caller goes on as ended');
  assert.deepEqual(await b, { ...GOOD_OK, file: FILE }, 'the second gets the verdict');
  assert.equal(world.runs.length, 1, 'one version spawn');
  assert.equal(world.runs[0].options.signal === undefined || !(world.runs[0].options.signal as AbortSignal).aborted, true, 'the spawn was not given the first caller\'s request');

  const badGate = deferred();
  const bad = rig(t, [badGate.run, GOOD_PSQL]);
  const c = bad.check({ client: 'psql' });
  const d = bad.check({ client: 'psql' });
  badGate.release('psql (PostgreSQL) 14.24 (Ubuntu 14.24-1.pgdg22.04+2)\n');
  const [one, two] = await Promise.all([c, d]);
  assert.equal(one.ok || two.ok, false, 'a bad verdict reaches both who waited');
  assert.equal(bad.runs.length, 1);
  const third = await bad.check({ client: 'psql' });
  assert.equal(bad.runs.length, 2, 'and a third call spawns again');
  assert.equal(third.ok, true);
});

test('DC12: a file that begins with #! answers a recorded build: the verdict is good for that call and is not kept, so the next call spawns again', async (t) => {
  const world = rig(t, [GOOD_PSQL], { extra: new Map([[PSQL_FILE, { size: 10, mtimeMs: 100, launcher: true }]]) });

  const first = await world.check({ client: 'psql' });
  const second = await world.check({ client: 'psql' });

  assert.equal(first.ok && second.ok, true, 'the verdicts are good');
  assert.equal(first.ok && first.file.launcher, true, 'and say the file is a launcher');
  assert.equal(world.runs.length, 2, 'two version spawns');
});

test('DC13: the check takes no exec slot: two calls for one file at once start one child, and a window with every slot taken still gets its version asked', async (t) => {
  const gate = deferred();
  const world = rig(t, [gate.run]);
  const calls = [world.check({ client: 'psql' }), world.check({ client: 'psql' }), world.check({ client: 'psql' })];
  gate.release(LINES[0].stdout);

  const answers = await Promise.all(calls);

  assert.equal(answers.every((answer) => answer.ok), true);
  assert.equal(world.runs.length, 1, 'one child for three callers');
});

/* ---------------------------------------------------------------------------------------------------------------
 * L11: the ODBC client's verdict is bound to the driver file it loads (DC14)
 * ------------------------------------------------------------------------------------------------------------- */

const ODBC_FILE = '/opt/found/bin/sqlcmd';
const ODBCINST = '/etc/odbcinst.ini';
const DRIVER_18 = '/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.6.so.1.1';
const DRIVER_17 = '/opt/microsoft/msodbcsql17/lib64/libmsodbcsql-17.11.so.1.1';
const iniOf = (driver18: string): string =>
  `[ODBC Driver 17 for SQL Server]\nDescription=Microsoft ODBC Driver 17 for SQL Server\nDriver=${DRIVER_17}\nUsageCount=1\n\n[ODBC Driver 18 for SQL Server]\nDescription=Microsoft ODBC Driver 18 for SQL Server\nDriver=${driver18}\nUsageCount=1\n`;
const ODBC_ROWS = [rowOf('sqlcmd', 'linux', served('odbc-sqlcmd', build('18.6.0001.1', 'Linux', '18.6.1.1')))];
const ODBC_ANSWER = (): ReturnType<ClientRunner> => Promise.resolve({ exitCode: 0, stdout: LINES[9].stdout, stderr: '' });

/** A check for the ODBC client over a fake file system that holds the client, the ODBC configuration and the driver it names. */
function odbcRig(t: TestContext, over: { files?: Map<string, FakeFile>; texts?: Map<string, string>; rows?: readonly DbProfileRow[] } = {}): Rig {
  const given = {
    files: new Map<string, FakeFile>([[ODBC_FILE, { size: 10, mtimeMs: 100 }], [DRIVER_18, { size: 500, mtimeMs: 50 }]]),
    texts: new Map([[ODBCINST, iniOf(DRIVER_18)]]),
    rows: ODBC_ROWS,
    ...over,
  };
  return rig(t, [ODBC_ANSWER], { rows: given.rows, extra: given.files, texts: given.texts });
}

const driverOfAnswer = (answer: Reading | Awaited<ReturnType<DbClientCheck>>): DbDriverFile | undefined => (answer.ok ? answer.driver : undefined);

const ODBC_DR8_BUILDS = 'the ODBC sqlcmd 18.6.0001.1 Linux with the driver 18.6.1.1';

test('DC14a: a recorded ODBC client is served only with the driver file its odbcinst.ini names: the verdict carries the driver (real path, size, time, the version from its file name), and a second call with nothing changed spawns and asks nothing new', async (t) => {
  const world = odbcRig(t);

  const first = await world.check({ client: 'sqlcmd' });
  const second = await world.check({ client: 'sqlcmd' });

  assert.deepEqual(first, { ok: true, vendor: 'odbc-sqlcmd', version: '18.6.0001.1', tag: 'Linux', file: { program: 'sqlcmd', path: ODBC_FILE, realPath: ODBC_FILE, size: 10, mtimeMs: 100, launcher: false }, driver: { path: DRIVER_18, realPath: DRIVER_18, size: 500, mtimeMs: 50, version: '18.6.1.1' } });
  assert.deepEqual(second, first);
  assert.equal(world.runs.length, 1, 'one version spawn for two calls');
});

test('DC14b: the section is the one of the client\'s own major version: the 17.11 client reads "ODBC Driver 17 for SQL Server" and its driver libmsodbcsql-17.11.so.1.1', async (t) => {
  const rows = [rowOf('sqlcmd', 'linux', served('odbc-sqlcmd', build('17.11.0001.1', 'Linux', '17.11.1.1')))];
  const world = rig(t, [() => Promise.resolve({ exitCode: 0, stdout: LINES[11].stdout, stderr: '' })], {
    rows, extra: new Map([[ODBC_FILE, { size: 10, mtimeMs: 100 }], [DRIVER_17, { size: 900, mtimeMs: 70 }]]), texts: new Map([[ODBCINST, iniOf(DRIVER_18)]]),
  });

  const answer = await world.check({ client: 'sqlcmd' });

  assert.equal(driverOfAnswer(answer)?.version, '17.11.1.1');
  assert.equal(driverOfAnswer(answer)?.path, DRIVER_17);
});

test('DC14c: a changed driver file (another size, another time, a link that points elsewhere) drops the kept verdict and asks the client again; a driver file that the odbcinst.ini now names elsewhere does the same; nothing changed asks nothing', async (t) => {
  const world = odbcRig(t);
  await world.check({ client: 'sqlcmd' });
  await world.check({ client: 'sqlcmd' });
  assert.equal(world.runs.length, 1, 'with nothing changed: no spawn');

  world.files.set(DRIVER_18, { size: 501, mtimeMs: 50 });
  const sized = await world.check({ client: 'sqlcmd' });
  assert.equal(world.runs.length, 2, 'another size of the driver');
  assert.equal(driverOfAnswer(sized)?.size, 501, 'and the verdict carries the driver that is there now');

  world.files.set(DRIVER_18, { size: 501, mtimeMs: 51 });
  await world.check({ client: 'sqlcmd' });
  assert.equal(world.runs.length, 3, 'another time of the driver');

  world.files.set(DRIVER_18, { size: 501, mtimeMs: 51, realPath: '/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.6.so.1.1.bak' });
  await world.check({ client: 'sqlcmd' });
  assert.equal(world.runs.length, 4, 'a link that points elsewhere');

  world.files.set('/opt/other/libmsodbcsql-18.6.so.1.1', { size: 7, mtimeMs: 7 });
  world.texts.set(ODBCINST, iniOf('/opt/other/libmsodbcsql-18.6.so.1.1'));
  const moved = await world.check({ client: 'sqlcmd' });
  assert.equal(world.runs.length, 5, 'the configuration now names another driver file');
  assert.equal(driverOfAnswer(moved)?.path, '/opt/other/libmsodbcsql-18.6.so.1.1');
});

test('DC14d: a driver that cannot be found or read is DR7 with the cause in the journal: no odbcinst.ini, no section for the client, no Driver line, a driver file that is not there and a file name that holds no version', async (t) => {
  const cases: [string, Parameters<typeof odbcRig>[1], string][] = [
    ['no odbcinst.ini', { texts: new Map() }, 'no ODBC configuration'],
    ['no section for the driver', { texts: new Map([[ODBCINST, '[SomethingElse]\nDriver=/x/libmsodbcsql-18.6.so.1.1\n']]) }, 'ODBC Driver 18 for SQL Server'],
    ['a section with no Driver line', { texts: new Map([[ODBCINST, '[ODBC Driver 18 for SQL Server]\nDescription=none\n']]) }, 'no Driver'],
    ['a Driver file that is not there', { files: new Map([[ODBC_FILE, { size: 10, mtimeMs: 100 }]]) }, 'not a file'],
    ['a file name with no version', { texts: new Map([[ODBCINST, iniOf('/opt/x/libother.so')]]), files: new Map([[ODBC_FILE, { size: 10, mtimeMs: 100 }], ['/opt/x/libother.so', { size: 1, mtimeMs: 1 }]]) }, 'version'],
  ];
  for (const [what, over, cause] of cases) {
    const world = odbcRig(t, over);
    const answer = await world.check({ client: 'sqlcmd' });

    assert.deepEqual(answer, { ok: false, sentence: dr7('sqlcmd', '0') }, what);
    assert.equal(world.notes.some((note) => note.includes(cause)), true, `${what}: the journal says why (${JSON.stringify(world.notes)})`);
  }
});

test('DC14f: on Windows no driver file can be read (the drivers are registered, not listed in a file): the ODBC client is DR7 there, with the cause in the journal', async (t) => {
  const win = rig(t, [() => Promise.resolve({ exitCode: 0, stdout: LINES[12].stdout, stderr: '' })], {
    rows: [rowOf('sqlcmd', 'win32', served('odbc-sqlcmd', build('16.0.1000.6', 'NT', '16.0.0.0')))], platform: 'win32', source: { PATH: 'C:\\found\\bin', USERNAME: 'x' },
    extra: new Map([['C:\\found\\bin\\sqlcmd.exe', { size: 1, mtimeMs: 1 }]]),
  });

  assert.deepEqual(await win.check({ client: 'sqlcmd' }), { ok: false, sentence: dr7('sqlcmd', '0') });
  assert.equal(win.notes.some((note) => note.includes('registry')), true, JSON.stringify(win.notes));
});

test('DC14e: the driver is part of the build: a driver another than the recorded one, and a recorded build that lists no driver, are DR8 and name the driver; go-sqlcmd and the other clients never read the ODBC configuration', async (t) => {
  const other = odbcRig(t, { files: new Map([[ODBC_FILE, { size: 10, mtimeMs: 100 }], ['/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.7.so.1.1', { size: 9, mtimeMs: 9 }]]), texts: new Map([[ODBCINST, iniOf('/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.7.so.1.1')]]) });
  assert.deepEqual(await other.check({ client: 'sqlcmd' }), { ok: false, sentence: dr8('sqlcmd', 'Version 18.6.0001.1 Linux with the driver 18.7.1.1', 'Linux', ODBC_DR8_BUILDS) });

  const bare = odbcRig(t, { rows: [rowOf('sqlcmd', 'linux', served('odbc-sqlcmd', build('18.6.0001.1', 'Linux')))] });
  assert.deepEqual(await bare.check({ client: 'sqlcmd' }), { ok: false, sentence: dr8('sqlcmd', 'Version 18.6.0001.1 Linux with the driver 18.6.1.1', 'Linux', 'the ODBC sqlcmd 18.6.0001.1 Linux') }, 'a build of the row with no driver is not served for any driver');

  const reads: string[] = [];
  const go = rig(t, [() => Promise.resolve({ exitCode: 0, stdout: LINES[8].stdout, stderr: '' })], {
    rows: [rowOf('sqlcmd', 'linux', served('go-sqlcmd', build('1.10.0', '')))], extra: new Map([[ODBC_FILE, { size: 10, mtimeMs: 100 }]]), texts: new Map([[ODBCINST, iniOf(DRIVER_18)]]), onRead: (file) => reads.push(file),
  });
  assert.equal((await go.check({ client: 'sqlcmd' })).ok, true);
  assert.deepEqual(reads, [], 'go-sqlcmd has no driver: the ODBC configuration is not read');
});

const posix = process.platform === 'win32' ? { skip: 'a shell script stands in for the client' } : {};

test('the real runner: a stand-in psql that prints a recorded line is ok, one that exits 3 is DR7, and a file in the walk of a real PATH is the one started', posix, async (t) => {
  const bin = ownedDir(t, 'bin');
  const stand = (body: string): string => {
    const file = path.join(bin, 'psql');
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const dir = ownedDir(t, 'dbclient-real');
  const check = bridgedDbClientCheck({ storageDir: dir, rows: SERVED_PSQL, platform: 'linux', source: { PATH: bin, HOME: '/h' } });

  stand('echo "psql (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)"');
  const ok = await check({ client: 'psql' });
  assert.equal(ok.ok && ok.file.path, path.join(bin, 'psql'));
  assert.equal(ok.ok && ok.file.launcher, true, 'a script is a launcher: its verdict is not kept');

  stand('exit 3');
  assert.deepEqual(await check({ client: 'psql' }), { ok: false, sentence: dr7('psql', '3') });
  assert.deepEqual(fs.readdirSync(materializedKeysDir(dir)), [], 'no folder is left');
});
