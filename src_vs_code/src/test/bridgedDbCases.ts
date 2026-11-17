import type { DbType } from '../types';

/**
 * The stored connections of the E1.6 spec §S6.15 Z4 (DP4-DP11), shared by `bridgedDbProfile.test.ts` (the builder's sentence, DP13's sentinel), by
 * `dbCliLauncher.test.ts` (Q10: the launch refuses each; Q11: off a bridge each launches as `main` does) and by `bridgeRunSites.test.ts`.
 *
 * <p>The sentences are written out here, word for word, and not taken from the module under test: a test that read them back from the code would pass on any wording.
 * `stored(v)` puts the value `v` wherever the stored connection holds a value, so the sentinel of DP13 can stand in every one of them.</p>
 */

export const ENTRY = 'prod';
export const SENTINEL = 'zq9x7k2m';

export const dr2 = (key: string): string => `The connection stored in "${ENTRY}" holds the setting ${key}. Through a Remote Bridge the connection is built from the host, port, database, user and password of the entry, and that setting is not carried.`;
export const dr3 = (key: string): string => `The connection stored in "${ENTRY}" holds the setting ${key} more than once.`;
export const dr4 = (what: 'user' | 'password'): string => `"${ENTRY}" stores no ${what}. Through a Remote Bridge a database client may log in with the entry's own user and password and with nothing else.`;
export const DR5 = `The host of "${ENTRY}" is missing, or is a socket folder or a list of hosts. Through a Remote Bridge a database is reached over the network by one host name or address.`;
/**
 * DR6's constraint, written out here word for word and not read from the module under test: what a field must be so that the client can be given it. The sentence
 * says the constraint and never the value (DP13's sentinel). `host` and `database` differ by client: only `psql` reads a
 * database name as a connection string.
 */
const HOST_WORDS = "one host name of letters, digits, '.', '-' and '_', not beginning with '-', with no control character, or an IPv6 address in brackets";
const DATABASE_WORDS = "it must hold no control character and must not begin with '-'";
const CONNECTION_WORDS: Readonly<Record<string, string>> = {
  psql: 'it must be one postgres:// or postgresql:// URL with no "#" and no control character',
  mongosh: 'a MongoDB connection is not carried',
};
const CONSTRAINTS: Readonly<Record<string, (client: string) => string>> = {
  connection: (client) => CONNECTION_WORDS[client] ?? 'it must be one URL with no "#", or one key=value string, with no control character',
  host: (client) => (client === 'sqlcmd' ? "it must hold no control character and must not begin with '-'" : `it must be ${HOST_WORDS}`),
  port: () => 'it must be a whole number from 1 to 65535',
  user: () => 'it must hold no control character',
  password: () => 'it must hold no control character',
  database: (client) => (client === 'psql' ? `${DATABASE_WORDS}, must hold no "=" and must not begin with a postgres URL scheme` : DATABASE_WORDS),
  sslmode: () => 'it must be one of disable, allow, prefer, require, verify-ca or verify-full',
  connect_timeout: () => 'it must be one to four digits',
  application_name: () => 'it must be 1 to 63 letters, digits, spaces, "_", "." or "-"',
};
export const dr6 = (field: string, client: string): string => {
  const constraint = CONSTRAINTS[field]?.(client) ?? 'it must be in the form the profile carries';
  return `The ${field} of "${ENTRY}" has a form that cannot be given to ${client} through a Remote Bridge: ${constraint}.`;
};
export const UNKNOWN = 'an unknown setting';

export interface Refused {
  readonly id: string;
  readonly dbType: DbType;
  readonly stored: (v: string) => string;
  readonly sentence: string;
}

const PG = (rest: string) => (v: string): string => `postgresql://app:pw${v}@db.example:5432/orders${rest.replaceAll('{v}', v)}`;
const MYSQL = (rest: string) => (v: string): string => `mysql://app:pw${v}@db.example:3306/orders${rest.replaceAll('{v}', v)}`;
const KV = (rest: string) => (v: string): string => `Server=db.example,1433;Database=orders;User Id=app;Password=pw${v}${rest.replaceAll('{v}', v)}`;

/** The postgres keys of DP4: each is refused by name, whatever its value. */
export const DP4_KEYS = ['service', 'servicefile', 'passfile', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl', 'sslcrldir', 'sslpassword', 'sslkeylogfile', 'sslcertmode',
  'host', 'hostaddr', 'user', 'password', 'options', 'gssencmode', 'krbsrvname', 'gsslib', 'require_auth', 'requirepeer', 'target_session_attrs'] as const;

const dp4: Refused[] = DP4_KEYS.map((key) => ({ id: `DP4 ${key}`, dbType: 'postgres', stored: PG(`?${key}={v}`), sentence: dr2(`"${key}"`) }));

