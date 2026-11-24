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
 * can be made to honour by a measured flag; for `sqlcmd` none yet: Encrypt and TrustServerCertificate wait for their CI leg), DK2 the keys of kind (b) (a key a client does not use, which changes neither who authenticates, which server is reached, nor how it is verified),
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

const WITHOUT = MSSQL('');

test('DK1 (T72): Encrypt and TrustServerCertificate stay refused by name on a bridge (DR2), for both clients, until a CI leg shows what each does (§S7.9; run 45380823025 had none)', () => {
  for (const part of ['Encrypt=true', 'Encrypt=strict', 'Encrypt=false', 'TrustServerCertificate=true', 'TrustServerCertificate=false']) {
    const key = part.split('=')[0].toLowerCase();
    assert.equal(refusalOf('mssql', MSSQL(`;${part}`)), dr2(`"${key}"`), part);
    for (const vendor of ['go-sqlcmd', 'odbc-sqlcmd'] as const) {
      assert.equal(argsOf('mssql', MSSQL(`;${part}`), vendor), undefined, `${vendor}: ${part} makes no launch`);
    }
  }
  assert.equal(refusalOf('mssql', 'mssql://app:pw@db.example:1433/orders?encrypt=true'), dr2('"encrypt"'), 'the URI form of the key');
  assert.notEqual(argsOf('mssql', WITHOUT, 'odbc-sqlcmd'), undefined, 'the connection without the keys still launches');
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
