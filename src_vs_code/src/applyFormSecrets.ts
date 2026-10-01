import type { StorageManager } from './storageManager';
import type { EntityFormValues } from './entityFormPanel';
import { serializeFields } from './entityFields';
import type { EntryWriter } from './entryWriter';
import { serializePaymentFields } from './paymentFields';
import { serializeSecondValues } from './secondValues';

/*
 * A save's ADDITIONS go through an `EntryWriter` — `entryWriter.writerFor`'s answer to the save's
 * `Sealing`: the plain writer for an ordinary entry, the sealing writer for a protected one, which seals
 * every changed value under the entry's PIN before the raw setter runs (entry-PIN plan, rule R3). It was
 * `SecretWriter`, a `Pick` the storage itself satisfied, until the typed-secrets plan's T4.
 */

/**
 * Every secret the form can set, cleared or written from its values — one place for the create path
 * and the edit path, so a secret kind added to the form reaches storage from both.
 *
 * <h3>Two passes, on opposite sides of the node write</h3>
 *
 * <p>This was one function, and the plan gate found why it cannot be. The invariant the storage layer
 * protects is that **an orphaned secret is the only torn state allowed to exist** — bytes no node
 * references are invisible and harmless, while a node claiming a record that is not there is visible,
 * broken, and it SYNCS. That gives opposite orders for the two halves of a save:</p>
 *
 * <ul>
 *   <li><b>Adding</b> a secret: write the SECRET first, then the node. A crash between them leaves an
 *       orphan.</li>
 *   <li><b>Removing</b> one: write the NODE first, then delete the secret. A crash between them leaves
 *       an orphan too — reversed, it leaves a node still claiming a value that is already gone.</li>
 * </ul>
 *
 * <p>One save does both: the form's `clearX` checkboxes are removals and its filled fields are
 * additions, so a single ordered call cannot be right for both. Hence `applyAdditions` and
 * `applyRemovals`, and callers put the node write between them.</p>
 *
 * <p><b>The delete-when-undefined setters are split BY VALUE, not by name.</b> `setNotes`, `setFields`
 * and `setConfigBody` each delete when handed nothing, so which pass they belong to depends on the
 * value: a defined value is an ADDITION and goes before the node; `undefined` is a REMOVAL and goes
 * after it. I had put them all in additions, arguing the node written afterwards would agree with
 * them — the review pointed out that the crash happens BEFORE that write, so the node still live at
 * that moment is the OLD one, and it is left claiming a note the keychain no longer has. Exactly the
 * failure Rule A exists to prevent, introduced by the fix for it.</p>
 */

/** Clear, or set when a value came, or leave alone — the shape every optional secret shares. */
async function applyOptional(
  clear: boolean | undefined,
  value: string | undefined,
  remove: () => Promise<void>,
  set: (value: string) => Promise<void>,
): Promise<void> {
  if (clear) {
    await remove();
  } else if (value !== undefined) {
    await set(value);
  }
}

/**
 * Everything a save WRITES — before the node, so the node never claims what is not there yet.
 *
 * <p>`writer` is an `EntryWriter` (`entryWriter.writerFor`): for a protected entry it is the sealing
 * writer, so nothing here changes whether a value is sealed — the writer decides, once, per slot.</p>
 */
export async function applyAdditions(
  writer: EntryWriter,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (!result.clearPassword) {
    await writer.setPassword(accountId, entityId, result.newPassword);
  }
  await applyOptional(false, result.newPrivateKey, noop, (v) => writer.setPrivateKey(accountId, entityId, v));
  await applyOptional(false, result.newVpnConfig, noop, (v) => writer.setVpnConfig(accountId, entityId, v));
  await applyOptional(false, result.newDbConnection, noop, (v) => writer.setDbConnection(accountId, entityId, v));
  // Only when there is a value. `undefined` DELETES on these three, which is a removal and belongs
  // after the node write — see `applyRemovals`.
  await applyWhenDefined(result.newNotes, (v) => writer.setNotes(accountId, entityId, v));
  await applyWhenDefined(result.newFields, (v) => writer.setFields(accountId, entityId, v));
  // `applyWhenDefined` is not enough for a RECORD. `setPayment` deletes when the record serialises to
  // nothing — and an emptied-but-defined `{}` does exactly that, so passing it here would run a real
  // deletion in the ADDITIONS pass, before the node write. That is the torn state Rule A exists to
  // prevent, and a code review found it: every naive edit-save of a payment produces `{}`.
  await applyWhenDefined(nonEmptyRecord(result.newPayment), (v) => writer.setPayment(accountId, entityId, v));
  await applyWhenDefined(result.newConfigBody, (v) => writer.setConfigBody(accountId, entityId, v));
  // A record, so the same rule the payment record needed: an emptied-but-defined `{}` serialises to
  // nothing and DELETES, which is a removal and must not run before the node write.
  await applyWhenDefined(nonEmptyRecord(result.newSecond), (v) => writer.setSecond(accountId, entityId, v));
  await applyOptional(false, result.newAttachment, noop, (v) => writer.setAttachment(accountId, entityId, v));
  await applyOptional(false, result.newImage, noop, (v) => writer.setImage(accountId, entityId, v));
  // The form already canonicalised the seed (`toValues`), so this is a store, not a parse.
  await applyOptional(false, result.newTotp, noop, (v) => writer.setTotp(accountId, entityId, v));
}

