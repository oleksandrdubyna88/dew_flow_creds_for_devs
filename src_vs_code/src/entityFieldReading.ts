import { BindableField } from './envBinding';
import { EntityMetadata } from './types';
import { FieldReading, readingOf } from './fieldReading';
import { fieldReadingOf } from './secretOpener';
import { automaticOpenerFor } from './automaticRead';
import { stored } from './storedSecret';
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
    return totpReading(storage, accountId, details, now);
  }
  return bindableFieldReading(storage, accountId, details, field as BindableField);
}

/**
 * The stored note, or the plaintext one an older entry still carries in its metadata — withheld, with
 * the sentence, for a protected entry (entry-PIN plan, D7: until 1.12 a reference resolved to the
 * envelope). Opened by `automaticOpenerFor`, which asks the wrap first and the mark second exactly as the
 * env bindings do, and refuses a damaged wrap as damaged (typed-secrets plan, T3 — until then its text
 * resolved as the note). The metadata note is what is stored for an older entry, so it is opened the same way.
 */
async function notesReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
): Promise<FieldReading> {
  const held = await storage.getNotes(accountId, details.id);
  // A metadata value read as the plain stored form it is: the legacy note kept in node metadata.
  return fieldReadingOf(await automaticOpenerFor(storage, accountId)(details, held ?? stored(details.notes)), details);
}

/**
 * The code as of `now` — a seed with no readable code is absent; a protected entry's seed is WITHHELD.
 * Until 1.12 a sealed seed parsed as no seed at all, and a reference said "absent" about a code that
 * exists and may not be used; until the typed-secrets plan (T3) a damaged one did too.
 */
async function totpReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  now: number,
): Promise<FieldReading> {
  const seed = fieldReadingOf(await automaticOpenerFor(storage, accountId)(details, await storage.getTotp(accountId, details.id)), details);
  return seed.kind === 'value' ? readingOf(totpSnapshot(seed.value, now)?.code) : seed;
}
