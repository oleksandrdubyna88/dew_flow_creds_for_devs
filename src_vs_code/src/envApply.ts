// TYPE positions only — never a `vscode.` value in this file. The compiler then elides the import
// and the module is pure at run time, which is what lets `wovenPasswordForm.test.ts` and its
// neighbours import `automaticRefusal` with no stub. The one `vscode.window` call that belongs to
// this story is `envCollectionRef.showEnvNotice`, and it is there for exactly this reason.
import * as vscode from 'vscode';
import { parseDbConnectionString } from './dbConnString';
import { BindableField, EnvBindings, EnvValues, staleEnvNames } from './envBinding';
import { EnvApplyResult, EnvWithheld } from './envApplyNotice';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { FieldReading, readingOf, valueOf, withheld } from './fieldReading';
import { automaticPinRefusal } from './pinGate';

/**
 * Writing bound secret fields into VS Code's environment variable collection — the
 * mechanism that injects variables into every integrated terminal opened afterwards,
 * persisted across reloads.
 *
 * <p>Values come from THIS machine's SecretStorage at the moment of writing — or, on a save, from
 * the values the save still HOLDS (issue #48): the form's plaintext is handed in first, so a create
 * applies its bindings before the entry is sealed under its PIN and an edit writes what was just
 * typed. A binding synced from another machine is a name with no value until someone presses
 * `Set env` here or saves the entity — which is also the recovery path the operator asked for
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
  return refusal === '' ? afterReading(await storedField(storage, accountId, details, field), details) : withheld(refusal);
}

/**
 * The second refusal, and it can only be decided AFTER the read.
 *
 * <p>A woven password is known from the entry (`passwordWoven` is a field). A PIN-protected value
 * is known only from the VALUE — the wrap is inside it, which is the whole reason the mark cannot
 * be lost — so this is where it is seen. Both come back as `withheld`, because to an automatic
 * caller they are the same fact: the value is there and it may not have it.</p>
 */
function afterReading(stored: string | undefined, details: EntityMetadata): FieldReading {
  const locked = automaticPinRefusal(stored, details.name);
  return locked === '' ? readingOf(stored) : withheld(locked);
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

/** The value alone, for the callers that genuinely cannot act on the difference between the three answers. */
export async function bindableFieldValue(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
): Promise<string | undefined> {
  return valueOf(await bindableFieldReading(storage, accountId, details, field));
}

/**
 * Where a HELD value stands in for a stored one, per field. `dbPassword` is parsed out of a held
 * connection string exactly as it is out of a stored one; the public key is metadata and is never
 * held separately.
 */
const HELD: Readonly<Record<BindableField, (values: EnvValues) => string | undefined>> = {
  password: (values) => values.password,
  privateKey: (values) => values.privateKey,
  publicKey: () => undefined,
  dbConnection: (values) => values.dbConnection,
  dbPassword: (values) =>
    values.dbConnection === undefined ? undefined : parseDbConnectionString(values.dbConnection).password,
};

/**
 * One binding's reading: the held value when the save has one and the policy allows the field at
 * all, storage otherwise. The woven refusal is about the ENTRY, not about where a value came from,
 * so it is decided before the held value is looked at — a save cannot hand over a woven password by
 * carrying it in memory.
 */
async function boundReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
  values: EnvValues,
): Promise<FieldReading> {
  const held = HELD[field](values);
  if (held === undefined || automaticRefusal(details, field) !== '') {
    return bindableFieldReading(storage, accountId, details, field);
  }
  return readingOf(held);
}

/**
 * Apply an entity's bindings: write every bound field that has a value, delete the names
 * `staleBefore` bound that nothing binds any more, and answer with what happened — the names
 * written and, for every name the policy WITHHELD, the reason (issue #48).
 *
 * <p>The loop used to read through `valueOf`, which collapses a `withheld` reading into `undefined`,
 * and skipped it in silence: an entry created with a PIN and a binding wrote nothing and said
 * nothing. Now the reading is kept whole and a withheld name is returned for the caller to say.</p>
 *
 * <p>`values` are what the save holds in memory — the form's plaintext — and are read FIRST, so a
 * create can apply its bindings before sealing the entry under its PIN and an edit writes what was
 * just typed; storage is read for the rest, which is also the whole of the viewer's `ENV` path.</p>
 */
export async function applyEnvBindings(
  env: vscode.GlobalEnvironmentVariableCollection,
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  staleBefore?: EnvBindings,
  values: EnvValues = {},
): Promise<EnvApplyResult> {
  for (const name of staleEnvNames(staleBefore, details.envBindings)) {
    env.delete(name);
  }
  const written: string[] = [];
  const withheldNames: EnvWithheld[] = [];
  for (const [field, name] of boundPairs(details)) {
    const reading = await boundReading(storage, accountId, details, field, values);
    noteReading(env, name, reading, written, withheldNames);
  }
  return { written, withheld: withheldNames };
}

/** Every `field → variable name` pair the entity binds; none when it binds nothing. */
function boundPairs(details: EntityMetadata): [BindableField, string][] {
  return Object.entries(details.envBindings ?? {}) as [BindableField, string][];
}

/** Write a value, or record why it was not — `absent` is nothing to write and nothing to say. */
function noteReading(
  env: vscode.GlobalEnvironmentVariableCollection,
  name: string,
  reading: FieldReading,
  written: string[],
  withheldNames: EnvWithheld[],
): void {
  if (reading.kind === 'value') {
    exposeEnv(env, name, reading.value);
    written.push(name);
  } else if (reading.kind === 'withheld') {
    withheldNames.push({ name, reason: reading.reason });
  }
}

/**
 * One variable into the collection, with the description that says who put it there — the one road
 * in for the save paths and the viewer's `ENV` button, which used to spell the pair by hand.
 */
export function exposeEnv(env: vscode.GlobalEnvironmentVariableCollection, name: string, value: string): void {
  env.replace(name, value);
  env.description = 'CredsForDevs: secrets exposed as terminal variables';
}

