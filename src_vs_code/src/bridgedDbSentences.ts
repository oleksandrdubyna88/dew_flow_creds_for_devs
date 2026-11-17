import type { DbType } from './types';

/**
 * The journal sentences of a bridged database `query` (the E1.6 spec §S6.15 Z3, DR1-DR6). Pure, no `vscode`.
 *
 * <p>The agent reads none of these: on a bridge it reads `BRIDGE_USE_REFUSED(<entry of the call>)` and nothing else. Each sentence says what the code has
 * just checked and nothing about what comes next, and none holds a value or any other text of the stored connection: a setting is named only when it is
 * on a fixed list of the client's own setting names kept here, and by that list's spelling, never by what the connection said.</p>
 */

/** The program each database type is launched as, mongosh included: the one that is never launched is still named in a refusal. */
const CLIENT_NAMES: Readonly<Record<DbType, string>> = { postgres: 'psql', mysql: 'mysql', mssql: 'sqlcmd', mongodb: 'mongosh' };

/** The client's program name for a type; a type the code does not know is named by the words `a database client`. */
export function clientNameOf(dbType: DbType): string {
  return CLIENT_NAMES[dbType] ?? 'a database client';
}

const SYSTEM_NAMES: Readonly<Partial<Record<NodeJS.Platform, string>>> = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' };

/** The system as a person names it: `Linux`, `Windows`, `macOS`, or the platform's own name. */
export function systemNameOf(platform: NodeJS.Platform): string {
  return SYSTEM_NAMES[platform] ?? platform;
}

/** DR1: the pair is not served. */
export function DR1(client: string, platform: NodeJS.Platform): string {
  return `A Remote Bridge runs a database query only with a client and system whose behaviour was measured. ${client} on ${systemNameOf(platform)} is not among them.`;
}

/**
 * The names of the settings each dialect knows, in the spelling a person writes them: the only words a journal sentence may quote of a stored
 * connection. libpq's connection keywords; the mysql client's own options (and a connector's names for the same things); the keys an ADO or an ODBC
 * string uses. A key that is not on its list is named by the words `an unknown setting`, so no sentence holds a word the stored connection chose.
 */
const LIBPQ_KEYS = ['host', 'hostaddr', 'port', 'dbname', 'user', 'password', 'passfile', 'require_auth', 'channel_binding', 'connect_timeout', 'client_encoding', 'options',
  'application_name', 'fallback_application_name', 'keepalives', 'keepalives_idle', 'keepalives_interval', 'keepalives_count', 'tcp_user_timeout', 'replication',
  'gssencmode', 'sslmode', 'sslcompression', 'sslcert', 'sslkey', 'sslpassword', 'sslcertmode', 'sslrootcert', 'sslcrl', 'sslcrldir', 'sslsni', 'sslkeylogfile',
  'requirepeer', 'ssl_min_protocol_version', 'ssl_max_protocol_version', 'min_protocol_version', 'max_protocol_version', 'krbsrvname', 'gsslib', 'gssdelegation',
  'service', 'servicefile', 'target_session_attrs', 'load_balance_hosts'];
const MYSQL_KEYS = ['ssl-mode', 'ssl-ca', 'ssl-capath', 'ssl-cert', 'ssl-key', 'ssl-cipher', 'ssl-crl', 'ssl-crlpath', 'ssl-fips-mode', 'tls-version', 'tls-ciphersuites',
  'get-server-public-key', 'server-public-key-path', 'default-auth', 'plugin-dir', 'enable-cleartext-plugin', 'socket', 'protocol', 'compress', 'connect-timeout',
  'local-infile', 'init-command', 'default-character-set', 'character-sets-dir', 'login-path', 'defaults-file', 'defaults-extra-file', 'usessl', 'requiressl',
  'verifyservercertificate', 'allowpublickeyretrieval', 'sslmode'];
