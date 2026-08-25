import type { MaskEntry } from './secretMasker';
import { EntityMetadata } from './types';

/**
 * The values to mask out of one entity's own command output, and what to call them.
 *
 * <p>Scoped to the entity the grant points at — never the whole vault. Building the table
 * from every secret of every unlocked account would put N keychain reads on a per-call path,
 * which is exactly the cost class 0.57.0 removed from the tree (`hasPassword` per row) and
 * from the sync cycle. One entity is five reads at most, only when a grant is actually used,
 * and it is the entity whose credential produced the output in the first place — a command
 * run with `prod-db`'s password cannot print `staging`'s.</p>
 *
 * <p>Labels come from the entity's own env-binding names when it has them, so a masked value
 * reads as `&lt;CREDS_MASKED:PROD_DB_PASSWORD&gt;` — the name the person already chose — and only
 * falls back to the generic field name when no binding exists.</p>
 *
 * <p>Kept apart from `secretMasker.ts` because that module is pure text and this one knows
 * about storage; and apart from `credsAgentServer.ts` because the server should not know how
 * a secret is stored.</p>
 */

/** Just the reads this needs — so the unit test does not build a StorageManager. */
export interface SecretSource {
  getNode(accountId: string, id: string): { details?: EntityMetadata } | undefined;
  getPassword(accountId: string, entityId: string): Thenable<string | undefined>;
  getPrivateKey(accountId: string, entityId: string): Thenable<string | undefined>;
  getVpnConfig(accountId: string, entityId: string): Thenable<string | undefined>;
  getDbConnection(accountId: string, entityId: string): Thenable<string | undefined>;
  getNotes(accountId: string, entityId: string): Thenable<string | undefined>;
}

/** Secret field -> the fallback label, and the env-binding key that can override it. */
const FIELDS = [
  { field: 'password', label: 'PASSWORD' },
  { field: 'privateKey', label: 'PRIVATE_KEY' },
  { field: 'vpnConfig', label: 'VPN_CONFIG' },
  { field: 'dbConnection', label: 'DB_CONNECTION' },
  { field: 'notes', label: 'NOTES' },
] as const;

export async function maskEntriesFor(
  source: SecretSource,
  accountId: string,
  entityId: string,
): Promise<readonly MaskEntry[]> {
  const details = source.getNode(accountId, entityId)?.details;
  const bindings = details?.envBindings ?? {};

  const values = await Promise.all([
    source.getPassword(accountId, entityId),
    source.getPrivateKey(accountId, entityId),
    source.getVpnConfig(accountId, entityId),
    source.getDbConnection(accountId, entityId),
    source.getNotes(accountId, entityId),
  ]);

  const entries = FIELDS.flatMap(({ field, label }, index) =>
    present(values[index]).map((value) => ({ value, label: bindings[field] ?? label })),
  );

  // A DB connection string carries the password inside it; the password on its own is what a
  // tool actually prints (PGPASSWORD, a client's own error message), so it is masked as its
  // own value rather than only as part of the URL it came from.
  const embedded = present(values[3]).flatMap((c) => present(passwordFromConnection(c)));
  return [
    ...entries,
    ...embedded.map((value) => ({ value, label: bindings.dbPassword ?? 'DB_PASSWORD' })),
  ];
}

/** A non-empty string as a one-element list, so absent values compose away. */
function present(value: string | undefined): string[] {
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

/**
 * The password inside a connection URL, decoded.
 *
 * <p>Decoded because that is the form a client prints it in: the URL carries it
 * percent-encoded, the process holds it raw. Deliberately not reusing the fuller
 * `parseDbConnectionString` — this must never throw on a value that is not a URL at all, and
 * a malformed string here simply means nothing extra to mask.</p>
 */
function passwordFromConnection(connection: string): string | undefined {
  try {
    const url = new URL(connection.trim());
    return url.password.length > 0 ? decodeURIComponent(url.password) : undefined;
  } catch {
    return undefined;
  }
}
