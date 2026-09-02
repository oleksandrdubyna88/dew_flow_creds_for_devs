import {
  attachmentSecretKey,
  configSecretKey,
  dbConnSecretKey,
  fieldsSecretKey,
  imageSecretKey,
  notesSecretKey,
  paymentSecretKey,
  privateKeySecretKey,
  secretKey,
  totpSecretKey,
  vpnConfigSecretKey,
} from './secretKeys';

/**
 * Every per-entity secret kept as ONE string under ONE key, by the bundle field that carries it.
 *
 * <p>Export, import, snapshot and the delete-with-the-entry all walk THIS list. It used to be
 * ten hand-written blocks per site — the audit's "seven kinds walked by hand" — and a kind added
 * to one site and forgotten in another exported silently incomplete files. Now a kind is a row.</p>
 *
 * <p>Its own module since S1.4, and not only for the size ratchet: five other files carry lists
 * that must AGREE with this one (`syncMerge`'s snapshot, `syncManager`'s vault read-back,
 * `idQuarantine`'s remap, `revisionHistory`, `externalSecretsApply`), and a shared truth living
 * inside the one class that happens to use it is a shared truth nothing else can be checked
 * against. Free of `vscode`, so a test can walk it.</p>
 *
 * <p>Not to be confused with `secretKinds.ts`, which is about what this extension can GENERATE.</p>
 */
export type SecretMapKey =
  | 'passwords'
  | 'privateKeys'
  | 'vpnConfigs'
  | 'dbConnections'
  | 'notes'
  | 'attachments'
  | 'images'
  | 'totps'
  | 'configs'
  | 'fields'
  | 'payments';

export type SecretMaps = Record<SecretMapKey, Record<string, string>>;

export const SECRET_KINDS: ReadonlyArray<{
  bundleKey: SecretMapKey;
  key: (accountId: string, entityId: string) => string;
}> = [
  { bundleKey: 'passwords', key: (a, e) => secretKey(a, e) },
  { bundleKey: 'privateKeys', key: (a, e) => privateKeySecretKey(a, e) },
  { bundleKey: 'vpnConfigs', key: (a, e) => vpnConfigSecretKey(a, e) },
  { bundleKey: 'dbConnections', key: (a, e) => dbConnSecretKey(a, e) },
  { bundleKey: 'notes', key: (a, e) => notesSecretKey(a, e) },
  { bundleKey: 'attachments', key: (a, e) => attachmentSecretKey(a, e) },
  { bundleKey: 'images', key: (a, e) => imageSecretKey(a, e) },
  { bundleKey: 'totps', key: (a, e) => totpSecretKey(a, e) },
  { bundleKey: 'configs', key: (a, e) => configSecretKey(a, e) },
  { bundleKey: 'fields', key: (a, e) => fieldsSecretKey(a, e) },
  // ONE row is the whole of a new secret kind's storage — export, import, snapshot and delete all
  // walk this list, so a kind reaches four sites with no line written at any of them.
  { bundleKey: 'payments', key: (a, e) => paymentSecretKey(a, e) },
];

/**
 * A full set of empty maps — DERIVED from the rows above, not written out again.
 *
 * <p>It used to be an eleventh hand-kept list, and the kind of list that is wrong for a release
 * before anyone notices: a key missing here reads as "this bundle carried no payments" rather
 * than as a mistake.</p>
 */
export function emptySecretMaps(): SecretMaps {
  return Object.fromEntries(SECRET_KINDS.map((kind) => [kind.bundleKey, {}])) as SecretMaps;
}
