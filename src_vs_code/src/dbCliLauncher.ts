import { DbType } from './types';
import { parseDbConnectionString, withoutPassword } from './dbConnString';
import { BridgedDbConnection, bridgedDbConnection, bridgedPsqlString } from './bridgedDbProfile';
import { DbClientOk, DbVendor, VENDORS_OF } from './bridgedDbClient';

/**
 * Handing a query to a database CLI with the password never on a command line.
 *
 * <p>Every argv element is visible in the machine's own process list to anything running
 * as the same user, so a connection string with its password in it would be readable
 * there — the class of leak `sshAskpass.ts` exists to avoid. Each supported CLI therefore
 * takes its credential through an environment variable its own documentation names, and
 * only host/port/database ever reach the command line.</p>
 *
 * <p>Pure: which binary, which flags, which environment. Whether that binary exists and
 * running it are the caller's business.</p>
 */

export interface DbCli {
  exe: string;
  /** Where the password goes, per that tool's own contract. */
  passwordEnv?: string;
}

const CLIS: Partial<Record<DbType, DbCli>> = {
  postgres: { exe: 'psql', passwordEnv: 'PGPASSWORD' },
  mysql: { exe: 'mysql', passwordEnv: 'MYSQL_PWD' },
  mssql: { exe: 'sqlcmd', passwordEnv: 'SQLCMDPASSWORD' },
  // Named so the "which CLI is this" question has an answer everywhere, but deliberately
  // not launchable — see buildDbQueryLaunch.
  mongodb: { exe: 'mongosh' },
};

/**
 * Whether a string is a plain postgres URL, safe to hand psql as a positional dbname.
 *
 * <p>psql permutes argv like any getopt program, so a bare connection string that begins
 * with `-` is read as an OPTION regardless of position — and psql's own `-o |command`
 * opens a pipe through a shell. A stored `dbConnection` arrives by sync, Accept Share or
 * external import, so it is data from elsewhere and cannot be assumed to be a URL. This is
 * the database twin of `isSafeSshHost`: prove the shape, do not sanitize a bad one.</p>
 */
