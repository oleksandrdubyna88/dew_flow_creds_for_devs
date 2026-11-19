import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DbVendor } from '../bridgedDbClient';
import { bridgedDbConnection } from '../bridgedDbProfile';
import { buildDbQueryLaunch } from '../dbCliLauncher';
import type { DbType } from '../types';
import { dr2 } from './bridgedDbCases';
import { verdictOf } from './bridgedDbVerdicts';

/**
 * The keys the E1.7 spec's §S7.9 adds to the profile (Q15 of the parent, V6), each for a pair that is served and with its leg: DK1 the keys of kind (a) (a transport-security key a client
 * can be made to honour by a measured flag), DK2 the keys of kind (b) (a key a client does not use, which changes neither who authenticates, which server is reached, nor how it is verified),
 * DK3 the keys that stay refused. The values and the flags are what PA1-f measured on the clients CI recorded (run 44543740467): go-sqlcmd knows `-N true`, `-N strict` and `-C`; the ODBC client
 * knows `-N` and `-C` and refuses `-N strict`; Oracle's `mysql` takes `--ssl-mode`, MariaDB's has no flag of that name. The leg that watches what each flag does to a connection is a CI leg of the
 * database harnesses (§S7.9's last column); this file pins what the builder writes.
 */

const ABSENT = '/keys/1/no-client-file';
const ENTRY = 'prod';

const MSSQL = (rest: string): string => `Server=db.example,1433;Database=orders;User Id=app;Password=pw${rest}`;
const MYSQL = (query: string): string => `mysql://app:pw@db.example:3306/orders${query}`;

function argsOf(dbType: DbType, stored: string, vendor: DbVendor): string[] | undefined {
  return buildDbQueryLaunch(dbType, stored, 'select 1', { bridged: true, absentFile: ABSENT, verdict: verdictOf(vendor) })?.args;
}

const refusalOf = (dbType: DbType, stored: string): string | undefined => {
  const answer = bridgedDbConnection(dbType, stored, ENTRY);
  return answer.ok ? undefined : answer.sentence;
};

/** The two arguments that follow `flag` at its first place. */
const after = (args: readonly string[] | undefined, flag: string): string | undefined => args?.[(args?.indexOf(flag) ?? -2) + 1];

const WITHOUT = MSSQL('');

test('DK1 (T72): Encrypt is written as the flag each client measured: go-sqlcmd -N true and -N strict, the ODBC client -N alone, and any value no client measured makes no launch', () => {
  assert.deepEqual(argsOf('mssql', MSSQL(';Encrypt=true'), 'go-sqlcmd')?.slice(-5, -1), ['-b', '-x', '-N', 'true'], 'go-sqlcmd, true: after -b -x, before the authentication flag');
  assert.equal(after(argsOf('mssql', MSSQL(';Encrypt=Strict'), 'go-sqlcmd'), '-N'), 'strict', 'a value is read in any letter case and written in one');
  assert.equal(argsOf('mssql', MSSQL(';Encrypt=false'), 'go-sqlcmd'), undefined, 'false is not a spelling PA1-f measured: it is no launch, and above all it is not true');
  const odbc = argsOf('mssql', MSSQL(';Encrypt=true'), 'odbc-sqlcmd');
  assert.deepEqual(odbc?.slice(-3), ['-b', '-x', '-N'], 'the ODBC client takes -N alone');
  assert.equal(argsOf('mssql', MSSQL(';Encrypt=strict'), 'odbc-sqlcmd'), undefined, 'the ODBC client refuses -N strict (PA1-f)');
  assert.equal(argsOf('mssql', MSSQL(';Encrypt=false'), 'odbc-sqlcmd'), undefined);
  assert.equal(after(argsOf('mssql', 'mssql://app:pw@db.example:1433/orders?encrypt=true', 'go-sqlcmd'), '-N'), 'true', 'the URI form of the key');
});

