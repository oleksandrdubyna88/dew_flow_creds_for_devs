import { DbType } from './types';
import { parseDbConnectionString, withoutPassword } from './dbConnString';

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
 * mysql's long-form client commands. They run in the CLIENT — `system` spawns a shell that
 * inherits MYSQL_PWD — and are recognised at the start of a statement whenever named commands
 * are on (a `my.cnf` the agent never sees can turn them on). Short forms are all backslash
 * commands and are covered by the blanket backslash rule.
 */
const MYSQL_CLIENT_WORDS = ['system', 'source', 'tee', 'notee', 'pager', 'nopager', 'edit'];

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
 *       meta-command when its first character is `\`; refusing it at any line start is one
 *       rule with margin instead of a rule matched to one version's parser.</li>
 *   <li><b>mysql</b>: no backslash anywhere. The mysql client executes `\!` wherever it appears
 *       outside a quoted string — `select 1 \! id` runs `id` — so the position rule psql allows
 *       is not enough here; and the long-form words are refused at a statement start.</li>
 *   <li><b>mssql</b>: no line may begin with `:` or `!!`; and `buildDbQueryLaunch` passes `-x`,
 *       because sqlcmd resolves `$(NAME)` from its scripting variables and then from the
 *       ENVIRONMENT — `select '$(SQLCMDPASSWORD)'` would print the password as plain SQL.</li>
 * </ul>
 */
// eslint-disable-next-line complexity
export function refuseQuery(dbType: DbType, query: string): string | undefined {
  const lines = query.split(/\r?\n/).map((line) => line.trimStart());
  switch (dbType) {
    case 'postgres':
      return lines.some((line) => line.startsWith(BACKSLASH))
        ? 'Refused: a line starting with a backslash is a psql meta-command. Meta-commands run in the client, where the password lives in the environment, so they are never accepted from an agent — send plain SQL.'
        : undefined;
    case 'mysql': {
      if (query.includes(BACKSLASH)) {
        return 'Refused: a backslash is a mysql client command wherever it appears (\\! runs a shell that holds the password). Send plain SQL without backslashes — use CHAR() for escapes.';
      }
      const statements = query
        .split(/;|\r?\n/)
        .map((s) => s.trimStart().toLowerCase())
        .filter((s) => s.length > 0);
      const word = statements
        .map((s) => /^([a-z]+)(?:\s|$)/.exec(s)?.[1])
        .find((w) => w !== undefined && MYSQL_CLIENT_WORDS.includes(w));
      return word !== undefined
        ? `Refused: "${word}" is a mysql client command, not SQL. Client commands run local programs with the password in their environment, so they are never accepted from an agent.`
        : undefined;
    }
    case 'mssql':
      return lines.some((line) => line.startsWith(':') || line.startsWith('!!'))
        ? 'Refused: a line starting with ":" or "!!" is a sqlcmd command, not SQL. Client commands run local programs with the password in their environment, so they are never accepted from an agent.'
        : undefined;
    default:
      return undefined;
  }
}

export function resolveDbCli(dbType: DbType, onPath: (exe: string) => boolean): DbCli | undefined {
  const cli = CLIS[dbType];
  if (cli === undefined) {
    return undefined;
  }
  return onPath(cli.exe) ? cli : undefined;
}

export interface DbQueryLaunch {
  exe: string;
  args: string[];
  /** Merged over the parent environment by the caller. */
  env: Record<string, string>;
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
): DbQueryLaunch | undefined {
  const cli = CLIS[dbType];
  if (cli === undefined || cli.passwordEnv === undefined) {
    return undefined;
  }
  // Defence in depth: the action refuses with a reason first, but nothing that builds a
  // launch may hand a client command to a process holding the password.
  if (refuseQuery(dbType, query) !== undefined) {
    return undefined;
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
      return { exe: cli.exe, args: ['-c', query, '--', withoutPassword(connectionString)], env };
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
      args.push('-e', query);
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
