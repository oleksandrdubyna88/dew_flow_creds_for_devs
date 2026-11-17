import type { DbType } from './types';
import { DR1, DR2, DR3, DR4, DR5, DR6, KeyDialect, clientNameOf, settingWords } from './bridgedDbSentences';
import { cleanHost } from './dbConnString';

/**
 * The gate of a bridged database query (the E1.6 spec §S6.15 Z1; parent §4.11, Q18). Pure, no `vscode`.
 *
 * <p>A bridged `query` is a local subprocess under agent-written input, so it runs only for a client and a system whose behaviour was MEASURED. The table
 * below names every pair this code knows and says whether it is served. None is: E1.7 turns a row to served in the commit that records the probe runs of
 * its pair (parent §4.11), and until then every bridged query is refused before the stored connection is read and before any process starts.</p>
 */

export type DbClient = 'psql' | 'mysql' | 'sqlcmd';

export interface DbProfileRow {
  readonly client: DbClient;
  readonly platform: NodeJS.Platform;
  readonly served: boolean;
}

const CLIENTS: readonly DbClient[] = ['psql', 'mysql', 'sqlcmd'];
const SYSTEMS: readonly NodeJS.Platform[] = ['linux', 'win32', 'darwin'];

/** Every pair this code knows. None is served: E1.7 turns a row in the commit that records its probe runs (parent §4.11). A row names no vendor and no version range yet; E1.7 adds both with the database client check. */
export const BRIDGED_DB_PROFILES: readonly DbProfileRow[] = CLIENTS.flatMap((client) => SYSTEMS.map((platform) => ({ client, platform, served: false })));