const dp5: Refused[] = [
  { id: 'DP5 encoded key', dbType: 'postgres', stored: PG('?%73ervice={v}'), sentence: dr2('"service"') },
  { id: 'DP5 encoded passfile', dbType: 'postgres', stored: PG('?%70assfile={v}'), sentence: dr2('"passfile"') },
  { id: 'DP5 upper case', dbType: 'postgres', stored: PG('?SERVICE={v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 doubled', dbType: 'postgres', stored: PG('?sslmode=require&sslmode={v}'), sentence: dr3('"sslmode"') },
  { id: 'DP5 doubled by encoding', dbType: 'postgres', stored: PG('?sslmode=require&%73slmode={v}'), sentence: dr3('"sslmode"') },
  { id: 'DP5 doubled unknown', dbType: 'postgres', stored: PG('?x{v}=1&x{v}=2'), sentence: dr3(UNKNOWN) },
  { id: 'DP5 no equals', dbType: 'postgres', stored: PG('?sslmode{v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 empty key', dbType: 'postgres', stored: PG('?={v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 empty part', dbType: 'postgres', stored: PG('?sslmode=require&'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 empty query', dbType: 'postgres', stored: PG('?'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 bad escape', dbType: 'postgres', stored: PG('?sslmode=%zz{v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP5 fragment', dbType: 'postgres', stored: PG('?sslmode=require#{v}'), sentence: dr6('connection', 'psql') },
  { id: 'DP5 fragment alone', dbType: 'postgres', stored: PG('#{v}'), sentence: dr6('connection', 'psql') },
];

const dp6: Refused[] = [
  { id: 'DP6 sslmode case', dbType: 'postgres', stored: PG('?sslmode=VERIFY-FULL'), sentence: dr6('sslmode', 'psql') },
  { id: 'DP6 sslmode value', dbType: 'postgres', stored: PG('?sslmode={v}'), sentence: dr6('sslmode', 'psql') },
  { id: 'DP6 timeout float', dbType: 'postgres', stored: PG('?connect_timeout=1e3'), sentence: dr6('connect_timeout', 'psql') },
  { id: 'DP6 timeout long', dbType: 'postgres', stored: PG('?connect_timeout=12345'), sentence: dr6('connect_timeout', 'psql') },
  { id: 'DP6 timeout empty', dbType: 'postgres', stored: PG('?connect_timeout='), sentence: dr6('connect_timeout', 'psql') },
  { id: 'DP6 name quote', dbType: 'postgres', stored: PG("?application_name=a%27b"), sentence: dr6('application_name', 'psql') },
  { id: 'DP6 name long', dbType: 'postgres', stored: PG(`?application_name=${'a'.repeat(64)}`), sentence: dr6('application_name', 'psql') },
];

const NO_USER_OR_PASSWORD: Refused[] = [
  { id: 'DP7 postgres no user', dbType: 'postgres', stored: (v) => `postgresql://:pw${v}@db.example/orders`, sentence: dr4('user') },
  { id: 'DP7 postgres user, no password', dbType: 'postgres', stored: (v) => `postgresql://app${v}@db.example/orders`, sentence: dr4('password') },
  { id: 'DP7 postgres empty password', dbType: 'postgres', stored: (v) => `postgresql://app${v}:@db.example/orders`, sentence: dr4('password') },
  { id: 'DP7 postgres no userinfo', dbType: 'postgres', stored: () => 'postgresql://db.example/orders', sentence: dr4('user') },
  { id: 'DP7 mysql no user', dbType: 'mysql', stored: (v) => `mysql://:pw${v}@db.example/orders`, sentence: dr4('user') },
  { id: 'DP7 mysql no password', dbType: 'mysql', stored: (v) => `mysql://app${v}@db.example/orders`, sentence: dr4('password') },
  { id: 'DP7 mysql empty password', dbType: 'mysql', stored: (v) => `mysql://app${v}:@db.example/orders`, sentence: dr4('password') },
  { id: 'DP7 mssql uri no user', dbType: 'mssql', stored: (v) => `mssql://:pw${v}@db.example/orders`, sentence: dr4('user') },
  { id: 'DP7 mssql uri no password', dbType: 'mssql', stored: (v) => `mssql://app${v}@db.example/orders`, sentence: dr4('password') },
  { id: 'DP7 mysql kv no user', dbType: 'mysql', stored: (v) => `Server=db.example;Database=d;Password=pw${v}`, sentence: dr4('user') },
  { id: 'DP7 mysql kv no password', dbType: 'mysql', stored: (v) => `Server=db.example;Database=d;User Id=app${v}`, sentence: dr4('password') },
  { id: 'DP7 mssql kv no user', dbType: 'mssql', stored: (v) => `Server=db.example,1433;Database=d;Password=pw${v}`, sentence: dr4('user') },
  { id: 'DP7 mssql kv empty user', dbType: 'mssql', stored: (v) => `Server=db.example,1433;User Id=;Password=pw${v}`, sentence: dr4('user') },
  { id: 'DP7 mssql kv no password', dbType: 'mssql', stored: (v) => `Server=db.example,1433;User Id=app${v}`, sentence: dr4('password') },
  { id: 'DP7 mssql kv empty password', dbType: 'mssql', stored: (v) => `Server=db.example,1433;User Id=app${v};Password=`, sentence: dr4('password') },
];

const dp8: Refused[] = [
  { id: 'DP8 empty host, no user', dbType: 'postgres', stored: () => 'postgresql:///orders', sentence: DR5 },
  { id: 'DP8 empty host, user', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@/orders`, sentence: DR5 },
  { id: 'DP8 socket folder', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@%2Fvar%2Frun%2Fpostgresql/orders`, sentence: DR5 },
  { id: 'DP8 abstract socket', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@%40sock/orders`, sentence: DR5 },
  { id: 'DP8 list of hosts', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@h1,h2/orders`, sentence: DR5 },
  { id: 'DP8 list of hosts with ports', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@h1:5432,h2:5433/orders`, sentence: DR5 },
  { id: 'DP8 socket in query form', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@%2Ftmp/orders`, sentence: DR5 },
  { id: 'DP8 mysql empty host', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@/orders`, sentence: DR5 },
  { id: 'DP8 mysql socket folder', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@%2Fvar%2Frun%2Fmysqld/orders`, sentence: DR5 },
  { id: 'DP8 mysql kv no server', dbType: 'mysql', stored: (v) => `Database=orders;User Id=app;Password=pw${v}`, sentence: DR5 },
  { id: 'DP8 mysql kv windows path', dbType: 'mysql', stored: (v) => `Server=C:\\pipes\\mysql;User Id=app;Password=pw${v}`, sentence: DR5 },
  { id: 'DP8 mssql kv no server', dbType: 'mssql', stored: (v) => `Database=orders;User Id=app;Password=pw${v}`, sentence: DR5 },
  { id: 'DP8 mssql uri empty host', dbType: 'mssql', stored: (v) => `mssql://app:pw${v}@/orders`, sentence: DR5 },
];

const dp10: Refused[] = [
  { id: 'DP10 database holds =', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example/service%3Ds1`, sentence: dr6('database', 'psql') },
  { id: 'DP10 database is a URI', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example/postgresql%3A%2F%2Fother`, sentence: dr6('database', 'psql') },
  { id: 'DP10 database is a short URI', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example/POSTGRES%3A%2F%2Fother`, sentence: dr6('database', 'psql') },
  { id: 'DP10 database line break', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example/a%0Ab`, sentence: dr6('database', 'psql') },
  { id: 'DP10 mysql database line break', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@db.example/a%0Ab`, sentence: dr6('database', 'mysql') },
];

const FIELDS: Refused[] = [
  { id: 'port 0', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@db.example:0/orders`, sentence: dr6('port', 'mysql') },
  { id: 'port too large', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example:99999/orders`, sentence: dr6('connection', 'psql') },
  { id: 'kv port not digits', dbType: 'mssql', stored: (v) => `Server=db.example;Port=12a;User Id=app;Password=pw${v}`, sentence: dr6('port', 'sqlcmd') },
  { id: 'kv port too large', dbType: 'mssql', stored: (v) => `Server=db.example;Port=70000;User Id=app;Password=pw${v}`, sentence: dr6('port', 'sqlcmd') },
  { id: 'host with a space', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db%20example/orders`, sentence: dr6('host', 'psql') },
  { id: 'host begins with a dash', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@-evil/orders`, sentence: dr6('host', 'mysql') },
  { id: 'kv host begins with a dash', dbType: 'mysql', stored: (v) => `Server=-evil;User Id=app;Password=pw${v}`, sentence: dr6('host', 'mysql') },
  { id: 'host line break', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db%0A.example/orders`, sentence: dr6('host', 'psql') },
  { id: 'user line break', dbType: 'postgres', stored: (v) => `postgresql://a%0Ab:pw${v}@db.example/orders`, sentence: dr6('user', 'psql') },
  { id: 'password line break', dbType: 'mysql', stored: (v) => `mysql://app:p%0Aw${v}@db.example/orders`, sentence: dr6('password', 'mysql') },
  { id: 'user bad escape', dbType: 'mysql', stored: (v) => `mysql://a%zz${v}:pw@db.example/orders`, sentence: dr6('user', 'mysql') },
  { id: 'raw control character', dbType: 'mssql', stored: (v) => `Server=db.example;User Id=app;Password=pw${v}\u0007`, sentence: dr6('connection', 'sqlcmd') },
  { id: 'postgres key-value string', dbType: 'postgres', stored: (v) => `host=db.example user=app password=pw${v}`, sentence: dr6('connection', 'psql') },
  { id: 'a scheme-less string for a URI type', dbType: 'postgres', stored: (v) => `db.example/pw${v}`, sentence: dr6('connection', 'psql') },
  { id: 'sqlcmd host begins with a dash', dbType: 'mssql', stored: (v) => `Server=-E;User Id=app;Password=pw${v}`, sentence: dr6('host', 'sqlcmd') },
  { id: 'sqlcmd uri host begins with a dash', dbType: 'mssql', stored: (v) => `mssql://app:pw${v}@-E:1433/orders`, sentence: dr6('host', 'sqlcmd') },
  { id: 'sqlcmd kv database begins with a dash', dbType: 'mssql', stored: (v) => `Server=db.example;Database=-E;User Id=app;Password=pw${v}`, sentence: dr6('database', 'sqlcmd') },
  { id: 'sqlcmd uri database begins with a dash', dbType: 'mssql', stored: (v) => `mssql://app:pw${v}@db.example:1433/-E`, sentence: dr6('database', 'sqlcmd') },
  { id: 'mysql uri database is an option', dbType: 'mysql', stored: (v) => `mysql://app:pw${v}@db.example/--init-command=x`, sentence: dr6('database', 'mysql') },
  { id: 'mysql kv database begins with a dash', dbType: 'mysql', stored: (v) => `Server=db.example;Database=-D;User Id=app;Password=pw${v}`, sentence: dr6('database', 'mysql') },
  { id: 'psql database begins with a dash', dbType: 'postgres', stored: (v) => `postgresql://app:pw${v}@db.example/-x${v}`, sentence: dr6('database', 'psql') },
  { id: 'mongodb', dbType: 'mongodb', stored: (v) => `mongodb://app:pw${v}@db.example/orders`, sentence: dr6('connection', 'mongosh') },
];

const dp11: Refused[] = [
  { id: 'DP11 mysql ssl-mode', dbType: 'mysql', stored: MYSQL('?ssl-mode={v}'), sentence: dr2('"ssl-mode"') },
  { id: 'DP11 mysql unknown key', dbType: 'mysql', stored: MYSQL('?x{v}=1'), sentence: dr2(UNKNOWN) },
  { id: 'DP11 mssql uri query', dbType: 'mssql', stored: (v) => `mssql://app:pw${v}@db.example:1433/orders?encrypt=true`, sentence: dr2('"encrypt"') },
  { id: 'DP11 Encrypt', dbType: 'mssql', stored: KV(';Encrypt={v}'), sentence: dr2('"encrypt"') },
  { id: 'DP11 TrustServerCertificate', dbType: 'mssql', stored: KV(';TrustServerCertificate={v}'), sentence: dr2('"trustservercertificate"') },
  { id: 'DP11 Connection Timeout', dbType: 'mssql', stored: KV(';Connection Timeout={v}'), sentence: dr2('"connection timeout"') },
  { id: 'DP11 Integrated Security', dbType: 'mssql', stored: KV(';Integrated Security={v}'), sentence: dr2('"integrated security"') },
  { id: 'DP11 Trusted_Connection', dbType: 'mysql', stored: KV(';Trusted_Connection={v}'), sentence: dr2('"trusted_connection"') },
  { id: 'DP11 unknown kv key', dbType: 'mssql', stored: KV(';Zk{v}=1'), sentence: dr2(UNKNOWN) },
  { id: 'DP11 part with no equals', dbType: 'mssql', stored: KV(';Encrypt{v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP11 part with an empty key', dbType: 'mssql', stored: KV(';={v}'), sentence: dr2(UNKNOWN) },
  { id: 'DP11 a value with a semicolon', dbType: 'mssql', stored: (v) => `Server=db.example;User Id=app;Password=p;w${v}`, sentence: dr2(UNKNOWN) },
  { id: 'DP11 doubled key', dbType: 'mssql', stored: KV(';User Id={v}'), sentence: dr3('"user id"') },
  { id: 'DP11 two keys for one field', dbType: 'mssql', stored: KV(';UID={v}'), sentence: dr3('"uid"') },
  { id: 'DP11 two keys for the host', dbType: 'mysql', stored: KV(';Data Source={v}'), sentence: dr3('"data source"') },
];

/** Every refused connection of DP4-DP11, with the fields of the two shapes the sentences name. */
export const REFUSED: readonly Refused[] = [...dp4, ...dp5, ...dp6, ...NO_USER_OR_PASSWORD, ...dp8, ...dp10, ...FIELDS, ...dp11];

/** The cases of DP4-DP11 that Q10 and Q11 name: a stored value of each, with the sentinel standing in every value. */
export const stored = (refused: Refused): string => refused.stored(SENTINEL);
