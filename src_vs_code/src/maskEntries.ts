import { isLockedSecret } from './secretEnvelope';
import { parseDbConnectionString } from './dbConnString';
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
  // own value rather than only as part of the connection string it came from.
  const embedded = present(values[3]).flatMap((c) => present(passwordFromConnection(c)));
  return [
    ...entries,
    ...embedded.map((value) => ({ value, label: bindings.dbPassword ?? 'DB_PASSWORD' })),
  ];
}

/** A non-empty string as a one-element list, so absent values compose away. */
/**
 * A value worth masking, or nothing.
 *
 * <p><b>A PIN-protected value is skipped, and there is nothing lost by it.</b> The masker replaces
 * secrets that appear in a command's output; what is stored for a protected entry is the wrap, and
 * the wrap is not what any tool prints — the PLAINTEXT would be, and this cannot read it. Masking
 * the ciphertext would be masking a string that will never occur.</p>
 *
 * <p>It also cannot leak: an entry whose values are locked has already refused every automatic path
 * that could put one in a command line, so there is no run whose output could carry it.</p>
 */
function present(value: string | undefined): string[] {
  return typeof value === 'string' && value.length > 0 && !isLockedSecret(value) ? [value] : [];
}

/**
 * The password inside a connection string, in whichever dialect it is written.
 *
 * <p>Both dialects, because both are stored: `postgresql://user:pw@host/db` for postgres,
 * MySQL and MongoDB, and `Server=host,1433;…;Password=pw` for MSSQL — which is what
 * `buildDbConnectionString` and the entity form's own builder produce, and what people paste
 * out of Azure and SSMS. An earlier version parsed only URLs, so for MSSQL the bare password
 * was never masked at all; the whole string still was, which hid it until the password
 * appeared on its own — a client error, or `SQLCMDPASSWORD`, which is precisely the value
 * `buildDbQueryLaunch` puts into the environment of the process whose output is being masked.
 *
 * <p>Decoded, because that is the form a client prints it in: a URL carries it
 * percent-encoded, the process holds it raw. `parseDbConnectionString` is the one parser both
 * this and the launcher use, so they cannot disagree about what the credential is — and it
 * never throws, returning `{}` for anything it does not understand, which is the property
 * this path needs.</p>
 */
function passwordFromConnection(connection: string): string | undefined {
  const password = parseDbConnectionString(connection).password;
  return password !== undefined && password.length > 0 ? password : undefined;
}
