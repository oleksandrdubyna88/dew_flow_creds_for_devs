import type { DbType } from './types';
import { DR1, DR2, DR3, DR4, DR5, DR6, DR6Quoted, KeyDialect, clientNameOf, settingWords } from './bridgedDbSentences';
import { cleanHost } from './dbConnString';
import type { DbVendor } from './bridgedDbClient';

/**
 * The gate of a bridged database query (the E1.6 spec §S6.15 Z1; parent §4.11, Q18). Pure, no `vscode`.
 *
 * <p>A bridged `query` is a local subprocess under agent-written input, so it runs only for a client and a system whose behaviour was MEASURED. The table
 * below names every pair this code knows and says whether it is served. None is: E1.7 turns a row to served in the commit that records the probe runs of
 * its pair (parent §4.11), and until then every bridged query is refused before the stored connection is read and before any process starts.</p>
 */

export type DbClient = 'psql' | 'mysql' | 'sqlcmd';

/** A build whose legs ran: the version and the build tag exactly as the client's own version line gives them (PA1-a), and the record of its runs (`run <number> at <sha>`). */
export interface DbRecordedBuild {
  readonly version: string;
  readonly tag: string;
  readonly record: string;
  /**
   * The ODBC `sqlcmd` only (E1.7 spec §S7.16 L11): the version of the driver file the client loads, read from its file name (`libmsodbcsql-18.6.so.1.1` is `18.6.1.1`). The client's own line does not name its
   * driver, and its authentication lives in that library, so a build of this client is the pair of the two. A recorded ODBC build with no driver serves no driver.
   */
  readonly driver?: string;
}

/** One vendor's client of a served row, with the builds its legs ran on (E1.7 spec §S7.7). */
export interface DbServedClient {
  readonly vendor: DbVendor;
  readonly builds: readonly DbRecordedBuild[];
}

export interface DbProfileRow {
  readonly client: DbClient;
  readonly platform: NodeJS.Platform;
  readonly served: boolean;
  /** What a served row serves: the check admits a client only when its version line names one of these builds. Absent on a row that is not served. */
  readonly clients?: readonly DbServedClient[];
}

const CLIENTS: readonly DbClient[] = ['psql', 'mysql', 'sqlcmd'];
const SYSTEMS: readonly NodeJS.Platform[] = ['linux', 'win32', 'darwin'];

/** Every pair this code knows. None is served: E1.7 turns a row in the commit that records its probe runs (parent §4.11). A row names no vendor and no version range yet; E1.7 adds both with the database client check. */
export const BRIDGED_DB_PROFILES: readonly DbProfileRow[] = CLIENTS.flatMap((client) => SYSTEMS.map((platform) => ({ client, platform, served: false })));

/** The client a type is launched as, when it has one a profile can name. */
export function profileClientOf(dbType: DbType): DbClient | undefined {
  return CLIENTS.find((client) => client === clientNameOf(dbType));
}

/** Whether `rows` serve this type on this platform; a type or a platform with no row is not served, and the sentence is DR1. */
export function bridgedDbPair(rows: readonly DbProfileRow[], dbType: DbType, platform: NodeJS.Platform): { served: true } | { served: false; sentence: string } {
  const client = profileClientOf(dbType);
  const row = rows.find((candidate) => candidate.client === client && candidate.platform === platform);
  return row?.served === true ? { served: true } : { served: false, sentence: DR1(clientNameOf(dbType), platform) };
}

/* ---------------------------------------------------------------------------------------------------------------
 * §S6.15 Z2: the connection is built from the entry's own fields, and a bridged client is never handed the stored string
 * ------------------------------------------------------------------------------------------------------------- */

/** What a bridged client is told to connect to: five fields of the entry and the profile's settings, with the password apart (it travels in the client's own variable). `host` is an address as the client takes it: no brackets round an IPv6 address for `psql` and `mysql`. */
export type BridgedDbConnection =
  | { ok: true; host: string; port?: string; database?: string; user: string; password: string; settings: Readonly<Record<string, string>> }
  | { ok: false; sentence: string };

