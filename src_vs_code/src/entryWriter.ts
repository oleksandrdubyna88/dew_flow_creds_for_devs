import { NOTHING_OPENED, type EditPrefill } from './editPrefill';
import { EntityFields, parseFields, serializeFields } from './entityFields';
import { lockedSlotCount, sealValue } from './entityPin';
import { PaymentFields, parsePaymentFields, serializePaymentFields } from './paymentFields';
import type { SettledPin } from './pinOnCreate';
import { WritableSealing, isMarked, sealingForNew, unattendedSealing } from './sealingAtWrite';
import { SecondValues, parseSecondValues, serializeSecondValues } from './secondValues';
import type { StorageManager } from './storageManager';

/**
 * The one road from text to a stored value (`PLAN_typed_stored_secrets.md` §2.4, T4).
 *
 * <p>Every writer into the keychain — Edit, the person's Add, an agent's create, a share's accept and
 * its update, an import, the rotation's store — comes from `writerFor`, and `writerFor` only from a
 * `Sealing`, which only `sealingAtWrite.ts` can make. It answers two writers, both bound to ONE entry:</p>
 *
 * <ul>
 *   <li><b>the plain writer</b>, for a `plain` proof: the value as it came. For an entry that EXISTED when
 *       the proof was made, EVERY write runs under the storage's cross-window lease — the same one that
 *       serialises sync, Protect's seals and every node write — together with its own re-check that
 *       nothing protected the entry since the decision; a sealed slot or a mark the decision did not see
 *       refuses that write ({@link ProtectedMeanwhile}) before it is stored. CodeRabbit on PR #175
 *       (CWE-362) named the window: a decision read, a write later, another window protecting the entry
 *       in between — and the E2 code round found it open between ANY two writes, not only before the
 *       first. Nothing is cached: one write failing for a passing reason never fails the next. No lease
 *       is held across a PIN box — a plain proof asks nothing. A brand-new entry (`fresh`) re-checks
 *       nothing: its id is one nobody else can know.</li>
 *   <li><b>the sealing writer</b>, for a `sealed` proof: every value sealed in memory under the PIN before
 *       its own raw setter runs (rule R3) — so a process killed between two slot writes leaves each slot
 *       sealed or unwritten, never plaintext — a value equal to what the form OPENED is skipped (R4:
 *       byte-identical stays byte-identical), `setPassword('')` still keeps, and the attachment and the
 *       image, outside the PIN, go straight through. It was two copies until T4: `editPrefill.sealedWriter`
 *       and `shareUpdateSeal.sealingWriter`.</li>
 * </ul>
 *
 * <p>The storage still satisfies {@link EntryWriter} structurally until the setters take `StoredSecret`
 * (E3, T5); until then `storedSecretFunnel.test.ts` refuses the storage handed out as a writer anywhere
 * but here and in the slot table.</p>
 */

/** The plaintext setters a write goes through — what `applyAdditions`, a share, an import and a rotation call. */
export interface EntryWriter {
  setPassword(accountId: string, entityId: string, password: string | undefined): Promise<void>;
  setPrivateKey(accountId: string, entityId: string, content: string): Promise<void>;
  setVpnConfig(accountId: string, entityId: string, content: string): Promise<void>;
  setDbConnection(accountId: string, entityId: string, value: string): Promise<void>;
  setTotp(accountId: string, entityId: string, uri: string): Promise<void>;
  setNotes(accountId: string, entityId: string, value: string | undefined): Promise<void>;
  setConfigBody(accountId: string, entityId: string, value: string | undefined): Promise<void>;
  setFields(accountId: string, entityId: string, fields: EntityFields | undefined): Promise<void>;
  setPayment(accountId: string, entityId: string, fields: PaymentFields | undefined): Promise<void>;
  setSecond(accountId: string, entityId: string, values: SecondValues | undefined): Promise<void>;
  setFieldsRaw(accountId: string, entityId: string, value: string | undefined): Promise<void>;
  setPaymentRaw(accountId: string, entityId: string, value: string | undefined): Promise<void>;
  setSecondRaw(accountId: string, entityId: string, value: string | undefined): Promise<void>;
  setAttachment(accountId: string, entityId: string, base64: string | undefined): Promise<void>;
  setImage(accountId: string, entityId: string, base64: string | undefined): Promise<void>;
}

/**
 * The writer for one entry, from the proof its write was decided with. `opened` is what a form was
 * opened over — `NOTHING_OPENED` when there was no form (a create, a share, an import, a rotation).
 */
export function writerFor(storage: StorageManager, accountId: string, entityId: string, sealing: WritableSealing, opened: EditPrefill): EntryWriter {
  if (sealing.kind === 'sealed') {
    return sealingWriter(storage, accountId, entityId, sealing.pin, opened);
  }
  return plainWriter(storage, accountId, entityId, sealing.fresh ? straight : recheckedEach(storage, accountId, entityId, sealing.marked));
}