const ADO_KEYS = ['server', 'data source', 'address', 'addr', 'network address', 'port', 'database', 'initial catalog', 'user id', 'uid', 'user', 'username', 'password', 'pwd',
  'encrypt', 'trustservercertificate', 'trust server certificate', 'hostnameincertificate', 'host name in certificate', 'servercertificate', 'connection timeout',
  'connect timeout', 'timeout', 'command timeout', 'integrated security', 'trusted_connection', 'trusted connection', 'authentication', 'application name', 'app',
  'applicationintent', 'application intent', 'multisubnetfailover', 'multiple active result sets', 'multipleactiveresultsets', 'persist security info',
  'persistsecurityinfo', 'packet size', 'pooling', 'attachdbfilename', 'language', 'current language', 'workstation id', 'wsid', 'failover partner', 'failoverpartnerspn',
  'server spn', 'network library', 'network', 'net', 'driver', 'dsn', 'column encryption setting', 'enlist', 'replication', 'transaction binding', 'user instance',
  'type system version', 'connect retry count', 'connect retry interval', 'ip address preference'];

/** The list of names a dialect's keys are looked up in. */
export type KeyDialect = 'libpq' | 'mysql' | 'ado';

const KNOWN: Readonly<Record<KeyDialect, ReadonlySet<string>>> = {
  libpq: new Set(LIBPQ_KEYS),
  mysql: new Set([...MYSQL_KEYS, ...ADO_KEYS]),
  ado: new Set([...ADO_KEYS, ...MYSQL_KEYS]),
};

/** `<key>` of DR2 and DR3: the key in quotes when it is on the dialect's list, otherwise the words `an unknown setting`. */
export function settingWords(dialect: KeyDialect, key: string): string {
  return KNOWN[dialect].has(key) ? `"${key}"` : 'an unknown setting';
}

/** DR2: a setting outside the profile. */
export function DR2(entity: string, settingKey: string): string {
  return `The connection stored in "${entity}" holds the setting ${settingKey}. Through a Remote Bridge the connection is built from the host, port, database, user and password of the entry, and that setting is not carried.`;
}

/** DR3: a setting given twice. */
export function DR3(entity: string, settingKey: string): string {
  return `The connection stored in "${entity}" holds the setting ${settingKey} more than once.`;
}

/** DR4: no user, or no password. */
export function DR4(entity: string, what: 'user' | 'password'): string {
  return `"${entity}" stores no ${what}. Through a Remote Bridge a database client may log in with the entry's own user and password and with nothing else.`;
}

/** DR5: the host. */
export function DR5(entity: string): string {
  return `The host of "${entity}" is missing, or is a socket folder or a list of hosts. Through a Remote Bridge a database is reached over the network by one host name or address.`;
}

/** The words every host constraint shares: what a host name may hold. */
const HOST_WORDS = "one host name of letters, digits, '.', '-' and '_', not beginning with '-', with no control character, or an IPv6 address in brackets";
const DATABASE_WORDS = "it must hold no control character and must not begin with '-'";

/** What a connection of each client must be, as DR6 says it: a connection is a URL (or, for `mysql` and `sqlcmd`, a key=value string); `mongosh` is never carried. */
const CONNECTION_WORDS: Readonly<Record<string, string>> = {
  psql: 'it must be one postgres:// or postgresql:// URL with no "#" and no control character',
  mongosh: 'a MongoDB connection is not carried',
};

/** The constraint each field or profile setting must meet, in fixed words that hold no value of the connection. Only `psql` reads a database name as a connection string. */
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

/** DR6: a field outside its shape, and the constraint it did not meet. `field` is the name of a field or of a profile setting, never a value; the constraint is fixed words, never the stored value. */
export function DR6(entity: string, field: string, client: string): string {
  const constraint = CONSTRAINTS[field]?.(client) ?? 'it must be in the form the profile carries';
  return `The ${field} of "${entity}" has a form that cannot be given to ${client} through a Remote Bridge: ${constraint}.`;
}