type Built = Extract<BridgedDbConnection, { ok: true }>;
type Pair = readonly [string, string];

/**
 * A refusal as a value (`common/coding-style.md`: expected failures are values, not exceptions): the journal sentence of the rule a stored connection broke. Every rule
 * below answers its result or one of these, and the first one in the rules' order is what the one door, `bridgedDbConnection`, answers as `{ ok: false }`.
 */
interface Refusal {
  readonly refusal: string;
}

const refused = (sentence: string): Refusal => ({ refusal: sentence });
const isRefusal = (value: unknown): value is Refusal => typeof value === 'object' && value !== null && 'refusal' in value;
const isPair = (value: unknown): value is Pair => Array.isArray(value);

interface Ctx {
  readonly dbType: DbType;
  readonly entity: string;
  readonly client: string;
}

/** The fields as the stored text gives them, before any rule. */
interface Fields {
  readonly host?: string;
  readonly port?: string;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
}

/** Whether `text` holds a code point below 0x20 or 0x7F. */
const hasControl = (text: string): boolean => [...text].some((char) => (char.codePointAt(0) ?? 0) < 0x20 || char === '\u007f');

const decoded = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const emptyAsAbsent = (value: string | undefined): string | undefined => (value === '' ? undefined : value);
const optional = <K extends string>(key: K, value: string | undefined): { [P in K]?: string } => (value === undefined ? {} : ({ [key]: value } as { [P in K]?: string }));

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const anyDialect = (text: string): 'uri' | 'kv' => (URI_SCHEME.test(text) ? 'uri' : 'kv');

const POSTGRES_SCHEME = /^postgres(?:ql)?:\/\//i;

/** Which dialect a type's stored text is read as: postgres a URI whose scheme is postgres: or postgresql: (`isSafePostgresUri`'s question, asked of the text and not of `new URL`, so a URI `new URL` cannot read is refused by the rule it breaks); mysql and mssql as the parser tells them apart. */
const DIALECTS: Readonly<Record<DbType, (text: string) => 'uri' | 'kv' | undefined>> = {
  postgres: (text) => (POSTGRES_SCHEME.test(text) ? 'uri' : undefined),
  mysql: anyDialect,
  mssql: anyDialect,
  mongodb: () => undefined,
};

const KEY_DIALECT: Readonly<Record<DbType, KeyDialect>> = { postgres: 'libpq', mysql: 'mysql', mssql: 'ado', mongodb: 'ado' };

const unknownSetting = (ctx: Ctx, key: string): string => DR2(ctx.entity, settingWords(KEY_DIALECT[ctx.dbType], key));
const doubledSetting = (ctx: Ctx, key: string): string => DR3(ctx.entity, settingWords(KEY_DIALECT[ctx.dbType], key));
const shapeOf = (ctx: Ctx, field: string): string => DR6(ctx.entity, field, ctx.client);

interface Draft {
  readonly fields: Fields;
  readonly pairs: readonly Pair[];
}

/** The text before the first `?` and the text after it, or `undefined` when there is no `?`. The query is the raw text: nothing has read it through `URLSearchParams`. */
function cutAtQuery(text: string): { base: string; query: string | undefined } {
  const at = text.indexOf('?');
  return at < 0 ? { base: text, query: undefined } : { base: text.slice(0, at), query: text.slice(at + 1) };
}

/** The host part of an authority that `new URL` would not read: what stands after the last `@`, before the first `/`. */
function authorityHost(base: string): string {
  const authority = base.replace(URI_SCHEME, '').split('/')[0];
  return authority.slice(authority.lastIndexOf('@') + 1);
}

/** A URI `new URL` refuses: no host after credentials, or a list of hosts with ports, is the host rule's; anything else is a form that cannot be given. */
function unreadableUri(ctx: Ctx, base: string): Refusal {
  const host = authorityHost(base);
  return refused(host === '' || host.includes(',') ? DR5(ctx.entity) : shapeOf(ctx, 'connection'));
}

