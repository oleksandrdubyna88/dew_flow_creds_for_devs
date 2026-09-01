import type { ExternalSecrets } from './externalBundle';
import type { StorageManager } from './storageManager';

/**
 * Restoring the secrets of an imported external bundle — the mirror of `exportSecretsFor`.
 *
 * <p>Extracted from the `importExternal` command because it was a hand-written loop that had to agree
 * with `ExternalSecrets` and had no way of being checked, and it had silently stopped agreeing TWICE.
 * The code review found the payment half — S1.3 added `payment` to the export and never to the import,
 * so exporting a card to a file and importing it back created the entry and discarded the card,
 * number, CVV, PIN and all. Auditing for that found the same hole already there for `config`: a config
 * body has never been restored from an external file since the kind shipped.</p>
 *
 * <p><b>The point of this module is not the missing lines, it is the LIST.</b> `EXTERNAL_SECRET_KEYS`
 * pairs each field with the accessor that stores it, so `externalSecretsApply.test.ts` can assert that
 * every field an export CARRIES is also RESTORED — driven from the list rather than from a hand-written
 * set of assertions. A field added to `ExternalSecrets` and forgotten here now fails a test instead of
 * vanishing on somebody's import.</p>
 *
 * <p>It is the same lesson as the four hand-maintained secret lists in
 * `research/module_extension.md`: a table that walks itself cannot be half-updated. This is the fifth
 * such list, and the first with a test.</p>
 */

/** The storage writers this module needs — narrow on purpose, so a test needs no real vault. */
type SecretWriter = Pick<
  StorageManager,
  | 'setPassword'
  | 'setPrivateKey'
  | 'setVpnConfig'
  | 'setDbConnection'
  | 'setNotes'
  | 'setFields'
  | 'setAttachment'
  | 'setImage'
  | 'setTotp'
  | 'setConfigBody'
  | 'setPaymentRaw'
>;

/**
 * Every simple field: one value, one setter, written when present.
 *
 * <p>`login`/`url` are absent because they are ONE record under one keychain key (`entityFields.ts`)
 * and so are one write rather than two — handled separately below. `setter` is named as a string so
 * the test can assert coverage by name without calling anything.</p>
 */
export const EXTERNAL_SECRET_KEYS = [
  { field: 'password', setter: 'setPassword' },
  { field: 'privateKey', setter: 'setPrivateKey' },
  { field: 'vpnConfig', setter: 'setVpnConfig' },
  { field: 'dbConnection', setter: 'setDbConnection' },
  { field: 'notes', setter: 'setNotes' },
  { field: 'attachment', setter: 'setAttachment' },
  { field: 'image', setter: 'setImage' },
  { field: 'totp', setter: 'setTotp' },
  { field: 'config', setter: 'setConfigBody' },
  { field: 'payment', setter: 'setPaymentRaw' },
  // The pair, named here so the coverage test counts it; applied by `applyFields` below.
  { field: 'login', setter: 'setFields' },
] as const satisfies ReadonlyArray<{ field: keyof ExternalSecrets; setter: keyof SecretWriter }>;

/**
 * Restore one bundle's secrets, entity by entity.
 *
 * <p>Sequential rather than parallel, matching the loop it replaces: each write is a read-modify-write
 * of shared storage state, and two in flight would drop one.</p>
 */
export async function applyExternalSecrets(
  storage: SecretWriter,
  accountId: string,
  secrets: Readonly<Record<string, ExternalSecrets>>,
): Promise<void> {
  for (const [entityId, s] of Object.entries(secrets)) {
    await applySimpleFields(storage, accountId, entityId, s);
    await applyFields(storage, accountId, entityId, s);
  }
}

/** Every one-value-one-setter field. `login`/`url` are the pair and are applied separately. */
async function applySimpleFields(
  storage: SecretWriter,
  accountId: string,
  entityId: string,
  s: ExternalSecrets,
): Promise<void> {
  for (const { field, setter } of EXTERNAL_SECRET_KEYS.filter((k) => k.field !== 'login')) {
    const value = s[field];
    if (value !== undefined) {
      await (storage[setter] as (a: string, e: string, v: string) => Promise<void>)(accountId, entityId, value);
    }
  }
}

/** Login and URL travel as two fields and are STORED as one record — so one write, not two. */
async function applyFields(
  storage: SecretWriter,
  accountId: string,
  entityId: string,
  s: ExternalSecrets,
): Promise<void> {
  if (s.login === undefined && s.url === undefined) {
    return;
  }
  await storage.setFields(accountId, entityId, { login: s.login, url: s.url });
}
