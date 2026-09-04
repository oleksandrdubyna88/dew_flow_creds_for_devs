import * as vscode from 'vscode';
import { parseDbConnectionString } from './dbConnString';
import { BindableField, EnvBindings, staleEnvNames } from './envBinding';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { FieldReading, readingOf, valueOf, withheld } from './fieldReading';

/**
 * Writing bound secret fields into VS Code's environment variable collection — the
 * mechanism that injects variables into every integrated terminal opened afterwards,
 * persisted across reloads.
 *
 * <p>Values come from THIS machine's SecretStorage at the moment of writing. A binding
 * synced from another machine is a name with no value until someone presses `Set env`
 * here or saves the entity — which is also the recovery path the operator asked for
 * when the collection is lost.</p>
 */

/** The current value of one bindable field, or undefined when nothing is stored. */
/**
 * Why this field cannot be handed to something automatic, or `''` when it can.
 *
 * <p>One field has an answer here, and it is a decision rather than a limitation: a WOVEN password
 * is stored as the person's value and a decoy interleaved, and nothing — this build included —
 * knows which half is theirs. An environment variable or a terminal could therefore only ever be
 * given a guess, and a wrong password injected into either is an account lockout nobody watches
 * happen. So the value is withheld, and the caller says this sentence rather than "nothing to
 * copy", which would be false.</p>
 *
 * <p>The alternative — prompting for the method and the column at each use — was considered and
 * rejected by the owner: it puts the choice of which half is real in front of somebody at the
 * moment they are least able to check it.</p>
 */
export function automaticRefusal(details: EntityMetadata, field: BindableField): string {
  return field === 'password' && details.passwordWoven === true
    ? `"${details.name}" stores its password woven with a decoy, so it cannot be used automatically: `
      + 'nothing here knows which of the two halves is yours. Open the entry, pick your method, and '
      + 'copy the row you recognise.'
    : '';
}

/**
 * One bindable field, as one of the three answers.
 *
 * <p>The refusal is decided HERE and nowhere else. It used to be checked by each caller before
 * calling this, which a reviewer correctly read as a policy with no boundary: a new consumer that
 * did not know to ask would get `undefined` and report "nothing stored" about a password that is
 * very much stored. Now the only way to reach the value is through a reading that carries the
 * refusal with it.</p>
 */
export async function bindableFieldReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
): Promise<FieldReading> {
  const refusal = automaticRefusal(details, field);
  return refusal === '' ? readingOf(await storedField(storage, accountId, details, field)) : withheld(refusal);
}

// eslint-disable-next-line complexity
async function storedField(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
): Promise<string | undefined> {
  switch (field) {
    case 'password':
      return storage.getPassword(accountId, details.id);
    case 'privateKey':
      return storage.getPrivateKey(accountId, details.id);
    case 'publicKey':
      return details.publicKey;
    case 'dbConnection':
      return storage.getDbConnection(accountId, details.id);
    case 'dbPassword': {
      const conn = await storage.getDbConnection(accountId, details.id);
      return conn === undefined ? undefined : parseDbConnectionString(conn).password;
    }
  }
}

/** The value alone, for `applyEnvBindings`, which writes what it can and skips what it cannot. */
export async function bindableFieldValue(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
): Promise<string | undefined> {
  return valueOf(await bindableFieldReading(storage, accountId, details, field));
}

/**
 * Apply an entity's bindings: write every bound field that has a value, and delete the
 * names `staleBefore` bound that nothing binds any more. Returns what was written.
 */
// eslint-disable-next-line complexity
export async function applyEnvBindings(
  env: vscode.GlobalEnvironmentVariableCollection,
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  staleBefore?: EnvBindings,
): Promise<string[]> {
  for (const name of staleEnvNames(staleBefore, details.envBindings)) {
    env.delete(name);
  }
  const written: string[] = [];
  const bindings = details.envBindings ?? {};
  for (const [field, name] of Object.entries(bindings)) {
    const value = await bindableFieldValue(storage, accountId, details, field as BindableField);
    if (value !== undefined && value.length > 0) {
      env.replace(name, value);
      env.description = 'CredsForDevs: secrets exposed as terminal variables';
      written.push(name);
    }
  }
  return written;
}
