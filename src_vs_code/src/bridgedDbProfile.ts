import type { DbType } from './types';
import { DR1, clientNameOf } from './bridgedDbSentences';

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
