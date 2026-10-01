import { NOTHING_OPENED, type EditPrefill } from './editPrefill';
import { EntityFields, parseFields, serializeFields } from './entityFields';
import { lockedSlotCount } from './entityPin';
import { sealText } from './sealValue';
import { PaymentFields, parsePaymentFields, serializePaymentFields } from './paymentFields';
import type { SettledPin } from './pinOnCreate';
import { WritableSealing, isMarked, sealingForNew, unattendedSealing } from './sealingAtWrite';
import { SecondValues, parseSecondValues, serializeSecondValues } from './secondValues';
import type { StorageManager } from './storageManager';
import { StoredSecret, stored } from './storedSecret';

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
 *       is held across a PIN box — a plain proof asks nothing. A brand-new entry (`fresh`) is taken at
 *       its word only once its first write has seen, under the lease, that no node has its id
 *       ({@link freshVerified}); after that it re-checks nothing — an id no node carries is one nobody
 *       else can protect.</li>
 *   <li><b>the sealing writer</b>, for a `sealed` proof: every value sealed in memory under the PIN before
 *       its own raw setter runs (rule R3) — so a process killed between two slot writes leaves each slot
 *       sealed or unwritten, never plaintext — a value equal to what the form OPENED is skipped (R4:
 *       byte-identical stays byte-identical), `setPassword('')` still keeps, and the attachment and the
 *       image, outside the PIN, go straight through. It was two copies until T4: `editPrefill.sealedWriter`
 *       and `shareUpdateSeal.sealingWriter`.</li>
 * </ul>
 *
 * <p>The storage satisfies no {@link EntryWriter}: its raw setters take `StoredSecret` (T5), so a writer
 * that is not from here does not compile (`fixtures/typed/storage_is_not_a_writer.ts`). Both writers mint
 * the stored form at this one road — the plain writer `stored(v)`, the sealing writer what it sealed.</p>
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
  return plainWriter(storage, accountId, entityId, sealing.fresh ? freshVerified(storage, accountId, entityId) : recheckedEach(storage, accountId, entityId, sealing.marked));
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
    throw new UnattendedRefusal(`${sealing.reason} Nothing was stored.`);
  }
  await write(writerFor(storage, accountId, owner.id, sealing, NOTHING_OPENED)).catch((error: unknown) => {
    throw error instanceof ProtectedMeanwhile ? new UnattendedRefusal(error.unattended) : error;
  });
}

/**
 * An unattended write refused because the entry is protected — before it began (`unattendedSealing`'s
 * PIN sentence) or while it ran (the plain writer's re-check). Its own class so the one caller, the
 * rotation's store, can hand a value the far side already accepted to the PERSON rather than drop it
 * (`rotationStore.ts`); its sentence never tells an automatic caller to do anything "from the entry".
 */
export class UnattendedRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnattendedRefusal';
  }
}

/**
 * Thrown by a plain writer's write when the entry was protected — another window, a sync — between the
 * decision and that write. Nothing of that write was stored; the message is what an interactive
 * caller's failure path says (Edit's "Saving … stopped part-way", the share's "saving it failed",
 * Restore's "stopped part-way"). `unattended` is the same fact for a caller nobody is watching — it
 * names no next step for a person to take "from the entry" (the E2 code round, finding 14).
 */
export class ProtectedMeanwhile extends Error {
  readonly unattended: string;

  constructor(name: string) {
    const fact = `"${name}" was protected with a PIN — in another window or by a sync — after this write was decided and before it began.`;
    super(`${fact} Nothing was written in the clear; do it again from the entry, which will ask for its PIN.`);
    this.unattended = `${fact} Nothing was stored, in the clear or otherwise: nothing automatic writes into a protected entry.`;
    this.name = 'ProtectedMeanwhile';
  }
}

/** How a plain writer's writes run — each one under the lease, re-checked or verified new. */
type Through = (write: () => Promise<void>) => Promise<void>;

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

/**
 * A NEW id's writes — the caller's word that the id is new, VERIFIED at EVERY write (the E2 code
 * rounds: the first round's findings 0 and 6, the second's 0-4): under the lease, the tree must be
 * readable and hold no node with that id. Nothing is remembered between writes — a node that appears
 * after the first write (a retry, a word that was wrong) sends the next write down the re-checked road,
 * and a tree that cannot be read (`metadataFault` makes every node read as missing) is "unknown", never
 * "absent". The check is an in-memory tree read: an import or a bundle restore still reads no keychain
 * slot for a new id, and `runCreate` already holds the lease, so its writes join it inline.
 *
 * <p>Sufficient: an entry is protected only through its node — the mark lives on it, and *Protect with a
 * PIN…* runs from it — and every `writerForNew` caller writes the node AFTER the secrets (Rule A). When a
 * node DOES carry the id, or the tree is unknowable, the write is re-checked as any existing entry's is:
 * a sealed slot or the mark refuses it.</p>
 */
function freshVerified(storage: StorageManager, accountId: string, entityId: string): Through {
  const rechecked = recheckedEach(storage, accountId, entityId, false);
  return (write) => storage.writes.run(() => (stillNew(storage, accountId, entityId) ? write() : rechecked(write)));
}