/** Everything a save DELETES — after the node, so no node outlives a value it still claims. */
export async function applyRemovals(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (result.clearPassword) {
    await storage.deletePassword(accountId, entityId);
  }
  await applyOptional(result.clearPrivateKey, undefined, () => storage.deletePrivateKey(accountId, entityId), noopSet);
  await applyOptional(result.clearVpnConfig, undefined, () => storage.deleteVpnConfig(accountId, entityId), noopSet);
  await applyOptional(result.clearDbConnection, undefined, () => storage.deleteDbConnection(accountId, entityId), noopSet);
  await applyOptional(result.clearAttachment, undefined, () => storage.setAttachment(accountId, entityId, undefined), noopSet);
  await applyOptional(result.clearImage, undefined, () => storage.setImage(accountId, entityId, undefined), noopSet);
  await applyOptional(result.clearTotp, undefined, () => storage.deleteTotp(accountId, entityId), noopSet);
  // The delete-when-undefined setters, on the side of the node write where a removal belongs. An
  // entity turned from a config into something else must not keep a config body nothing can reach or
  // edit — and by here the node no longer claims one, so the deletion cannot be observed as a lie.
  await applyWhenAbsent(result.newNotes, () => storage.setNotes(accountId, entityId, undefined));
  await applyWhenAbsent(result.newFields, () => storage.setFields(accountId, entityId, undefined));
  // …and the removals pass takes both cases: no record at all, and a record emptied to nothing.
  await applyWhenAbsent(nonEmptyRecord(result.newPayment), () => storage.setPayment(accountId, entityId, undefined));
  await applyWhenAbsent(result.newConfigBody, () => storage.setConfigBody(accountId, entityId, undefined));
  await applyWhenAbsent(nonEmptyRecord(result.newSecond), () => storage.setSecond(accountId, entityId, undefined));
}

/** A setter that also deletes, called only for its ADDING behaviour. */
function applyWhenDefined<T>(value: T | undefined, set: (value: T) => Promise<void>): Promise<void> {
  return value === undefined ? Promise.resolve() : set(value);
}

/** The same setter, called only for its REMOVING behaviour. */
function applyWhenAbsent<T>(value: T | undefined, remove: () => Promise<void>): Promise<void> {
  return value === undefined ? remove() : Promise.resolve();
}

function noop(): Promise<void> {
  return Promise.resolve();
}

function noopSet(_value: string): Promise<void> {
  return Promise.resolve();
}

/**
 * Whether this save's ADDITIONS store a secret — a value in any slot the entry PIN covers.
 *
 * <p>Asked by the one save that needs to know before it writes: an entry protected while it held
 * nothing asks for its first PIN only when a value is about to go into it (review of 2026-09-30). The
 * additions pass itself answers, run against a writer that stores nothing and records the string each
 * setter WOULD store — serialised exactly as the storage serialises it, and empty meaning nothing, as
 * `putSecret` treats it — so this cannot come to disagree with `applyAdditions` about a field. The
 * attachment and the image are outside the PIN and are not counted.</p>
 */
export async function addsSecret(result: EntityFormValues): Promise<boolean> {
  const stored: (string | undefined)[] = [];
  await applyAdditions(recordingWriter(stored), '', '', result);
  return stored.some((value) => value !== undefined && value.length > 0);
}

function recordingWriter(stored: (string | undefined)[]): EntryWriter {
  const record = (value: string | undefined): Promise<void> => {
    stored.push(value);
    return Promise.resolve();
  };
  return {
    setPassword: (_a, _e, v) => record(v),
    setPrivateKey: (_a, _e, v) => record(v),
    setVpnConfig: (_a, _e, v) => record(v),
    setDbConnection: (_a, _e, v) => record(v),
    setNotes: (_a, _e, v) => record(v),
    setConfigBody: (_a, _e, v) => record(v),
    setTotp: (_a, _e, v) => record(v),
    setFields: (_a, _e, v) => record(serializeFields(v)),
    setPayment: (_a, _e, v) => record(serializePaymentFields(v)),
    setSecond: (_a, _e, v) => record(serializeSecondValues(v)),
    // Never called by the additions pass — the raw record setters are a share's and an import's.
    setFieldsRaw: (_a, _e, v) => record(v),
    setPaymentRaw: (_a, _e, v) => record(v),
    setSecondRaw: (_a, _e, v) => record(v),
    setAttachment: () => Promise.resolve(),
    setImage: () => Promise.resolve(),
  };
}

/**
 * A record with something in it, or nothing at all — the distinction the two passes turn on.
 *
 * <p>`{}` and `undefined` mean the same thing to `setPayment` (both delete), so they have to mean the
 * same thing to the additions/removals split as well. Otherwise an emptied form deletes on the wrong
 * side of the node write.</p>
 */
function nonEmptyRecord<T extends object>(record: T | undefined): T | undefined {
  return record !== undefined && Object.keys(record).length > 0 ? record : undefined;
}