test('DK1 (T72): TrustServerCertificate true is -C for both clients and false is the default: the launch without the key', () => {
  for (const vendor of ['go-sqlcmd', 'odbc-sqlcmd'] as const) {
    assert.equal(argsOf('mssql', MSSQL(';TrustServerCertificate=true'), vendor)?.includes('-C'), true, vendor);
    assert.deepEqual(argsOf('mssql', MSSQL(';TrustServerCertificate=false'), vendor), argsOf('mssql', WITHOUT, vendor), `${vendor}: false writes nothing`);
    assert.equal(argsOf('mssql', MSSQL(';Trust Server Certificate=true'), vendor), undefined, `${vendor}: another spelling of the key is refused (DR2)`);
  }
});

function sslModesRefused(): void {
  for (const value of ['VERIFY_CA', 'VERIFY_IDENTITY', 'x']) {
    assert.match(refusalOf('mysql', MYSQL(`?ssl-mode=${value}`)) ?? '', /The ssl-mode of "prod" has a form that cannot be given to mysql/, value);
  }
}

test('DK1 (T72): ssl-mode of a mysql URI is --ssl-mode for Oracle\'s client, after --protocol=TCP; MariaDB\'s client has no such flag and so no launch; VERIFY_CA and VERIFY_IDENTITY are refused', () => {
  for (const value of ['DISABLED', 'PREFERRED', 'REQUIRED']) {
    assert.deepEqual(argsOf('mysql', MYSQL(`?ssl-mode=${value.toLowerCase()}`), 'oracle')?.slice(1, 3), ['--protocol=TCP', `--ssl-mode=${value}`], `${value}: written in capitals, straight after --protocol=TCP`);
    assert.equal(argsOf('mysql', MYSQL(`?ssl-mode=${value}`), 'mariadb'), undefined, `${value}: MariaDB's client has no --ssl-mode`);
  }
  sslModesRefused();
});

const KIND_B = ['Application Name=a b', 'App=x', 'Persist Security Info=false', 'MultipleActiveResultSets=true', 'Pooling=false', 'Connect Retry Count=3', 'Connect Retry Interval=5', 'Connection Timeout=15', 'Connect Timeout=15'];

function kindBIsDropped(vendor: DbVendor): void {
  for (const part of KIND_B) {
    assert.deepEqual(argsOf('mssql', MSSQL(`;${part}`), vendor), argsOf('mssql', WITHOUT, vendor), `${vendor}: ${part}`);
  }
}

test('DK2 (T72): a key of kind (b) is carried into no argument: the launch equals the one without it, for both clients', () => {
  for (const vendor of ['go-sqlcmd', 'odbc-sqlcmd'] as const) {
    kindBIsDropped(vendor);
  }
  assert.match(refusalOf('mssql', MSSQL(';Connection Timeout=x')) ?? '', /The connection timeout of "prod"/, 'its value still has a shape');
  assert.match(refusalOf('mssql', MSSQL(';Pooling=false;Pooling=true')) ?? '', /more than once/, 'and it is given once');
});

test('DK3: the keys that are not added stay refused by name (DR2): who authenticates, which server is reached, how the server is verified', () => {
  const mssql = ['Integrated Security=true', 'Trusted_Connection=yes', 'Authentication=ActiveDirectoryIntegrated', 'Failover Partner=other', 'MultiSubnetFailover=true', 'ApplicationIntent=ReadOnly'];
  for (const part of mssql) {
    const key = part.split('=')[0].toLowerCase();
    assert.equal(refusalOf('mssql', MSSQL(`;${part}`)), dr2(`"${key}"`), part);
  }
  assert.equal(refusalOf('mysql', MYSQL('?ssl-ca=/x')), dr2('"ssl-ca"'));
  assert.equal(refusalOf('postgres', 'postgresql://app:pw@db.example:5432/orders?sslrootcert=/x'), dr2('"sslrootcert"'));
  assert.equal(refusalOf('postgres', 'postgresql://app:pw@db.example:5432/orders?target_session_attrs=any'), dr2('"target_session_attrs"'));
});