export function isSafePostgresUri(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

/** A backslash, spelled so no editor, shell or heredoc between here and the test can eat it. */
const BACKSLASH = String.fromCharCode(92);

/**
 * The mysql client's long-form commands that DO something on the laptop or to the connection.
 * They are recognised at the start of a statement whenever named commands are on (a `my.cnf`
 * the agent never sees can turn them on). Short forms are all backslash commands and are
 * covered by the blanket backslash rule.
 *
 * <ul>
 *   <li>`system`, `edit`, `pager`, `nopager` run a local program that inherits MYSQL_PWD;</li>
 *   <li>`source`, `tee`, `notee`, `ssl_session_data_print` read or write a laptop file;</li>
 *   <li>`connect` opens a connection to a host the agent names, with the stored password;</li>
 *   <li>`delimiter` moves where the client splits statements, so a later command would sit
 *       where this gate sees the middle of one.</li>
 * </ul>
 *
 * Judged harmless and left out on purpose, so nobody re-derives them: `charset`, `clear`,
 * `ego`, `exit`, `go`, `nowarning`, `print`, `prompt`, `query_attributes`, `quit`, `rehash`,
 * `resetconnection`, `status`, `warnings` format, print or end the client and run nothing,
 * open nothing and read no file, while refusing them would refuse multi-line SQL that has
 * `status` or `print` alone on a line; `use` sends COM_INIT_DB to the session's own host;
 * `help` prints or sends `HELP 'x'` to the server.
 */
const MYSQL_CLIENT_WORDS = [
  'system',
  'edit',
  'pager',
  'nopager',
  'source',
  'tee',
  'notee',
  'ssl_session_data_print',
  'connect',
  'delimiter',
];

/**
 * Where the mysql client's buffer is empty or holds only comments, and so where a command
 * may start: the `-e` string's start, after the delimiter, after any line break, and after
 * the end of a block comment. There is no comment-skipping helper: skipping comments inside a
 * fragment is what left the road open, because the split had already cut the comment in two.
 */
const MYSQL_FRAGMENT_SPLIT = /;|\r\n|\r|\n|\*\//;

/** Where a psql or sqlcmd line begins, a bare CR and the end of a block comment included. */
const LINE_SPLIT = /\r\n|\r|\n|\*\//;

/** A command word, followed by whitespace, the end, or the start of any comment shape. */
const MYSQL_COMMAND_WORD = /^([a-z_]+)(?=\s|$|\/\*|#|--)/;

/** sqlcmd's `ed` opens the editor the environment names; the lines are not lower-cased. */
const MSSQL_EDIT = /^ed(?:\s|$)/i;

const POSTGRES_REFUSAL =
  'Refused: a line starting with a backslash is a psql meta-command. Meta-commands run in the client, where the password lives in the environment, so they are never accepted from an agent — send plain SQL.';
const MYSQL_BACKSLASH_REFUSAL =
  'Refused: a backslash is a mysql client command wherever it appears (\\! runs a shell that holds the password). Send plain SQL without backslashes — use CHAR() for escapes.';
const MSSQL_REFUSAL =
  'Refused: a line starting with ":", "!!" or "ed" is a sqlcmd command, not SQL. Client commands run local programs with the password in their environment, so they are never accepted from an agent. If "ed" is a name inside a SQL statement, keep it on the same line as the SQL before it: not first on a line and not after a comment.';
const UNHANDLED_REFUSAL =
  'Refused: this database type has no rule for its client\'s own commands, so no query is accepted for it.';
/** The way forward for an over-refused name: only text that stays on one line after SQL passes. */
const NAME_AS_SQL =
  'If it is a name inside a SQL statement, keep it on the same line as the SQL before it: not first on a line, not after a ";" and not after a comment.';

function refusePostgres(lines: string[]): string | undefined {
  return lines.some((line) => line.startsWith(BACKSLASH)) ? POSTGRES_REFUSAL : undefined;
}

function mysqlCommandWord(fragment: string): string | undefined {
  const word = MYSQL_COMMAND_WORD.exec(fragment.trimStart().toLowerCase())?.[1];
  return word !== undefined && MYSQL_CLIENT_WORDS.includes(word) ? word : undefined;
}

function refuseMysql(text: string): string | undefined {
  if (text.includes(BACKSLASH)) {
    return MYSQL_BACKSLASH_REFUSAL;
  }
  const word = text
    .split(MYSQL_FRAGMENT_SPLIT)
    .map(mysqlCommandWord)
    .find((w) => w !== undefined);
  return word === undefined
    ? undefined
    : `Refused: "${word}" is a mysql client command, not SQL. Client commands run local programs or open connections with the password in their environment, so they are never accepted from an agent. ${NAME_AS_SQL}`;
}

function isMssqlCommandLine(line: string): boolean {
  return line.startsWith(':') || line.startsWith('!!') || MSSQL_EDIT.test(line);
}

function refuseMssql(lines: string[]): string | undefined {
  return lines.some(isMssqlCommandLine) ? MSSQL_REFUSAL : undefined;
}

function refuseOnce(dbType: DbType, text: string): string | undefined {
  const lines = text.split(LINE_SPLIT).map((line) => line.trimStart());
  switch (dbType) {
    case 'postgres':
      return refusePostgres(lines);
    case 'mysql':
      return refuseMysql(text);
    case 'mssql':
      return refuseMssql(lines);
    default:
      return refuseUnhandled(dbType);
  }
}

/**
 * A type the switch above has no rule for is refused, so a SQL client added to `DbType` later
 * cannot let every client command through. mongodb alone is silent: it is not a SQL client, and
 * `buildDbQueryLaunch` refuses it with the sentence an agent has always seen for it.
 */
function refuseUnhandled(dbType: DbType): string | undefined {
  return dbType === 'mongodb' ? undefined : UNHANDLED_REFUSAL;
}

/**
 * Why a query is refused — or `undefined` when it may run.
 *
 * <p>The broker's promise is that an agent USES a database credential without receiving it.
 * The child process holds the password in its environment by that tool's own contract
 * (PGPASSWORD, MYSQL_PWD, SQLCMDPASSWORD) — and every one of these clients has a client-side
 * command language that runs LOCAL programs: psql's `\!` (and `\copy … to program`, `\o |cmd`),
 * mysql's `\!` / `system`, sqlcmd's `:!!`. A shell started that way inherits the environment,
 * so `\! echo $PGPASSWORD` is a syntactically valid "query" whose stdout IS the password —
 * handed back to the agent verbatim, with no further consent after the first Allow. mongodb is
 * refused outright for the same reason (`--eval` can read `process.env`); these three can be
 * served safely only if the client language is kept out, and this is where it is kept out.</p>
 *
 * <p>Shape rules, not sanitizing — the same stance as `isSafePostgresUri` and `isSafeSshHost`:</p>
 * <ul>
 *   <li><b>postgres</b>: no line may begin with a backslash. psql treats a `-c` string as a
 *       meta-command when its first character is `\`, and `buildDbQueryLaunch` puts one space
 *       in front of it, which ends that road; the line rule is margin and a readable refusal.</li>
 *   <li><b>mysql</b>: no backslash anywhere. The mysql client executes `\!` wherever it appears
 *       outside a quoted string — `select 1 \! id` runs `id` — so the position rule psql allows
 *       is not enough here; and the ten words of `MYSQL_CLIENT_WORDS` are refused at the start of
 *       any fragment (split on the delimiter, every line break and the end of a block comment).</li>
 *   <li><b>mssql</b>: no line may begin with `:`, `!!` or `ed`; and `buildDbQueryLaunch` passes `-x`,
 *       because sqlcmd resolves `$(NAME)` from its scripting variables and then from the
 *       ENVIRONMENT — `select '$(SQLCMDPASSWORD)'` would print the password as plain SQL.</li>
 * </ul>
 *
 * <p>Both rules run twice, on the text and on its NFKC form.</p>
 */
export function refuseQuery(dbType: DbType, query: string): string | undefined {
  // The second pass is margin against a client that folds its argv (fullwidth letters, a
  // fullwidth backslash or colon) and recognises what it folded to. Fullwidth text inside a
  // string still passes, except a fullwidth backslash for mysql: it folds to the one character
  // mysql's rule refuses anywhere.
  return refuseOnce(dbType, query) ?? refuseOnce(dbType, query.normalize('NFKC'));
}

export function resolveDbCli(dbType: DbType, onPath: (exe: string) => boolean): DbCli | undefined {
  const cli = CLIS[dbType];
  if (cli === undefined) {
    return undefined;
  }
  return onPath(cli.exe) ? cli : undefined;
}

/**
 * What a BRIDGED client is asked for so that, given a connection THIS EXTENSION BUILT, it reads none of the person's own files under `HOME` (E1.6 §S6.14 Y6; probes
 * PD1-PD3 saw each variable close its file). That is a defence inside the profile and not the lock: PQ1 and PQ2 saw `?passfile=` and `?service=` in a stored URI outrank
 * these variables, which is why a bridged client is never handed the stored string (§S6.15 Z2) and `psql` also gets the same three paths as keywords of its own. `mysql` gets `MYSQL_TEST_LOGIN_FILE` (`.mylogin.cnf`, which `--no-defaults` still reads), `psql` gets `PGPASSFILE` (`.pgpass`)
 * and `PGSSLCERT` and `PGSSLKEY` (`~/.postgresql`), each at `absentFile`, a path nothing ever writes. `mssql` has none of these. `undefined`
 * when a client that needs them has no `absentFile`: such a launch is refused, never made with the person's files readable.
 */
function clientFileNames(dbType: DbType, absentFile: string | undefined): Record<string, string> | undefined {
  const names = CLIENT_FILE_NAMES[dbType] ?? [];
  if (names.length === 0) {
    return {};
  }
  return isPath(absentFile) ? Object.fromEntries(names.map((name) => [name, absentFile])) : undefined;
}

/** The variables of each client that close the person's own files: the client's own documentation names them (PD1-PD3). */
const CLIENT_FILE_NAMES: Partial<Record<DbType, readonly string[]>> = {
  mysql: ['MYSQL_TEST_LOGIN_FILE'],
  postgres: ['PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY'],
};

const isPath = (value: string | undefined): value is string => value !== undefined && value !== '';

export interface DbQueryLaunch {
  exe: string;
  args: string[];
  /** Merged over the parent environment by the caller. */
  env: Record<string, string>;
}

/**
 * The authentication flags each vendor's client is given (E1.7 spec §S7.5), and only that vendor: a flag a client does not know ends it before it connects (PA1-d, PA1-f), so
 * Oracle's `--skip-enable-cleartext-plugin` is never written for MariaDB's client, which knows neither it nor `--restricted-auth`, and `--authentication-method` is go-sqlcmd's alone.
 * `psql`'s controls stand in its keyword string (`bridgedPsqlString`); the ODBC `sqlcmd` has none whose acceptance could be asked.
 */
const VENDOR_FLAGS: Readonly<Record<DbVendor, (absentFile: string) => readonly string[]>> = {
  postgresql: () => [],
  oracle: (absentFile) => [`--plugin-dir=${absentFile}`, '--skip-enable-cleartext-plugin'],
  mariadb: (absentFile) => [`--plugin-dir=${absentFile}`],
  'go-sqlcmd': () => ['--authentication-method=SqlPassword'],
  'odbc-sqlcmd': () => [],
};

/** What each `sqlcmd` client was measured to take for `Encrypt` (PA1-f, CI run 44543740467): go-sqlcmd `-N true` and `-N strict`; the ODBC client `-N` alone, which it takes as `true`, and it refuses `-N strict`. A value not listed (`false` for both) is no flag. */
const ENCRYPT_FLAGS: Readonly<Record<'go-sqlcmd' | 'odbc-sqlcmd', Readonly<Record<string, readonly string[] | undefined>>>> = {
  'go-sqlcmd': { true: ['-N', 'true'], strict: ['-N', 'strict'] },
  'odbc-sqlcmd': { true: ['-N'] },
};

/** The flags of a `sqlcmd` client for the settings that reach it (§S7.9): `Encrypt` as measured, `TrustServerCertificate=true` as `-C` (both clients), `false` as nothing (the default). `undefined` when no measured flag carries a setting. */
function sqlcmdSettingFlags(vendor: 'go-sqlcmd' | 'odbc-sqlcmd', settings: Readonly<Record<string, string>>): readonly string[] | undefined {
  const encrypt = settings.encrypt === undefined ? [] : ENCRYPT_FLAGS[vendor][settings.encrypt];
  return encrypt === undefined ? undefined : [...encrypt, ...(settings.trustservercertificate === 'true' ? ['-C'] : [])];
}

/** Oracle's `--ssl-mode`, written straight after `--protocol=TCP`; MariaDB's client has no flag of that name, so a connection that asks for it makes no launch (a setting is never dropped silently). */
const sslModeFlags = (vendor: 'oracle' | 'mariadb', settings: Readonly<Record<string, string>>): readonly string[] | undefined => {
  if (settings['ssl-mode'] === undefined) {
    return [];
  }
  return vendor === 'oracle' ? [`--ssl-mode=${settings['ssl-mode']}`] : undefined;
};

/**
 * The flags each vendor's client is given for the settings of the connection that reach it (E1.7 spec §S7.9, Q15 kind (a)), or `undefined` when the client has no measured flag for one it was asked:
 * the call then makes no launch (DR9), and never one that quietly leaves the setting out. `psql`'s settings are keywords of its own string.
 */
const SETTING_FLAGS: Readonly<Record<DbVendor, (settings: Readonly<Record<string, string>>) => readonly string[] | undefined>> = {
  postgresql: () => [],
  oracle: (settings) => sslModeFlags('oracle', settings),
  mariadb: (settings) => sslModeFlags('mariadb', settings),
  'go-sqlcmd': (settings) => sqlcmdSettingFlags('go-sqlcmd', settings),
  'odbc-sqlcmd': (settings) => sqlcmdSettingFlags('odbc-sqlcmd', settings),
};

/** Whether the client check's verdict names a vendor of this type's own client: a verdict of another client's vendor is no verdict. */
const verdictFits = (dbType: DbType, verdict: DbClientOk | undefined): verdict is DbClientOk => verdict !== undefined && (VENDORS_OF[dbType] ?? []).includes(verdict.vendor);

/**
 * The launch of a BRIDGED query (the E1.6 spec §S6.15 Z2): built from the fields `bridgedDbConnection` checked, never from the stored string, which no bridged client is handed.
 * The password rides the client's own variable, the person's files are closed by `closing` (Y6), and an entry the profile refuses answers `undefined`. `psql` gets one
 * keyword string after `--`; `mysql` gets `--no-defaults` first and `--protocol=TCP` straight after it, then its vendor's flags, the connection flags and the three pins; `sqlcmd` gets
 * today's arguments with its user always named, then its vendor's flag. The program is the file the client check asked (E1.7 §S7.6 item 3), and a call with no good verdict of this
 * client's own vendor answers `undefined`.
 */
function bridgedLaunch(
  cli: DbCli & { passwordEnv: string },
  dbType: DbType,
  stored: string,
  query: string,
  closing: Record<string, string>,
  options: { readonly absentFile: string; readonly verdict?: DbClientOk },
): DbQueryLaunch | undefined {
  const connection = bridgedDbConnection(dbType, stored, '');
  const { verdict } = options;
  return connection.ok && verdictFits(dbType, verdict) ? bridgedLaunchOf(cli, dbType, connection, query, closing, { absentFile: options.absentFile, verdict }) : undefined;
}

/** The launch of a built connection under a verdict that fits its client. */
function bridgedLaunchOf(
  cli: DbCli & { passwordEnv: string },
  dbType: DbType,
  connection: BuiltConnection,
  query: string,
  closing: Record<string, string>,
  options: { readonly absentFile: string; readonly verdict: DbClientOk },
): DbQueryLaunch | undefined {
  const args = BRIDGED_ARGS[dbType];
  const { verdict } = options;
  if (args === undefined) {
    return undefined;
  }
  const userEnv = BRIDGED_USER_ENV[dbType];
  const user = userEnv === undefined ? {} : { [userEnv]: connection.user };
  const settingFlags = SETTING_FLAGS[verdict.vendor](connection.settings);
  return settingFlags === undefined
    ? undefined
    : { exe: verdict.file.path, args: args(connection, query, options.absentFile, VENDOR_FLAGS[verdict.vendor](options.absentFile), settingFlags), env: { [cli.passwordEnv]: connection.password, ...closing, ...user } };
}

type BuiltConnection = Extract<BridgedDbConnection, { ok: true }>;

/** The arguments of each client for a built connection. The ONE leading space on psql's -c is the first-character rule of `buildDbQueryLaunch`; `-X`: no `.psqlrc` of the person's (E1.6, parent §4.11). */
const BRIDGED_ARGS: Partial<Record<DbType, (connection: BuiltConnection, query: string, absentFile: string, controls: readonly string[], settingFlags: readonly string[]) => string[]>> = {
  postgres: (connection, query, absentFile) => ['-X', '-c', ' ' + query, '--', bridgedPsqlString(connection, absentFile)],
  mysql: (connection, query, _absentFile, controls, settingFlags) => bridgedMysqlArgs(connection, query, controls, settingFlags),
  mssql: (connection, query, _absentFile, controls, settingFlags) => bridgedMssqlArgs(connection, query, controls, settingFlags),
};

/** The variable that carries the user, for the client that has no flag for it (`sqlcmd`): always set, since a user is required. */
const BRIDGED_USER_ENV: Partial<Record<DbType, string>> = { mssql: 'SQLCMDUSER' };

/**
 * No option file at all: `--no-defaults` first, because it is honoured only there and Oracle's `load-data-local-dir` in an option file survives `--local-infile=0`. Then `--protocol=TCP`
 * straight after it (PM1: both clients take it there), then the vendor's authentication flags; `-h` is always named, so `localhost` means TCP and never the socket file (Q17).
 */
function bridgedMysqlArgs(connection: BuiltConnection, query: string, controls: readonly string[], settingFlags: readonly string[]): string[] {
  const flags = [
    ['-h', connection.host],
    ...(connection.port === undefined ? [] : [['-P', connection.port]]),
    ['-u', connection.user],
    ...(connection.database === undefined ? [] : [['-D', connection.database]]),
  ].flat();
  return ['--no-defaults', '--protocol=TCP', ...settingFlags, ...controls, ...flags, '--skip-named-commands', '--delimiter=;', '--local-infile=0', '-e', query];
}

/** Today's `sqlcmd` arguments for the built fields: `-S host[,port]`, `-d`, `-Q`, `-b` and `-x` (scripting variables off: `$(SQLCMDPASSWORD)` is text), then the vendor's flag, last. */
function bridgedMssqlArgs(connection: BuiltConnection, query: string, controls: readonly string[], settingFlags: readonly string[]): string[] {
  const server = connection.port === undefined ? connection.host : `${connection.host},${connection.port}`;
  return ['-S', server, ...(connection.database === undefined ? [] : ['-d', connection.database]), '-Q', query, '-b', '-x', ...settingFlags, ...controls];
}

/**
 * The command that runs one query — or `undefined` when this type cannot be served
 * safely.
 *
 * <p><b>Why mongodb is refused.</b> `mongosh` has no password environment variable, and
 * its `--eval`/`--file` payload runs in the same JavaScript interpreter that can read
 * `process.env`. So a query supplied by an agent could simply print the password back
 * through stdout — a channel none of the SQL tools has, because SQL cannot read an
 * environment. A capability that leaks by design is worse than an absent one, so this
 * says no and the human keeps using their own client.</p>
 */
// eslint-disable-next-line complexity, max-lines-per-function
export function buildDbQueryLaunch(
  dbType: DbType,
  connectionString: string,
  query: string,
  options: { readonly bridged?: boolean; readonly absentFile?: string; readonly verdict?: DbClientOk } = {},
): DbQueryLaunch | undefined {
  const bridged = options.bridged === true;
  const closing = bridged ? clientFileNames(dbType, options.absentFile) : {};
  if (closing === undefined) {
    return undefined;
  }
  const cli = CLIS[dbType];
  if (cli === undefined || cli.passwordEnv === undefined) {
    return undefined;
  }
  // Defence in depth: the action refuses with a reason first, but nothing that builds a
  // launch may hand a client command to a process holding the password.
  if (refuseQuery(dbType, query) !== undefined) {
    return undefined;
  }
  if (bridged) {
    return bridgedLaunch({ ...cli, passwordEnv: cli.passwordEnv }, dbType, connectionString, query, closing, { absentFile: options.absentFile ?? '', verdict: options.verdict });
  }
  const parts = parseDbConnectionString(connectionString);
  const env: Record<string, string> = {};
  if (parts.password !== undefined && parts.password.length > 0) {
    env[cli.passwordEnv] = parts.password;
  }

  switch (dbType) {
    case 'postgres':
      // A dbConnection is attacker-influenced data (sync / share / import). Refuse anything
      // that is not a plain postgres URL rather than hand psql a token it could read as an
      // option — the same class the ssh path already guards with isSafeSshHost + `--`.
      if (!isSafePostgresUri(connectionString)) {
        return undefined;
      }
      // psql takes a whole URI, so everything the operator put in the query string —
      // sslmode, application_name — survives; decomposing into flags would drop it. `-c`
      // and the query stay OPTIONS; the URI is a positional AFTER `--`, so even a value
      // beginning with `-` can never be parsed by psql's getopt as an option.
      // The ONE leading space on the -c string is a security measure, not formatting: psql
      // reads a -c string as a meta-command only when its FIRST character is a backslash
      // (startup.c), so a space in front sends the whole string to the server as SQL on every
      // platform, whatever a later character folds to. Do not trim it.
      return {
        exe: cli.exe,
        args: ['-c', ' ' + query, '--', withoutPassword(connectionString)],
        env,
      };
    case 'mysql': {
      const args = ['-h', parts.host ?? 'localhost'];
      if (parts.port !== undefined) {
        args.push('-P', parts.port);
      }
      if (parts.user !== undefined) {
        args.push('-u', parts.user);
      }
      if (parts.database !== undefined) {
        args.push('-D', parts.database);
      }
      // Explicit options win over a my.cnf the agent never sees, and keep the person's other
      // settings (ssl-ca, socket, login-path) that --no-defaults would drop: long-form commands
      // only at a statement start, the split refuseQuery assumes, and no answer to a LOCAL INFILE
      // request. Known gap: Oracle's load-data-local-dir in an option file survives the last one.
      args.push('--skip-named-commands', '--delimiter=;', '--local-infile=0', '-e', query);
      return { exe: cli.exe, args, env };
    }
    case 'mssql': {
      if (parts.user !== undefined) {
        env.SQLCMDUSER = parts.user;
      }
      const server = parts.port !== undefined ? `${parts.host},${parts.port}` : (parts.host ?? '');
      const args = ['-S', server];
      if (parts.database !== undefined) {
        args.push('-d', parts.database);
      }
      // -b makes a SQL error an exit code, so the agent sees failure as failure.
      // -x switches scripting-variable substitution off: sqlcmd resolves `$(NAME)` from its
      // variables and then from the ENVIRONMENT, and SQLCMDPASSWORD is one of them.
      args.push('-Q', query, '-b', '-x');
      return { exe: cli.exe, args, env };
    }
    default:
      return undefined;
  }
}