/**
 * A BRAND-NEW entry's writer: `sealingForNew`'s proof over `NOTHING_OPENED` — the plain writer when the
 * folder asks for no PIN, the sealing writer under the folder's PIN when it does. The person's Add and an
 * agent's create take it with the settled PIN; an accepted share and an import, which write new ids and
 * ask no folder PIN (§2.7), take it with `NO_PIN` — their plain proof visible rather than silent.
 */
export function writerForNew(storage: StorageManager, accountId: string, entityId: string, settled: SettledPin = NO_PIN): EntryWriter {
  return writerFor(storage, accountId, entityId, sealingForNew(settled), NOTHING_OPENED);
}

const NO_PIN: SettledPin = { kind: 'none' };

/**
 * An unattended write (the rotation's store): the proof `sealingAtWrite.unattendedSealing` gives —
 * refused with the PIN sentence on an entry that is protected, by a sealed slot or by the mark — and the
 * plain writer it permits, every write re-checked under the lease.
 */
export async function writeUnattended(
  storage: StorageManager,
  accountId: string,
  owner: { readonly id: string; readonly name: string },
  write: (writer: EntryWriter) => Promise<void>,
): Promise<void> {
  const sealing = await unattendedSealing(storage, accountId, owner);
  if (sealing.kind === 'stopped') {
    throw new Error(`${sealing.reason} Nothing was stored.`);
  }
  await write(writerFor(storage, accountId, owner.id, sealing, NOTHING_OPENED));
}

/**
 * Thrown by a plain writer's first write when the entry was protected — another window, a sync —
 * between the decision and that write. Nothing of the write was stored; the message is what the
 * caller's failure path says (Edit's "Saving … stopped part-way", the share's "saving it failed").
 */
export class ProtectedMeanwhile extends Error {
  constructor(name: string) {
    super(
      `"${name}" was protected with a PIN — in another window or by a sync — after this write was decided and before it began. `
      + 'Nothing was written in the clear; do it again from the entry, which will ask for its PIN.',
    );
    this.name = 'ProtectedMeanwhile';
  }
}

/** How a plain writer's writes run: straight, or each one re-checked under the lease. */
type Through = (write: () => Promise<void>) => Promise<void>;

const straight: Through = (write) => write();

/**
 * Every write under the storage's cross-window lease (`LeasedQueue` — `StorageManager.writes`), each
 * after its OWN re-check: an entry protected between the second and the third write refuses the third,
 * as one protected before the first refuses the first. Nothing is remembered between writes, so a write
 * that failed — a refusal or a keychain hiccup — is that write's alone. The lease is held for one
 * re-check and one slot write, never across anything that asks.
 */
function recheckedEach(storage: StorageManager, accountId: string, entityId: string, markedAtDecision: boolean): Through {
  return (write) =>
    storage.writes.run(async () => {
      await refuseIfProtectedSince(storage, accountId, entityId, markedAtDecision);
      await write();
    });
}

/** A sealed slot now, or a mark the decision did not see — the entry was protected since. */
async function refuseIfProtectedSince(storage: StorageManager, accountId: string, entityId: string, markedAtDecision: boolean): Promise<void> {
  if (await protectedSince(storage, accountId, entityId, markedAtDecision)) {
    throw new ProtectedMeanwhile(storage.getNode(accountId, entityId)?.name ?? entityId);
  }
}

async function protectedSince(storage: StorageManager, accountId: string, entityId: string, markedAtDecision: boolean): Promise<boolean> {
  const markedSince = !markedAtDecision && isMarked(storage, accountId, entityId);
  return markedSince || (await lockedSlotCount(storage, accountId, entityId)).locked > 0;
}

/**
 * The value as it came, through the storage's own setter — bound to one entry: the ids each call is
 * handed are ignored on purpose, as the sealing writer's are. (T5 mints the stored form here.)
 */
function plainWriter(storage: StorageManager, a: string, e: string, through: Through): EntryWriter {
  return {
    setPassword: (_a, _e, v) => through(() => storage.setPassword(a, e, v)),
    setPrivateKey: (_a, _e, v) => through(() => storage.setPrivateKey(a, e, v)),
    setVpnConfig: (_a, _e, v) => through(() => storage.setVpnConfig(a, e, v)),
    setDbConnection: (_a, _e, v) => through(() => storage.setDbConnection(a, e, v)),
    setTotp: (_a, _e, v) => through(() => storage.setTotp(a, e, v)),
    setNotes: (_a, _e, v) => through(() => storage.setNotes(a, e, v)),
    setConfigBody: (_a, _e, v) => through(() => storage.setConfigBody(a, e, v)),
    setFields: (_a, _e, v) => through(() => storage.setFields(a, e, v)),
    setPayment: (_a, _e, v) => through(() => storage.setPayment(a, e, v)),
    setSecond: (_a, _e, v) => through(() => storage.setSecond(a, e, v)),
    setFieldsRaw: (_a, _e, v) => through(() => storage.setFieldsRaw(a, e, v)),
    setPaymentRaw: (_a, _e, v) => through(() => storage.setPaymentRaw(a, e, v)),
    setSecondRaw: (_a, _e, v) => through(() => storage.setSecondRaw(a, e, v)),
    setAttachment: (_a, _e, v) => through(() => storage.setAttachment(a, e, v)),
    setImage: (_a, _e, v) => through(() => storage.setImage(a, e, v)),
  };
}

