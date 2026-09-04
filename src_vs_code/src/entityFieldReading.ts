import { BindableField } from './envBinding';
import { EntityMetadata } from './types';
import { FieldReading, readingOf } from './fieldReading';
import { bindableFieldReading } from './envApply';
import { SecretRefField } from './secretRef';
import { StorageManager } from './storageManager';
import { totpSnapshot } from './totp';

/**
 * Every field a `creds://` reference can name, read as one of the three answers.
 *
 * <p>Its own module, and not a lambda inside `activate()`, for the reason a reviewer gave when
 * this was still three duplicated `passwordWoven` checks: an automatic consumer must not be able
 * to reach a value without also being handed the reason it may not have one. That guarantee is
 * worth nothing while the only implementation lives inside a 1,100-line composition root, where
 * the next consumer will simply write its own.</p>
 *
 * <p>Seven fields, three sources: two are read straight off storage, and the remaining five are
 * exactly the env-bindable ones — so the table that already maps a field to a value answers here
 * too, rather than a second copy of it.</p>
 */
export function entityFieldReading(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  field: SecretRefField,
  now: number = Date.now(),
): Promise<FieldReading> {
  const details = storage.getNode(accountId, entityId)?.details;
  return details === undefined
    ? Promise.resolve({ kind: 'absent' })
    : fieldOf(storage, accountId, details, field, now);
}

function fieldOf(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: SecretRefField,
  now: number,
): Promise<FieldReading> {
  if (field === 'notes') {
    return notesReading(storage, accountId, details);
  }
  if (field === 'totp') {
    return totpReading(storage, accountId, details.id, now);
  }
  return bindableFieldReading(storage, accountId, details, field as BindableField);
}

/** The stored note, or the plaintext one an older entry still carries in its metadata. */
async function notesReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
): Promise<FieldReading> {
  return readingOf((await storage.getNotes(accountId, details.id)) ?? details.notes);
}

/** The code as of `now` — a seed with no readable code is absent, not withheld. */
async function totpReading(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  now: number,
): Promise<FieldReading> {
  return readingOf(totpSnapshot(await storage.getTotp(accountId, entityId), now)?.code);
}
