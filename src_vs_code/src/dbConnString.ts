import { DbType } from './types';

/** Well-known default ports, used when a connection string omits one. */
export const DB_DEFAULT_PORTS: Record<DbType, string> = {
  postgres: '5432',
  mysql: '3306',
  mssql: '1433',
  mongodb: '27017',
};

/**
 * Parsing/building of DB connection strings — pure and unit-testable.
 * Two dialects:
 *  - URI style (postgresql:// mysql:// mongodb:// mongodb+srv://…)
 *  - key-value style (Server=host,port;Database=db;User Id=u;Password=p)
 * The stored secret remains the STRING; parts are derived on demand.
 */

export interface DbConnParts {
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  password?: string;
}

/** `http://host/path` → `host` — users paste RDS endpoints with a scheme. */
export function cleanHost(value: string): string {
  return value.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
}

/** Collapse an accidental double scheme: `mysql://http://h/db` → `mysql://h/db`. */
function collapseDoubleScheme(value: string): string {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)[a-z][a-z0-9+.-]*:\/\//i, '$1');
}

export function parseDbConnectionString(value: string): DbConnParts {
  const trimmed = collapseDoubleScheme(value.trim());
  if (trimmed.length === 0) {
    return {};
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return clean({
        host: url.hostname,
        port: url.port,
        database: url.pathname.replace(/^\//, '').split('?')[0],
        user: safeDecode(url.username),
        password: safeDecode(url.password),
      });
    } catch {
      return {};
    }
  }

  // key=value;key=value dialect (MSSQL/ADO-style)
  const kv: Record<string, string> = {};
  for (const part of trimmed.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      kv[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    }
  }
  const server = kv['server'] ?? kv['host'] ?? kv['data source'] ?? '';
  let host = server;
  let port = kv['port'] ?? '';
  const withPort = server.match(/^(.*?)[,:](\d+)$/);
  if (withPort !== null) {
    host = withPort[1];
    port = port.length > 0 ? port : withPort[2];
  }
  return clean({
    host: cleanHost(host),
    port,
    database: kv['database'] ?? kv['initial catalog'],
    user: kv['user id'] ?? kv['uid'] ?? kv['user'] ?? kv['username'],
    password: kv['password'] ?? kv['pwd'],
  });
}

export function buildDbConnectionString(dbType: DbType, parts: DbConnParts): string {
  parts = { ...parts, host: parts.host !== undefined ? cleanHost(parts.host) : undefined };
  if (dbType === 'mssql') {
    const out: string[] = [];
    if (parts.host) {
      out.push(`Server=${parts.host}${parts.port ? `,${parts.port}` : ''}`);
    }
    if (parts.database) {
      out.push(`Database=${parts.database}`);
    }
    if (parts.user) {
      out.push(`User Id=${parts.user}`);
    }
    if (parts.password) {
      out.push(`Password=${parts.password}`);
    }
    return out.join(';');
  }
  const scheme = dbType === 'postgres' ? 'postgresql' : dbType === 'mongodb' ? 'mongodb' : 'mysql';
  let s = `${scheme}://`;
  if (parts.user) {
    s += encodeURIComponent(parts.user);
    if (parts.password) {
      s += `:${encodeURIComponent(parts.password)}`;
    }
    s += '@';
  }
  s += parts.host ?? '';
  if (parts.port) {
    s += `:${parts.port}`;
  }
  if (parts.database) {
    s += `/${parts.database}`;
  }
  return s;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function clean(parts: DbConnParts): DbConnParts {
  return Object.fromEntries(
    Object.entries(parts).filter(([, v]) => typeof v === 'string' && v.length > 0),
  ) as DbConnParts;
}

/**
 * The same connection string with its password removed.
 *
 * <p>Copying a connection string is usually about "which host, which database" — the
 * password rides along only because it happens to live in the same URI. This is the
 * companion for that case; the full copy stays, because pasting into a client's own
 * connection form is a real workflow this extension cannot replace.</p>
 *
 * <p>Textual on purpose: `parseDbConnectionString` drops the query string, and a
 * round-trip through it would quietly discard `sslmode`, `replicaSet` and every other
 * option someone put there. Anything that does not parse as a URI comes back untouched
 * rather than mangled.</p>
 */
export function withoutPassword(connectionString: string): string {
  return connectionString.replace(
    /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:@\/]+):([^@\/]*)@/,
    (_whole, scheme: string, user: string) => scheme + user + '@',
  );
}
