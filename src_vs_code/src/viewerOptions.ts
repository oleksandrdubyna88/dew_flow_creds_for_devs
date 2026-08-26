import { DB_DEFAULT_PORTS, DbConnParts, parseDbConnectionString } from './dbConnString';
import { Revision } from './revisionHistory';
import type { StorageManager } from './storageManager';
import { DbType } from './types';
import { TotpSnapshot, totpSnapshot } from './totp';

/**
 * The shared half of the two entity viewers (audit 2026-08-25, A1).
 *
 * <p>The read-only viewer opens on two things — the LIVE entity, whose secrets live in the
 * keychain, and a kept REVISION, whose secrets ride the revision record — and each used to
 * carry its own copy of the same field-to-secret ladder and the same db-connection display
 * arithmetic. One drifted change (a new field, a changed default) would have made "the same
 * entry, as it was" quietly render differently from "the same entry, now". Both viewers now
 * feed from here; the difference between them collapses to WHERE a secret is read from,
 * which is exactly the `SecretReader` seam.</p>
 *
 * <p>Pure and free of `vscode`, so the mapping is a unit test.</p>
 */

/** The fields the viewer's per-field Copy can ask for (mirrors `EntityViewOptions`). */
export type ViewerSecretField =
  | 'password'
  | 'privateKey'
  | 'vpnConfig'
  | 'dbConnection'
  | 'dbPassword'
  | 'totp';

/** Where a viewer's secrets come from: the keychain (live) or the revision record. */
export interface SecretReader {
  password(): Thenable<string | undefined>;
  privateKey(): Thenable<string | undefined>;
  vpnConfig(): Thenable<string | undefined>;
  dbConnection(): Thenable<string | undefined>;
  /** The stored `otpauth://` seed. The viewer never gets this — only the code below. */
  totpSeed(): Thenable<string | undefined>;
}

/** The one field-to-secret ladder both viewers share. */
export function secretResolver(read: SecretReader): (field: ViewerSecretField) => Thenable<string | undefined> {
  // eslint-disable-next-line complexity -- one branch per field is the whole job
  return (field) =>
    field === 'password'
      ? read.password()
      : field === 'privateKey'
        ? read.privateKey()
        : field === 'vpnConfig'
          ? read.vpnConfig()
          : field === 'totp'
            ? // The CODE, never the seed — copying a one-time code is copying something that
              // expires, which is the whole point of the field.
              Promise.resolve(read.totpSeed()).then((uri) => totpSnapshot(uri, Date.now())?.code)
            : field === 'dbPassword'
              ? Promise.resolve(read.dbConnection()).then((v) =>
                  v === undefined ? undefined : parseDbConnectionString(v).password,
                )
              : read.dbConnection();
}

/** The live code for a viewer, or undefined when the entry has no seed. */
export function totpViewFor(read: SecretReader): () => Thenable<TotpSnapshot | undefined> {
  return () => Promise.resolve(read.totpSeed()).then((uri) => totpSnapshot(uri, Date.now()));
}

/** Live secrets: read from the keychain at the moment the Copy button is pressed. */
export function storageSecretReader(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): SecretReader {
  return {
    password: () => storage.getPassword(accountId, entityId),
    privateKey: () => storage.getPrivateKey(accountId, entityId),
    vpnConfig: () => storage.getVpnConfig(accountId, entityId),
    dbConnection: () => storage.getDbConnection(accountId, entityId),
    // Read at each request rather than once: the seed can be edited while the panel is open.
    totpSeed: () => storage.getTotp(accountId, entityId),
  };
}

/** A revision's secrets: whatever the record kept, nothing read from the keychain. */
export function revisionSecretReader(revision: Revision): SecretReader {
  const { password, privateKey, vpnConfig, dbConnection, totp } = revision.secrets;
  return {
    password: () => Promise.resolve(password),
    privateKey: () => Promise.resolve(privateKey),
    vpnConfig: () => Promise.resolve(vpnConfig),
    dbConnection: () => Promise.resolve(dbConnection),
    // A replaced seed still produces codes — that is why history keeps it.
    totpSeed: () => Promise.resolve(totp),
  };
}

export interface DbDisplay {
  /** Parts for the viewer, with the password STRIPPED — it renders as a masked row. */
  dbParts: DbConnParts | undefined;
  /** True when the shown port is the type's default rather than the string's. */
  dbPortIsDefault: boolean;
  dbHasPassword: boolean;
}

/**
 * What the viewer shows for a DB connection: always a port (the type's default when the
 * string names none), never the password inline.
 */
// Moved as written from the two viewers (A1); the pre-existing complexity is marked, not hidden.
// eslint-disable-next-line complexity
export function dbDisplay(dbConnection: string | undefined, dbType: DbType | undefined): DbDisplay {
  const parsed = dbConnection !== undefined ? parseDbConnectionString(dbConnection) : undefined;
  let dbPortIsDefault = false;
  if (parsed !== undefined && parsed.port === undefined && dbType !== undefined) {
    parsed.port = DB_DEFAULT_PORTS[dbType];
    dbPortIsDefault = true;
  }
  return {
    dbParts: parsed !== undefined ? { ...parsed, password: undefined } : undefined,
    dbPortIsDefault,
    dbHasPassword: parsed?.password !== undefined,
  };
}
