import type { ExternalSecrets } from './externalBundle';
import { EntryWriter, writerForNew } from './entryWriter';
import type { SettledPin } from './pinOnCreate';
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
  { field: 'second', setter: 'setSecondRaw' },
  // The pair, named here so the coverage test counts it; applied by `applyFields` below.
  { field: 'login', setter: 'setFields' },
] as const satisfies ReadonlyArray<{ field: keyof ExternalSecrets; setter: keyof EntryWriter }>;

/**
 * Restore one bundle's secrets, entity by entity — each entity's through its own writer
 * (`entryWriter.writerForNew`: the ids are new), never through the storage itself (T4).
 *
 * <p>`pinFor` says, per entity, the PIN its landing settled — the folder's, sealing every value before its
 * first write, or none (`PLAN_pin_folder_asks_on_accept_and_import.md` B7). REQUIRED, with no default: a
 * caller that could leave it out could write plain into a protected folder without noticing.</p>
 *
 * <p>Sequential rather than parallel, matching the loop it replaces: each write is a read-modify-write
 * of shared storage state, and two in flight would drop one.</p>
 */
export async function applyExternalSecrets(
  storage: StorageManager,
  accountId: string,
  secrets: Readonly<Record<string, ExternalSecrets>>,
  pinFor: (entityId: string) => SettledPin,
): Promise<void> {
  for (const [entityId, s] of Object.entries(secrets)) {
    const writer = writerForNew(storage, accountId, entityId, pinFor(entityId));
    await applySimpleFields(writer, accountId, entityId, s);
    await applyFields(writer, accountId, entityId, s);
  }
}

/** Every one-value-one-setter field. `login`/`url` are the pair and are applied separately. */
async function applySimpleFields(
  writer: EntryWriter,
  accountId: string,
  entityId: string,
  s: ExternalSecrets,
): Promise<void> {
  for (const { field, setter } of EXTERNAL_SECRET_KEYS.filter((k) => k.field !== 'login')) {
    const value = s[field];
    if (value !== undefined) {
      await (writer[setter] as (a: string, e: string, v: string) => Promise<void>)(accountId, entityId, value);
    }
  }
}

/** Login and URL travel as two fields and are STORED as one record — so one write, not two. */
async function applyFields(
  writer: EntryWriter,
  accountId: string,
  entityId: string,
  s: ExternalSecrets,
): Promise<void> {
  if (s.login === undefined && s.url === undefined) {
    return;
  }
  await writer.setFields(accountId, entityId, { login: s.login, url: s.url });
}