/** The client a type is launched as, when it has one a profile can name. */
function profileClientOf(dbType: DbType): DbClient | undefined {
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

/** A refusal, thrown inside this module and answered as `{ ok: false }` at its one door: every rule below is one line that says what it refused. */
class Refused extends Error {
  constructor(readonly sentence: string) {
    super('refused');
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

interface Ctx {
  readonly dbType: DbType;
  readonly entity: string;
  readonly client: string;
}

/** The fields as the stored text gives them, before any rule. */
interface Fields {
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  password?: string;
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
function unreadableUri(ctx: Ctx, base: string): never {
  const host = authorityHost(base);
  return refuse(host === '' || host.includes(',') ? DR5(ctx.entity) : shapeOf(ctx, 'connection'));
}

function parseUrl(ctx: Ctx, base: string): URL {
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

/** The fields of a URI, each percent-decoded once; a decoding that fails refuses the field. */
function urlFields(ctx: Ctx, url: URL): Fields {
  const fields: Fields = url.port === '' ? {} : { port: url.port };
  for (const [name, read] of URL_FIELDS) {
    const value = decoded(read(url));
    fields[name] = value ?? refuse(shapeOf(ctx, name));
  }
  return fields;
}

/** A part of a URI's query, as `[key, value]`, both percent-decoded once; a part with no `=`, an empty key or a decoding that fails refuses the connection. */
function queryPair(ctx: Ctx, part: string): Pair {
  const at = part.indexOf('=');
  const key = at > 0 ? decoded(part.slice(0, at)) : undefined;
  const value = decoded(part.slice(at + 1));
  return key === undefined || value === undefined ? refuse(unknownSetting(ctx, '')) : [key, value];
}

/** The pairs of a raw query, in order. A key given twice is refused, whatever its value: keys are compared after decoding, exactly. */
function queryPairs(ctx: Ctx, query: string | undefined): readonly Pair[] {
  const pairs = query === undefined ? [] : query.split('&').map((part) => queryPair(ctx, part));
  const seen = new Set<string>();
  for (const [key] of pairs) {
    seen.has(key) ? refuse(doubledSetting(ctx, key)) : seen.add(key);
  }
  return pairs;
}

function uriDraft(ctx: Ctx, text: string): Draft {
  if (text.includes('#')) {
    refuse(shapeOf(ctx, 'connection'));
  }
  const { base, query } = cutAtQuery(text);
  return { fields: urlFields(ctx, parseUrl(ctx, base)), pairs: queryPairs(ctx, query) };
}

/** The field each key of a key-value string names, in any letter case. */
const KV_FIELDS: ReadonlyMap<string, keyof Fields> = new Map<string, keyof Fields>([
  ['server', 'host'], ['host', 'host'], ['data source', 'host'], ['port', 'port'], ['database', 'database'], ['initial catalog', 'database'],
  ['user id', 'user'], ['uid', 'user'], ['user', 'user'], ['username', 'user'], ['password', 'password'], ['pwd', 'password'],
]);

/** One non-empty part of a key-value string, written into `fields`: an unknown key, a part with no `=` and a field given by two keys are refused. */
function kvPart(ctx: Ctx, fields: Fields, part: string): void {
  const at = part.indexOf('=');
  const key = at > 0 ? part.slice(0, at).trim().toLowerCase() : '';
  const name = KV_FIELDS.get(key);
  if (name === undefined) {
    refuse(unknownSetting(ctx, key));
  }
  if (fields[name] !== undefined) {
    refuse(doubledSetting(ctx, key));
  }
  fields[name] = part.slice(at + 1).trim();
}

const emptyAsAbsent = (value: string | undefined): string | undefined => (value === '' ? undefined : value);

/** The host and port of a key-value string as the parser reads them: `host,port` or `host:port`, the `Port` key winning, a pasted scheme and path dropped. */
function kvHostAndPort(raw: Fields): Fields {
  const server = raw.host ?? '';
  const [, host, suffix] = /^(.*?)[,:](\d+)$/.exec(server) ?? [server, server, undefined];
  return { ...raw, host: cleanHost(host), port: emptyAsAbsent(raw.port) ?? suffix };
}

function kvDraft(ctx: Ctx, text: string): Draft {
  const fields: Fields = {};
  for (const part of text.split(';').map((raw) => raw.trim())) {
    if (part !== '') {
      kvPart(ctx, fields, part);
    }
  }
  return { fields: kvHostAndPort(fields), pairs: [] };
}

function draftOf(ctx: Ctx, stored: string): Draft {
  const text = stored.trim();
  const dialect = DIALECTS[ctx.dbType](text);
  if (dialect === undefined || hasControl(text)) {
    refuse(shapeOf(ctx, 'connection'));
  }
  return dialect === 'uri' ? uriDraft(ctx, text) : kvDraft(ctx, text);
}

/** The three settings of a postgres URI and the shape each value must have: a word, one to four digits, a short plain name. */
const POSTGRES_SETTINGS: ReadonlyMap<string, RegExp> = new Map([
  ['sslmode', /^(?:disable|allow|prefer|require|verify-ca|verify-full)$/],
  ['connect_timeout', /^\d{1,4}$/],
  ['application_name', /^[A-Za-z0-9 _.-]{1,63}$/],
]);

/** The profile's settings, in the order the builder writes them whatever order the connection gave. A key outside the profile is refused first, then each value's shape. */
function profileSettings(ctx: Ctx, pairs: readonly Pair[]): Readonly<Record<string, string>> {
  for (const [key] of pairs) {
    if (ctx.dbType !== 'postgres' || !POSTGRES_SETTINGS.has(key)) {
      refuse(unknownSetting(ctx, key));
    }
  }
  const taken = [...POSTGRES_SETTINGS].flatMap(([key, shape]): Pair[] => {
    const value = pairs.find(([given]) => given === key)?.[1];
    return value === undefined ? [] : [shape.test(value) ? [key, value] : refuse(shapeOf(ctx, key))];
  });
  return Object.fromEntries(taken);
}

const SOCKET_HOST = /^[@/\\]|[,/\\]/;
const IPV6_HOST = /^\[([0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*)\]$/;
const NETWORK_HOST = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;

/** A host `psql` or `mysql` is asked to reach over the network: letters, digits, `.`, `-` and `_` not beginning with `-`, or an IPv6 address in brackets (answered without them). */
function networkHost(ctx: Ctx, host: string): string {
  if (SOCKET_HOST.test(host)) {
    refuse(DR5(ctx.entity));
  }
  const address = IPV6_HOST.exec(host);
  if (address !== null) {
    return address[1];
  }
  return NETWORK_HOST.test(host) ? host : refuse(shapeOf(ctx, 'host'));
}

/** The host (Q17): required for every client; for `psql` and `mysql` one network host; for `sqlcmd` refused only when empty or holding a control character (E1.7 writes its shape with PS1). */
const presentHost = (ctx: Ctx, host: string | undefined): string => (host === undefined || host === '' ? refuse(DR5(ctx.entity)) : host);

function hostOf(ctx: Ctx, host: string | undefined): string {
  const named = presentHost(ctx, host);
  if (hasControl(named)) {
    refuse(shapeOf(ctx, 'host'));
  }
  return ctx.dbType === 'mssql' ? named : networkHost(ctx, named);
}

const portInRange = (port: string): boolean => /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

function portOf(ctx: Ctx, port: string | undefined): string | undefined {
  if (port === undefined || port === '') {
    return undefined;
  }
  return portInRange(port) ? port : refuse(shapeOf(ctx, 'port'));
}

/** The user and the password (Q16): each stored and not empty, for every client, and holding no control character. */
function secretOf(ctx: Ctx, field: 'user' | 'password', value: string | undefined): string {
  if (value === undefined || value === '') {
    refuse(DR4(ctx.entity, field));
  }
  return hasControl(value) ? refuse(shapeOf(ctx, field)) : value;
}

/** A name `psql` would read as a connection string: one that holds `=` or begins with a connection URI's scheme. */
const LIBPQ_CONNECTION_STRING = /=|^\s*postgres(?:ql)?:\/\//i;

const unfitDatabase = (ctx: Ctx, database: string): boolean => hasControl(database) || (ctx.dbType === 'postgres' && LIBPQ_CONNECTION_STRING.test(database));

function databaseOf(ctx: Ctx, database: string | undefined): string | undefined {
  if (database === undefined || database === '') {
    return undefined;
  }
  return unfitDatabase(ctx, database) ? refuse(shapeOf(ctx, 'database')) : database;
}

const optional = <K extends string>(key: K, value: string | undefined): { [P in K]?: string } => (value === undefined ? {} : ({ [key]: value } as { [P in K]?: string }));

/**
 * What `psql`, `mysql` or `sqlcmd` is to be given for the stored connection `stored` of the entry named `entityName`, or the journal sentence of the first rule it
 * breaks. The rules, in order: the dialect and its settings (a URI's query is read raw and every key must be in the profile, once), the host, the port, the user, the
 * password, the database. The sentence names the entry and, for a setting, a key from the lists of `bridgedDbSentences.ts`; it holds no value of the connection.
 */
export function bridgedDbConnection(dbType: DbType, stored: string, entityName: string): BridgedDbConnection {
  const ctx: Ctx = { dbType, entity: entityName, client: clientNameOf(dbType) };
  try {
    const { fields, pairs } = draftOf(ctx, stored);
    const settings = profileSettings(ctx, pairs);
    const host = hostOf(ctx, fields.host);
    const port = portOf(ctx, fields.port);
    const user = secretOf(ctx, 'user', fields.user);
    const password = secretOf(ctx, 'password', fields.password);
    const database = databaseOf(ctx, fields.database);
    return { ok: true, host, ...optional('port', port), ...optional('database', database), user, password, settings };
  } catch (error) {
    if (error instanceof Refused) {
      return { ok: false, sentence: error.sentence };
    }
    throw error;
  }
}

/** A value of a libpq keyword string: in single quotes, a backslash before every backslash and every quote. */
const quoted = (value: string): string => `'${value.replaceAll(/[\\']/g, '\\$&')}'`;

/**
 * The one keyword string `psql` is given after `--` for a built connection: `host`, `port`, `dbname`, `user`, the settings, then `passfile`, `sslcert` and `sslkey`
 * at `absentFile`. The controls come last because libpq takes the LAST value of a keyword written twice (PQ2-d3); no setting of the profile is one of them. There is no
 * `password` keyword, ever: the password travels in `PGPASSWORD`.
 */
export function bridgedPsqlString(connection: Built, absentFile: string): string {
  const pairs: Pair[] = [
    ['host', connection.host], ...Object.entries(optional('port', connection.port)), ...Object.entries(optional('dbname', connection.database)),
    ['user', connection.user], ...Object.entries(connection.settings),
    ['passfile', absentFile], ['sslcert', absentFile], ['sslkey', absentFile],
  ];
  return pairs.map(([key, value]) => `${key}=${quoted(value)}`).join(' ');
}
