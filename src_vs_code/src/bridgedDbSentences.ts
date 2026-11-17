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