type Seal = (value: string) => Promise<string>;

/**
 * Every changed value sealed under `pin` before its raw setter runs. The rules per slot:
 *
 * <ul>
 *   <li>the typed records (login/URL, payment, second values) are serialised with the module that owns
 *       them, compared canonically with the opened record, and sealed when they differ; `undefined` stays
 *       a delete (Rule A of `applyFormSecrets` is unchanged);</li>
 *   <li>`setPassword('')` still means keep; a typed password, key or VPN config is always new, because the
 *       form never prefills those, so it is always sealed;</li>
 *   <li>the RAW record setters a share writes (`setFieldsRaw`, `setPaymentRaw`, `setSecondRaw`) seal what
 *       arrives and pass `undefined` through as the delete it always was — nothing opened them;</li>
 *   <li>the attachment and the image pass straight through — the two slots outside the PIN.</li>
 * </ul>
 */
function sealingWriter(storage: StorageManager, a: string, e: string, pin: string, opened: EditPrefill): EntryWriter {
  const seal: Seal = (value) => sealValue(value, a, pin);
  const maybe = async (value: string | undefined): Promise<string | undefined> => (value === undefined ? undefined : seal(value));
  return {
    setPassword: async (_a, _e, v) => storage.setPassword(a, e, v === undefined || v.length === 0 ? v : await seal(v)),
    setPrivateKey: async (_a, _e, v) => storage.setPrivateKey(a, e, await seal(v)),
    setVpnConfig: async (_a, _e, v) => storage.setVpnConfig(a, e, await seal(v)),
    setTotp: (_a, _e, v) => sealIfChanged(opened.totp, v, seal, (sealed) => storage.setTotp(a, e, sealed)),
    setDbConnection: (_a, _e, v) => sealIfChanged(opened.dbConnection, v, seal, (sealed) => storage.setDbConnection(a, e, sealed)),
    setNotes: (_a, _e, v) => sealOrDelete(opened.notes, v, seal, (sealed) => storage.setNotes(a, e, sealed)),
    setConfigBody: (_a, _e, v) => sealOrDelete(opened.configBody, v, seal, (sealed) => storage.setConfigBody(a, e, sealed)),
    setFields: (_a, _e, v) =>
      sealOrDelete(canonicalFields(opened.fieldsRaw), serializeFields(v), seal, (sealed) => storage.setFieldsRaw(a, e, sealed)),
    setPayment: (_a, _e, v) =>
      sealOrDelete(canonicalPayment(opened.paymentRaw), serializePaymentFields(v), seal, (sealed) => storage.setPaymentRaw(a, e, sealed)),
    setSecond: (_a, _e, v) =>
      sealOrDelete(canonicalSecond(opened.secondRaw), serializeSecondValues(v), seal, (sealed) => storage.setSecondRaw(a, e, sealed)),
    setFieldsRaw: async (_a, _e, v) => storage.setFieldsRaw(a, e, await maybe(v)),
    setPaymentRaw: async (_a, _e, v) => storage.setPaymentRaw(a, e, await maybe(v)),
    setSecondRaw: async (_a, _e, v) => storage.setSecondRaw(a, e, await maybe(v)),
    setAttachment: (_a, _e, v) => storage.setAttachment(a, e, v),
    setImage: (_a, _e, v) => storage.setImage(a, e, v),
  };
}

/**
 * One value: equal to what the form was opened over is SKIPPED — byte-identical stays
 * byte-identical (R4) — and anything else is sealed in memory first, then written (R3).
 */
async function sealIfChanged(was: string | undefined, now: string, seal: Seal, write: (sealed: string) => Promise<void>): Promise<void> {
  if (now !== was) {
    await write(await seal(now));
  }
}

/**
 * The same, for a setter where nothing DELETES (`setNotes`, the typed records): an absent value is
 * handed through as the delete it always was, unless there was nothing to delete.
 */
async function sealOrDelete(
  was: string | undefined,
  now: string | undefined,
  seal: Seal,
  write: (sealed: string | undefined) => Promise<void>,
): Promise<void> {
  if (now !== undefined) {
    await sealIfChanged(was, now, seal, write);
  } else if (was !== undefined) {
    await write(undefined);
  }
}

/**
 * Canonical forms — the opened record re-serialised by the module that owns it, so a record stored
 * by an older build in another key order compares equal to the same record out of the form, and is
 * not re-sealed for nothing. The NEW side is already canonical: it comes out of the same serialiser.
 */
function canonicalFields(raw: string | undefined): string | undefined {
  return raw === undefined ? undefined : serializeFields(parseFields(raw));
}

function canonicalPayment(raw: string | undefined): string | undefined {
  return raw === undefined ? undefined : serializePaymentFields(parsePaymentFields(raw));
}

function canonicalSecond(raw: string | undefined): string | undefined {
  return raw === undefined ? undefined : serializeSecondValues(parseSecondValues(raw));
}