function parseUrl(ctx: Ctx, base: string): URL | Refusal {
  try {
    return new URL(base);
  } catch {
    return unreadableUri(ctx, base);
  }
}

const URL_FIELDS: ReadonlyArray<readonly ['host' | 'user' | 'password' | 'database', (url: URL) => string]> = [
  ['host', (url) => url.hostname],
  ['user', (url) => url.username],
  ['password', (url) => url.password],
  ['database', (url) => url.pathname.replace(/^\//, '')],
];

/** The fields of a URI, each percent-decoded once; a decoding that fails refuses the first field it fails on. */
function urlFields(ctx: Ctx, url: URL): Fields | Refusal {
  const read = URL_FIELDS.map(([name, field]) => ({ name, value: decoded(field(url)) }));
  const failed = read.find(({ value }) => value === undefined);
  return failed === undefined ? { ...optional('port', emptyAsAbsent(url.port)), ...Object.fromEntries(read.map(({ name, value }) => [name, value])) } : refused(shapeOf(ctx, failed.name));
}

/** A part of a URI's query, as `[key, value]`, both percent-decoded once; a part with no `=`, an empty key or a decoding that fails refuses the connection. */
function queryPair(ctx: Ctx, part: string): Pair | Refusal {
  const at = part.indexOf('=');
  const key = at > 0 ? decoded(part.slice(0, at)) : undefined;
  const value = decoded(part.slice(at + 1));
  return key === undefined || value === undefined ? refused(unknownSetting(ctx, '')) : [key, value];
}

/** The parts of a raw query read as pairs, or the refusal of the first that cannot be. */
function readPairs(ctx: Ctx, query: string | undefined): readonly Pair[] | Refusal {
  const parsed = query === undefined ? [] : query.split('&').map((part) => queryPair(ctx, part));
  return parsed.find(isRefusal) ?? parsed.filter(isPair);
}

/** The pairs of a raw query, in order. A key given twice is refused, whatever its value: keys are compared after decoding, exactly. */
function queryPairs(ctx: Ctx, query: string | undefined): readonly Pair[] | Refusal {
  const pairs = readPairs(ctx, query);
  if (isRefusal(pairs)) {
    return pairs;
  }
  const doubled = pairs.find(([key], at) => pairs.findIndex(([given]) => given === key) !== at);
  return doubled === undefined ? pairs : refused(doubledSetting(ctx, doubled[0]));
}

function draftOfUrl(ctx: Ctx, url: URL, query: string | undefined): Draft | Refusal {
  const fields = urlFields(ctx, url);
  if (isRefusal(fields)) {
    return fields;
  }
  const pairs = queryPairs(ctx, query);
  return isRefusal(pairs) ? pairs : { fields, pairs };
}

function uriDraft(ctx: Ctx, text: string): Draft | Refusal {
  if (text.includes('#')) {
    return refused(shapeOf(ctx, 'connection'));
  }
  const { base, query } = cutAtQuery(text);
  const url = parseUrl(ctx, base);
  return isRefusal(url) ? url : draftOfUrl(ctx, url, query);
}

/** The field each key of a key-value string names, in any letter case. */
const KV_FIELDS: ReadonlyMap<string, keyof Fields> = new Map<string, keyof Fields>([
  ['server', 'host'], ['host', 'host'], ['data source', 'host'], ['port', 'port'], ['database', 'database'], ['initial catalog', 'database'],
  ['user id', 'user'], ['uid', 'user'], ['user', 'user'], ['username', 'user'], ['password', 'password'], ['pwd', 'password'],
]);

/** A value that begins with a quote, as an ADO string writes one (`Password="a"`): the profile does not read that form, and a quote kept in the value would be the password's first character. */
const QUOTED_VALUE = /^["']/;

const withValue = (ctx: Ctx, fields: Fields, name: keyof Fields, value: string): Fields | Refusal =>
  QUOTED_VALUE.test(value) ? refused(DR6Quoted(ctx.entity, name, ctx.client)) : { ...fields, [name]: value };

/** One non-empty part of a key-value string added to `fields`, which stay as they were: the new fields, or a refusal for an unknown key, a part with no `=` or a field given by two keys. */
function kvPart(ctx: Ctx, fields: Fields, part: string): Fields | Refusal {
  const at = part.indexOf('=');
  const key = at > 0 ? part.slice(0, at).trim().toLowerCase() : '';
  const name = KV_FIELDS.get(key);
  if (name === undefined) {
    return refused(unknownSetting(ctx, key));
  }
  if (fields[name] !== undefined) {
    return refused(doubledSetting(ctx, key));
  }
  return withValue(ctx, fields, name, part.slice(at + 1).trim());
}

/** The host and port of a key-value string as the parser reads them: `host,port` or `host:port`, the `Port` key winning, a pasted scheme and path dropped. */
function kvHostAndPort(raw: Fields): Fields {
  const server = raw.host ?? '';
  const [, host, suffix] = /^(.*?)[,:](\d+)$/.exec(server) ?? [server, server, undefined];
  return { ...raw, host: cleanHost(host), port: emptyAsAbsent(raw.port) ?? suffix };
}

const withPart = (ctx: Ctx) => (fields: Fields | Refusal, part: string): Fields | Refusal => (isRefusal(fields) ? fields : kvPart(ctx, fields, part));

/** The key of a part of a key-value string, as the parser reads it (trimmed, in lower case), or an empty text when the part has none. */
function kvKey(part: string): string {
  const at = part.indexOf('=');
  return at > 0 ? part.slice(0, at).trim().toLowerCase() : '';
}

/** The settings a key-value string may hold (E1.7 §S7.9): only the `sqlcmd` dialect has any. */
const kvSettings = (ctx: Ctx): ReadonlyMap<string, Setting> => (ctx.dbType === 'mssql' ? MSSQL_SETTINGS : new Map());

/** The pairs of the parts that are settings, each by its key as the profile spells it: a key given twice is refused whatever its value. */
function kvPairs(ctx: Ctx, parts: readonly string[]): readonly Pair[] | Refusal {
  const pairs = parts.map((part): Pair => [kvKey(part), part.slice(part.indexOf('=') + 1).trim()]);
  const doubled = pairs.find(([key], at) => pairs.findIndex(([given]) => given === key) !== at);
  return doubled === undefined ? pairs : refused(doubledSetting(ctx, doubled[0]));
}

function kvDraft(ctx: Ctx, text: string): Draft | Refusal {
  const parts = text.split(';').map((raw) => raw.trim()).filter((part) => part !== '');
  const isSetting = (part: string): boolean => kvSettings(ctx).has(kvKey(part));
  const fields = parts.filter((part) => !isSetting(part)).reduce<Fields | Refusal>(withPart(ctx), {});
  const pairs = kvPairs(ctx, parts.filter(isSetting));
  if (isRefusal(fields)) {
    return fields;
  }
  return isRefusal(pairs) ? pairs : { fields: kvHostAndPort(fields), pairs };
}

function draftOf(ctx: Ctx, stored: string): Draft | Refusal {
  const text = stored.trim();
  const dialect = DIALECTS[ctx.dbType](text);
  if (dialect === undefined || hasControl(text)) {
    return refused(shapeOf(ctx, 'connection'));
  }
  return dialect === 'uri' ? uriDraft(ctx, text) : kvDraft(ctx, text);
}

/**
 * A setting of the profile (the E1.7 spec §S7.9, Q15 of the parent): the shape its value must have, how the builder is given it, and whether it reaches the client. A setting of kind (a) is a
 * transport-security key a client can be made to honour by a measured flag, and it is carried. A setting of kind (b) is a key a client does not use, which changes neither who authenticates,
 * which server is reached, nor how that server is verified: it is read for its shape and never carried, so the launch with it equals the launch without it. Every other key is refused (DR2).
 */
interface Setting {
  readonly shape: RegExp;
  readonly written?: (value: string) => string;
  readonly carried: boolean;
}

const BOOLEAN = /^(?:true|false)$/i;
const NAME = /^[A-Za-z0-9 _.-]{1,63}$/;
const carried = (shape: RegExp, written?: (value: string) => string): Setting => ({ shape, written, carried: true });
const dropped = (shape: RegExp): Setting => ({ shape, carried: false });

/** The three settings of a postgres URI and the shape each value must have: a word, one to four digits, a short plain name. */
const POSTGRES_SETTINGS: ReadonlyMap<string, Setting> = new Map([
  ['sslmode', carried(/^(?:disable|allow|prefer|require|verify-ca|verify-full)$/)],
  ['connect_timeout', carried(/^\d{1,4}$/)],
  ['application_name', carried(NAME)],
]);

/**
 * No key of kind (a) yet: `Encrypt` and `TrustServerCertificate` stay refused (DR2) until a CI leg shows what each does to a connection (§S7.9: a key is added only with its leg; the judge of run
 * 45380823025 found none). Kind (b), each with its reason: `Application Name` and `App` name the connection to the server's own views, `Persist Security Info` is a
 * connector's habit of keeping a password it was given, `MultipleActiveResultSets`, `Pooling`, `Connect Retry Count` and `Connect Retry Interval` are a connector's own business, and the two timeouts
 * would only bound a wait. None of the nine reaches `sqlcmd`, and none of them names an identity, a server or a way to verify one.
 */
const MSSQL_SETTINGS: ReadonlyMap<string, Setting> = new Map([
  ['application name', dropped(NAME)],
  ['app', dropped(NAME)],
  ['persist security info', dropped(BOOLEAN)],
  ['multipleactiveresultsets', dropped(BOOLEAN)],
  ['pooling', dropped(BOOLEAN)],
  ['connect retry count', dropped(/^\d{1,3}$/)],
  ['connect retry interval', dropped(/^\d{1,3}$/)],
  ['connection timeout', dropped(/^\d{1,5}$/)],
  ['connect timeout', dropped(/^\d{1,5}$/)],
]);

/** Oracle's client takes `--ssl-mode`; `VERIFY_CA` and `VERIFY_IDENTITY` name a file the entry would carry, which waits for a typed field (parent §8). */
const MYSQL_SETTINGS: ReadonlyMap<string, Setting> = new Map([['ssl-mode', carried(/^(?:DISABLED|PREFERRED|REQUIRED)$/i, (value) => value.toUpperCase())]]);

const SETTINGS: Readonly<Record<DbType, ReadonlyMap<string, Setting>>> = { postgres: POSTGRES_SETTINGS, mysql: MYSQL_SETTINGS, mssql: MSSQL_SETTINGS, mongodb: new Map() };

/** The pair a setting of the profile gives, `undefined` when the connection does not hold it, or the refusal of a value of the wrong shape. */
function settingPair(ctx: Ctx, pairs: readonly Pair[], key: string, rule: Setting): Pair | undefined | Refusal {
  const value = pairs.find(([given]) => given === key)?.[1];
  if (value === undefined) {
    return undefined;
  }
  return rule.shape.test(value) ? [key, writtenValue(rule, value)] : refused(shapeOf(ctx, key));
}

const writtenValue = (rule: Setting, value: string): string => rule.written?.(value) ?? value;

/** The profile's settings, in the order the builder writes them whatever order the connection gave: only the ones that reach the client. A key outside the profile is refused first, then each value's shape. */
function profileSettings(ctx: Ctx, pairs: readonly Pair[]): Readonly<Record<string, string>> | Refusal {
  const rules = SETTINGS[ctx.dbType];
  const outside = pairs.find(([key]) => !rules.has(key));
  if (outside !== undefined) {
    return refused(unknownSetting(ctx, outside[0]));
  }
  const taken = [...rules].map(([key, rule]) => settingPair(ctx, pairs, key, rule));
  return taken.find(isRefusal) ?? Object.fromEntries(taken.filter(isPair).filter(([key]) => rules.get(key)?.carried === true));
}

const SOCKET_HOST = /(?:^[@/\\])|(?:[,/\\])/;
const IPV6_HOST = /^\[([0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*)\]$/;
const NETWORK_HOST = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;

/** A host `psql` or `mysql` is asked to reach over the network: letters, digits, `.`, `-` and `_` not beginning with `-`, or an IPv6 address in brackets (answered without them). */
function networkHost(ctx: Ctx, host: string): string | Refusal {
  if (SOCKET_HOST.test(host)) {
    return refused(DR5(ctx.entity));
  }
  const address = IPV6_HOST.exec(host);
  if (address !== null) {
    return address[1];
  }
  return NETWORK_HOST.test(host) ? host : refused(shapeOf(ctx, 'host'));
}

/** The host (Q17): required for every client; for `psql` and `mysql` one network host; for `sqlcmd` one host name (E1.7 writes its shape with PS1). */
const presentHost = (ctx: Ctx, host: string | undefined): string | Refusal => (host === undefined || host === '' ? refused(DR5(ctx.entity)) : host);

/** The host `sqlcmd` is given after `-S`: one host name of the network-host alphabet. One that begins with `-` is read as the next option (`-S -E`), and one with a colon, a comma or a bracket is no host once the key-value split has taken its port (`Server=::1` is host `:` and port `1`). */
const sqlcmdHost = (ctx: Ctx, host: string): string | Refusal => (NETWORK_HOST.test(host) ? host : refused(shapeOf(ctx, 'host')));

function hostOf(ctx: Ctx, host: string | undefined): string | Refusal {
  const named = presentHost(ctx, host);
  if (isRefusal(named)) {
    return named;
  }
  if (hasControl(named)) {
    return refused(shapeOf(ctx, 'host'));
  }
  return ctx.dbType === 'mssql' ? sqlcmdHost(ctx, named) : networkHost(ctx, named);
}

const portInRange = (port: string): boolean => /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

function portOf(ctx: Ctx, port: string | undefined): string | undefined | Refusal {
  if (port === undefined || port === '') {
    return undefined;
  }
  return portInRange(port) ? port : refused(shapeOf(ctx, 'port'));
}

/** The user and the password (Q16): each stored and not empty, for every client, and holding no control character. */
function secretOf(ctx: Ctx, field: 'user' | 'password', value: string | undefined): string | Refusal {
  if (value === undefined || value === '') {
    return refused(DR4(ctx.entity, field));
  }
  return hasControl(value) ? refused(shapeOf(ctx, field)) : value;
}

/** A name `psql` would read as a connection string: one that holds `=` or begins with a connection URI's scheme. */
const LIBPQ_CONNECTION_STRING = /=|^\s*postgres(?:ql)?:\/\//i;

/** A name that holds a control character or begins with `-` (a client reads it as an option: `-d -E`, `-D --init-command=x`), for every client; for `psql` also one it would read as a connection string. */
const unfitDatabase = (ctx: Ctx, database: string): boolean =>
  hasControl(database) || database.startsWith('-') || (ctx.dbType === 'postgres' && LIBPQ_CONNECTION_STRING.test(database));

function databaseOf(ctx: Ctx, database: string | undefined): string | undefined | Refusal {
  if (database === undefined || database === '') {
    return undefined;
  }
  return unfitDatabase(ctx, database) ? refused(shapeOf(ctx, 'database')) : database;
}

type Endpoint = Pick<Built, 'host' | 'port' | 'settings'>;
type Login = Pick<Built, 'user' | 'password' | 'database'>;

/** The settings, the host and the port, in that order: the first rule broken is the answer. */
function endpointOf(ctx: Ctx, draft: Draft): Endpoint | Refusal {
  const settings = profileSettings(ctx, draft.pairs);
  if (isRefusal(settings)) {
    return settings;
  }
  const host = hostOf(ctx, draft.fields.host);
  if (isRefusal(host)) {
    return host;
  }
  const port = portOf(ctx, draft.fields.port);
  return isRefusal(port) ? port : { host, ...optional('port', port), settings };
}

/** The user, the password and the database, in that order: the first rule broken is the answer. */
function loginOf(ctx: Ctx, fields: Fields): Login | Refusal {
  const user = secretOf(ctx, 'user', fields.user);
  if (isRefusal(user)) {
    return user;
  }
  const password = secretOf(ctx, 'password', fields.password);
  if (isRefusal(password)) {
    return password;
  }
  const database = databaseOf(ctx, fields.database);
  return isRefusal(database) ? database : { user, password, ...optional('database', database) };
}

const failed = (refusal: Refusal): BridgedDbConnection => ({ ok: false, sentence: refusal.refusal });

/**
 * What `psql`, `mysql` or `sqlcmd` is to be given for the stored connection `stored` of the entry named `entityName`, or the journal sentence of the first rule it
 * breaks. The rules, in order: the dialect and its settings (a URI's query is read raw and every key must be in the profile, once), the host, the port, the user, the
 * password, the database. The sentence names the entry and, for a setting, a key from the lists of `bridgedDbSentences.ts`; it holds no value of the connection.
 */
export function bridgedDbConnection(dbType: DbType, stored: string, entityName: string): BridgedDbConnection {
  const ctx: Ctx = { dbType, entity: entityName, client: clientNameOf(dbType) };
  const draft = draftOf(ctx, stored);
  if (isRefusal(draft)) {
    return failed(draft);
  }
  const endpoint = endpointOf(ctx, draft);
  if (isRefusal(endpoint)) {
    return failed(endpoint);
  }
  const login = loginOf(ctx, draft.fields);
  return isRefusal(login) ? failed(login) : { ok: true, ...endpoint, ...login };
}

/** A value of a libpq keyword string: in single quotes, a backslash before every backslash and every quote. */
const quoted = (value: string): string => `'${value.replaceAll(/[\\']/g, '\\$&')}'`;

/** libpq's own default port, written whenever the entry names none (see `bridgedPsqlString`). */
const POSTGRES_PORT = '5432';

/**
 * The authentication controls of `psql` (E1.7 spec §S7.5; probes PK1 and PE1, 2026-11-19): no GSS encryption request and no token made from a ticket, no client certificate, and a login the
 * server grants only by one of the three password methods PE1 logged in with (a method a later libpq adds is refused: the list never grows by itself). Constants: nothing of a stored
 * connection reaches them, and a stored connection that names one of the keys is refused (DP4).
 */
const PSQL_CONTROLS: readonly Pair[] = [['gssencmode', 'disable'], ['sslcertmode', 'disable'], ['require_auth', 'password,md5,scram-sha-256']];

/**
 * The one keyword string `psql` is given after `--` for a built connection: `host`, `port`, `dbname`, `user`, the settings, then `passfile`, `sslcert` and `sslkey`
 * at `absentFile`, then the three controls of `PSQL_CONTROLS`. The controls come last because libpq takes the LAST value of a keyword written twice (PQ2-d3); no setting of the
 * profile is one of them. `host`, `port` and `dbname` are written EVERY time, with libpq's own defaults (5432; the user name) when the entry names none: Debian's and Ubuntu's
 * `pg_wrapper` reads `~/.postgresqlrc` and fills any of the three that the string leaves out (PA1-i: 4 of 4; never one it names: 0 of 4). There is no `password` keyword, ever: the
 * password travels in `PGPASSWORD`.
 */
export function bridgedPsqlString(connection: Built, absentFile: string): string {
  const pairs: Pair[] = [
    ['host', connection.host], ['port', connection.port ?? POSTGRES_PORT], ['dbname', connection.database ?? connection.user],
    ['user', connection.user], ...Object.entries(connection.settings),
    ['passfile', absentFile], ['sslcert', absentFile], ['sslkey', absentFile],
    ...PSQL_CONTROLS,
  ];
  return pairs.map(([key, value]) => `${key}=${quoted(value)}`).join(' ');
}
