// TYPE positions only — never a `vscode.` value in this file. The compiler then elides the import
// and the module is pure at run time, which is what lets `wovenPasswordForm.test.ts` and its
// neighbours import `automaticRefusal` with no stub. The one `vscode.window` call that belongs to
// this story is `envCollectionRef.showEnvNotice`, and it is there for exactly this reason.
import * as vscode from 'vscode';
import { parseDbConnectionString } from './dbConnString';
import { BINDABLE_FIELDS, BindableField, EnvBindings, EnvValues, isValidEnvName, staleEnvNames } from './envBinding';
import { EnvApplyResult, EnvWithheld } from './envApplyNotice';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { FieldReading, readingOf, valueOf, withheld } from './fieldReading';
import { automaticPinRefusal, pinRefusalFor } from './pinGate';

/**
 * Writing bound secret fields into VS Code's environment variable collection — the
 * mechanism that injects variables into every integrated terminal opened afterwards,
 * persisted across reloads.
 *
 * <p>Values come from THIS machine's SecretStorage at the moment of writing — or, on a save, from
 * the values the save still HOLDS (issue #48), so an edit writes what was just typed. A held value
 * never outranks the policy: the STORED reading is taken first and carries every refusal, and the
 * held value stands in for it only when it is not one (the code round of 2026-09-12 found the held
 * road consulting the woven refusal alone, so a PIN-protected entry's plaintext went into the
 * collection). A binding synced from another machine is a name with no value until someone presses
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
 * Why NOTHING automatic may use this field, or `''` when it may — every refusal in ONE place.
 *
 * <p>Two policies today. The woven one is a fact about the ENTRY (`passwordWoven` is a field) and
 * needs no value; the PIN one is a fact about the VALUE — the wrap is inside it, which is the whole
 * reason the mark cannot be lost — so it can only be decided after the read. Both come back as one
 * sentence, because to an automatic caller they are the same fact: the value is there and it may
 * not have it. A third policy belongs HERE, not at a call site: the code round of 2026-09-12 found
 * the held-value road asking the woven refusal alone, so a PIN-protected entry's plaintext, carried
 * in memory by the save, went into the environment collection and every later terminal in the
 * window read it without the PIN — the one thing the form's "PIN — on" banner promises cannot
 * happen. One function to ask is how a fourth road cannot make the same omission.</p>
 */
export function automaticFieldRefusal(
  details: EntityMetadata,
  field: BindableField,
  stored: string | undefined,
): string {
  const woven = automaticRefusal(details, field);
  if (woven !== '') {
    return woven;
  }

  // The WRAP is the truth and is asked first — a mark can be absent from an entry whose values are
  // locked, which is why nothing here has ever keyed on it alone. The MARK is asked as well because
  // it catches a state the wrap cannot: an entry marked protected whose stored value is, at this
  // instant, plaintext. That state is reachable today — the EDIT path writes a newly typed secret
  // and never re-seals it (found by the automated reviewer; its own plan) — and without this an edit
  // would hand a protected entry's new password to every terminal opened afterwards. Either signal
  // refuses: that cannot under-refuse, it can only refuse something the wrap would have allowed.
  const locked = automaticPinRefusal(stored, details.name);
  if (locked !== '') {
    return locked;
  }

  // The same sentence the wrap earns, because it is the same fact about the same entry.
  return details.pinProtected === true ? pinRefusalFor(details.name) : '';
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
  const stored = await storedField(storage, accountId, details, field);
  const refusal = automaticFieldRefusal(details, field, stored);
  return refusal === '' ? readingOf(stored) : withheld(refusal);
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
 * One binding's reading: the STORED reading first — it carries every refusal — and the value the
 * save holds only when that reading is not one. A refusal is about the entry or the slot, never
 * about where a value came from, so a save cannot hand over a woven password OR a PIN-protected
 * one by carrying it in memory. (The first shape of this asked the woven refusal alone before using
 * the held value; the code round of 2026-09-12 read that as a PIN bypass, and it was.)
 */
async function boundReading(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  field: BindableField,
  values: EnvValues,
): Promise<FieldReading> {
  const stored = await bindableFieldReading(storage, accountId, details, field);
  const held = HELD[field](values);
  return stored.kind === 'withheld' || held === undefined ? stored : readingOf(held);
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
 * <p>`values` are what the save holds in memory — the form's plaintext — so an edit writes what was
 * just typed; storage is read for the rest, which is also the whole of the viewer's `ENV` path. They
 * never outrank the policy: a slot the PIN seals refuses whatever the save is holding for it, in the
 * same sentence the viewer's `ENV` button says (`boundReading`).</p>
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
  // A closure rather than a module-level function: it captures the two accumulators and the five
  // arguments a read needs, which as parameters would be nine — and the loop below stays one line,
  // which is what keeps this function inside the complexity limit the repository sets.
  const applyOne = async ([key, name]: [string, string]): Promise<void> => {
    const plan = planBinding(key, name);
    if (plan.field === undefined) {
      withheldNames.push({ name, reason: plan.reason });
      return;
    }
    const reading = await boundReading(storage, accountId, details, plan.field, values);
    noteReading(env, name, reading, written, withheldNames);
  };
  for (const pair of boundPairs(details)) {
    await applyOne(pair);
  }
  return { written, withheld: withheldNames };
}

/**
 * What to do with ONE stored binding: read this field, or withhold with this sentence.
 *
 * <p>Neither refusal is reachable from this build's own form, and both are reachable from a VAULT.
 * `envBindings` is metadata, so it syncs: a newer build's field name lands here as a key this one
 * has no table entry for, and calling that entry threw in the middle of a save. A name that is not
 * a shell identifier arrives the same way, or from a hand-edited file, and writing it would set a
 * variable no shell can read. Both are SAID rather than skipped — a binding that is on screen and
 * does nothing, silently, is the shape of the defect this whole module was fixed for.</p>
 */
function planBinding(key: string, name: string): { field?: BindableField; reason: string } {
  if (!BINDABLE_FIELDS.includes(key as BindableField)) {
    return { reason: `"${name}" is bound to "${key}", which this build does not know — it may come from a newer version. Nothing was written.` };
  }
  return isValidEnvName(name)
    ? { field: key as BindableField, reason: '' }
    : { reason: `"${name}" is not a name a shell can read: a variable name starts with a letter or underscore, then letters, digits or underscores. Nothing was written.` };
}

/** Every `key → variable name` pair the entity binds, as STORED — a key this build does not know included. */
function boundPairs(details: EntityMetadata): [string, string][] {
  return Object.entries(details.envBindings ?? {});
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
    return;
  }

  // Anything that is not a value takes the variable WITH it. `staleEnvNames` above covers the name
  // that stopped being BOUND; this is the other half, and it is the one with a secret in it — the
  // name is still bound and the value behind it has become unreadable, because the entry was given
  // a PIN, its password was woven, or the secret was cleared. The collection persists across
  // reloads, so leaving the last value there would hand every terminal opened afterwards a secret
  // the policy has just refused to hand anybody, while the notice said "withheld" about a variable
  // that is still set. Found by the automated reviewer on the pull request.
  env.delete(name);
  if (reading.kind === 'withheld') {
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