/** No node with this id, in a tree that could be read — the only answer that skips the re-check. */
function stillNew(storage: StorageManager, accountId: string, entityId: string): boolean {
  return storage.metadataFault === undefined && storage.getNode(accountId, entityId) === undefined;
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
 * handed are ignored on purpose, as the sealing writer's are. The stored form is minted here (`stored(v)`).
 */
function plainWriter(storage: StorageManager, a: string, e: string, through: Through): EntryWriter {
  return {
    setPassword: (_a, _e, v) => through(() => storage.setPassword(a, e, stored(v))),
    setPrivateKey: (_a, _e, v) => through(() => storage.setPrivateKey(a, e, stored(v))),
    setVpnConfig: (_a, _e, v) => through(() => storage.setVpnConfig(a, e, stored(v))),
    setDbConnection: (_a, _e, v) => through(() => storage.setDbConnection(a, e, stored(v))),
    setTotp: (_a, _e, v) => through(() => storage.setTotp(a, e, stored(v))),
    setNotes: (_a, _e, v) => through(() => storage.setNotes(a, e, stored(v))),
    setConfigBody: (_a, _e, v) => through(() => storage.setConfigBody(a, e, stored(v))),
    setFields: (_a, _e, v) => through(() => storage.setFields(a, e, v)),
    setPayment: (_a, _e, v) => through(() => storage.setPayment(a, e, v)),
    setSecond: (_a, _e, v) => through(() => storage.setSecond(a, e, v)),
    setFieldsRaw: (_a, _e, v) => through(() => storage.setFieldsRaw(a, e, stored(v))),
    setPaymentRaw: (_a, _e, v) => through(() => storage.setPaymentRaw(a, e, stored(v))),
    setSecondRaw: (_a, _e, v) => through(() => storage.setSecondRaw(a, e, stored(v))),
    setAttachment: (_a, _e, v) => through(() => storage.setAttachment(a, e, v)),
    setImage: (_a, _e, v) => through(() => storage.setImage(a, e, v)),
  };
}

type Seal = (value: string) => Promise<StoredSecret>;

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
 *
 * <p>Every raw setter call is committed under the storage's cross-window lease, as the plain writer's
 * are; the sealing itself runs before, outside it ({@link put}).</p>
 */
function sealingWriter(storage: StorageManager, a: string, e: string, pin: string, opened: EditPrefill): EntryWriter {
  const seal: Seal = async (value) => stored(await sealText(value, a, pin));
  const maybe = async (value: string | undefined): Promise<StoredSecret | undefined> => (value === undefined ? undefined : seal(value));
  const commit: Commit = (write) => storage.writes.run(write);
  return {
    // An empty password means "keep" — nothing is sealed, and the setter keeps for `undefined` as it does for `''`.
    setPassword: (_a, _e, v) => put(v === undefined || v.length === 0 ? Promise.resolve(undefined) : seal(v), commit, (s) => storage.setPassword(a, e, s)),
    setPrivateKey: (_a, _e, v) => put(seal(v), commit, (s) => storage.setPrivateKey(a, e, s)),
    setVpnConfig: (_a, _e, v) => put(seal(v), commit, (s) => storage.setVpnConfig(a, e, s)),
    setTotp: (_a, _e, v) => sealIfChanged(opened.totp, v, seal, (sealed) => commit(() => storage.setTotp(a, e, sealed))),
    setDbConnection: (_a, _e, v) => sealIfChanged(opened.dbConnection, v, seal, (sealed) => commit(() => storage.setDbConnection(a, e, sealed))),
    setNotes: (_a, _e, v) => sealOrDelete(opened.notes, v, seal, (sealed) => commit(() => storage.setNotes(a, e, sealed))),
    setConfigBody: (_a, _e, v) => sealOrDelete(opened.configBody, v, seal, (sealed) => commit(() => storage.setConfigBody(a, e, sealed))),
    setFields: (_a, _e, v) =>
      sealOrDelete(canonicalFields(opened.fieldsRaw), serializeFields(v), seal, (sealed) => commit(() => storage.setFieldsRaw(a, e, sealed))),
    setPayment: (_a, _e, v) =>
      sealOrDelete(canonicalPayment(opened.paymentRaw), serializePaymentFields(v), seal, (sealed) => commit(() => storage.setPaymentRaw(a, e, sealed))),
    setSecond: (_a, _e, v) =>
      sealOrDelete(canonicalSecond(opened.secondRaw), serializeSecondValues(v), seal, (sealed) => commit(() => storage.setSecondRaw(a, e, sealed))),
    setFieldsRaw: (_a, _e, v) => put(maybe(v), commit, (s) => storage.setFieldsRaw(a, e, s)),
    setPaymentRaw: (_a, _e, v) => put(maybe(v), commit, (s) => storage.setPaymentRaw(a, e, s)),
    setSecondRaw: (_a, _e, v) => put(maybe(v), commit, (s) => storage.setSecondRaw(a, e, s)),
    setAttachment: (_a, _e, v) => commit(() => storage.setAttachment(a, e, v)),
    setImage: (_a, _e, v) => commit(() => storage.setImage(a, e, v)),
  };
}

/** One raw setter call under the storage's cross-window lease — the commit, and nothing slow, inside it. */
type Commit = (write: () => Promise<void>) => Promise<void>;

/**
 * Seal OUTSIDE the lease (scrypt, ~1 s), then commit INSIDE it (CodeRabbit on PR #177): a sealed value
 * written outside the lease could land between Protect's re-read and its write (`entityPin.sealIfStill`)
 * and be overwritten with the seal of the value Protect read before — an update lost.
 */
async function put<T>(sealed: Promise<T>, commit: Commit, write: (value: T) => Promise<void>): Promise<void> {
  const value = await sealed;
  await commit(() => write(value));
}

/**
 * One value: equal to what the form was opened over is SKIPPED — byte-identical stays
 * byte-identical (R4) — and anything else is sealed in memory first, then written (R3).
 */
async function sealIfChanged(was: string | undefined, now: string, seal: Seal, write: (sealed: StoredSecret) => Promise<void>): Promise<void> {
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
  write: (sealed: StoredSecret | undefined) => Promise<void>,
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
