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
export function buildDbQueryLaunch(
  dbType: DbType,
  connectionString: string,
  query: string,
): DbQueryLaunch | undefined {
  const cli = CLIS[dbType];
  if (cli === undefined || cli.passwordEnv === undefined) {
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
      args.push('-Q', query, '-b');
      return { exe: cli.exe, args, env };
    }
    default:
      return undefined;
  }
}
