import type { SecretWriter } from './applyFormSecrets';
import { parseFields, serializeFields } from './entityFields';
import { lockedSlotCount, sealValue } from './entityPin';
import { parsePaymentFields, serializePaymentFields } from './paymentFields';
import { SECRET_SLOTS, SecretSlot } from './entitySlots';
import { PinGate, PinOpen, openStored, silentPinGate } from './pinGate';
import type { RevisionSecrets } from './revisionHistory';
import { WriterWords, pinAtWrite, refusalOf } from './sealingAtWrite';
import { parseSecondValues, serializeSecondValues } from './secondValues';
import type { StorageManager } from './storageManager';

/**
 * Editing a protected entry: what the form is OPENED over, and how its save is WRITTEN.
 *
 * <p>The owner's card was lost by Edit (entry-PIN plan, D2-D5): the form opened over `{}` because
 * the typed getters keep only keys they know and a locked envelope has none, and Save wrote that
 * `{}` back — a deletion. The same save dropped the PIN mark, stored a typed value in the clear,
 * and handed the unmarked details to the terminal bindings. Three rules of that plan are kept
 * here, in one pure module, so the edit command stays a sequence and every rule is a unit test:</p>
 *
 * <ul>
 *   <li><b>R3 — never written in the clear, not even for a moment.</b> `sealedWriter` seals every
 *       changed value in memory and only then runs the raw setter; the precedent is
 *       `shareRecipientPin.ts`, and the rejected alternative was "write, then run `protectEntity`",
 *       which leaves plaintext in the keychain in between.</li>
 *   <li><b>R4 — a save never erases what it could not read.</b> `openEntryForEdit` refuses over a
 *       `corrupt` or unopenable slot, and a value equal to what was opened is left byte-identical:
 *       no re-seal, no sync churn.</li>
 *   <li><b>The PIN is fetched at Save, never captured at open.</b> `pinForSave` re-reads this
 *       window's grant and asks again when it no longer opens the entry (plan gate, finding 2); the
 *       whole decision — seal, write plain, or refuse — is `sealingAtWrite.ts`, shared with Restore.</li>
 * </ul>
 *
 * <p>Pure of `vscode`: the gate and the storage arrive as arguments, so `editProtected.test.ts`
 * drives every path over the real `StorageManager`.</p>
 */

/** What the form is prefilled with — opened, never an envelope — plus the presence of what it is not. */
export interface EditPrefill {
  /** At least one slot was locked when the form opened: the entry is protected, and its save seals. */
  readonly locked: boolean;
  /**
   * Any slot held anything when the form opened. A MARKED entry holding nothing is protected while
   * empty: its save asks for the entry's first PIN when it stores a value (`sealingAtWrite`).
   */
  readonly held: boolean;
  readonly notes: string | undefined;
  readonly fieldsRaw: string | undefined;
  readonly secondRaw: string | undefined;
  readonly paymentRaw: string | undefined;
  readonly configBody: string | undefined;
  readonly dbConnection: string | undefined;
  /** The seed, opened — the form is told it exists and how it is configured, never the seed. */
  readonly totp: string | undefined;
  readonly hasPassword: boolean;
  readonly hasPrivateKey: boolean;
  readonly hasVpnConfig: boolean;
}

/**
 * What a writer into a NEW entry was opened over: nothing. Handed to `sealedWriter`, every value the
 * create stores differs from it and is sealed — an agent's create into a folder that asks for a PIN
 * (agent-create plan, D-B) is that writer's one caller with no form behind it.
 */
export const NOTHING_OPENED: EditPrefill = {
  locked: false,
  held: false,
  notes: undefined,
  fieldsRaw: undefined,
  secondRaw: undefined,
  paymentRaw: undefined,
  configBody: undefined,
  dbConnection: undefined,
  totp: undefined,
  hasPassword: false,
  hasPrivateKey: false,
  hasVpnConfig: false,
};

/** The door's answer for the form: opened, or refused with the sentence to say (`''` for a decline). */
export type EditOpen =
  | { readonly kind: 'open'; readonly prefill: EditPrefill }
  | { readonly kind: 'refused'; readonly reason: string };

/** The slots the form PREFILLS — the ones a locked or damaged value would otherwise reach the page from. */
const PREFILLED = ['notes', 'fieldsRaw', 'secondRaw', 'paymentRaw', 'configBody', 'dbConnection', 'totp'] as const;
type Prefilled = (typeof PREFILLED)[number];

/**
 * The slot each prefilled value lives in, looked up in the slot table rather than written out a second
 * time — so the refusal names a slot the way every other sentence about it does.
 */
const SLOT: Readonly<Record<Prefilled, SecretSlot>> = {
  notes: slotOf('notes'),
  fieldsRaw: slotOf('fields'),
  secondRaw: slotOf('second'),
  paymentRaw: slotOf('payment'),
  configBody: slotOf('config'),
  dbConnection: slotOf('dbConnection'),
  totp: slotOf('totp'),
};

function slotOf(field: keyof RevisionSecrets): SecretSlot {
  const slot = SECRET_SLOTS.find((one) => one.revisionField === field);
  if (slot === undefined) {
    throw new Error(`The slot table has no row for ${field}.`);
  }
  return slot;
}

/**
 * Open, through the gate, only what the form prefills; record presence for the rest.
 *
 * <p>Called after `admitEntry`, so the grant is in this window's session. The seven opens go through
 * a SILENT gate: an entry whose slots were sealed under two PINs (two protects on two machines, mixed
 * by a sync) would otherwise raise one box per slot the grant cannot open, each indistinguishable
 * from the door's — and a PIN typed into one would be granted over the first. A slot the granted PIN
 * does not open refuses the form and is named. What `openStored` still buys is that a `corrupt` slot
 * is a REFUSAL rather than text in a box (R4). The opens run in parallel: each is a scrypt of about a
 * second, and seven seconds is a form nobody waits for.</p>
 */
export async function openEntryForEdit(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  gate: PinGate,
): Promise<EditOpen> {
  const silent = silentPinGate(accountId, entityId, gate.entryName);
  const opens = await Promise.all(PREFILLED.map(async (slot) => openStored(await SLOT[slot].read(storage, accountId, entityId), silent)));
  const refused = PREFILLED.findIndex((_slot, at) => !isOpen(opens[at]));
  if (refused >= 0) {
    return { kind: 'refused', reason: prefillRefusal(opens[refused], SLOT[PREFILLED[refused]].label, gate.entryName) };
  }
  const values = Object.fromEntries(PREFILLED.map((slot, at) => [slot, valueOf(opens[at])])) as Record<Prefilled, string | undefined>;
  return { kind: 'open', prefill: { ...values, ...(await presenceOf(storage, accountId, entityId)) } };
}

/** What the form is told about the slots it does not prefill, and whether the entry is protected at all. */
async function presenceOf(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<Pick<EditPrefill, 'locked' | 'held' | 'hasPassword' | 'hasPrivateKey' | 'hasVpnConfig'>> {
  const count = await lockedSlotCount(storage, accountId, entityId);
  return {
    // Asked of EVERY slot, not of the seven opened above: a credential whose only locked value is
    // its password is protected all the same, and its save must seal what is typed.
    locked: count.locked > 0,
    held: count.total > 0,
    hasPassword: (await storage.getPassword(accountId, entityId)) !== undefined,
    hasPrivateKey: (await storage.getPrivateKey(accountId, entityId)) !== undefined,
    hasVpnConfig: (await storage.getVpnConfig(accountId, entityId)) !== undefined,
  };
}

function isOpen(open: PinOpen): boolean {
  return open.kind === 'value' || open.kind === 'unprotected';
}

/**
 * Why the form does not open over this slot. A silent gate answers `cancelled` only when the PIN the
 * door granted does not open the slot — a fact about the slot, never a decline — and the sentence
 * ends where `editNode` adds "Edit is not opened, so nothing can overwrite it."
 */
function prefillRefusal(open: PinOpen, label: string, entryName: string): string {
  return open.kind === 'cancelled' ? `The value "${label}" of "${entryName}" is sealed under a different PIN;` : refusalOf(open);
}

/** The opened text; `value` is a slot that WAS locked, `unprotected` one that was not. */
function valueOf(open: PinOpen): string | undefined {
  return open.kind === 'value' || open.kind === 'unprotected' ? open.value : undefined;
}

/** What Edit's save says when the protection changed while its form was open (`sealingAtWrite.ts`). */
export const EDIT_WORDS: WriterWords = {
  waited: 'this form',
  nothing: 'Nothing was saved.',
  again: 'Close the form and open Edit again.',
  purpose: 'save it',
};

/**
 * The PIN a protected entry's save seals with, verified NOW — or nothing, and the person is told
 * why unless they declined (`sealingAtWrite.pinAtWrite`, in Edit's words).
 *
 * <p>The grant is re-read at Save rather than captured when the form opened: a grant taken early
 * and spent late can be gone by then (the vault locked, the window reloaded), and read late its
 * absence is simply another question — asked with the purpose <i>"save it"</i>. An entry that holds
 * no locked slot any more (unprotected in another window while this form was open) is refused too,
 * so the form stays open and the sentence says what to do.</p>
 */
export function pinForSave(storage: StorageManager, gate: PinGate, report: (reason: string) => void): Promise<string | undefined> {
  return pinAtWrite(storage, gate, EDIT_WORDS, report);
}

/**
 * The writer for a protected entry's save: every changed value sealed under `pin` before its raw
 * setter runs; a value equal to what the form was opened over is skipped.
 *
 * <p>The setter subset `applyAdditions` uses, over the storage — so the additions pass does not
 * know whether an entry is protected; the writer does, once, per slot. The rules per slot:</p>
 *
 * <ul>
 *   <li>the typed records (login/URL, payment, second values) are serialised with the module that
 *       owns them, compared canonically with the opened record, and sealed when they differ;
 *       `undefined` stays a delete (Rule A of `applyFormSecrets` is unchanged);</li>
 *   <li>`setPassword('')` still means keep; a typed password, key or VPN config is always new,
 *       because the form never prefills those, so it is always sealed;</li>
 *   <li>the attachment and the image pass straight through — the two slots outside the PIN.</li>
 * </ul>
 *
 * <p>Bound to ONE entry: the ids `applyAdditions` hands each setter are the same ones, and the
 * writer ignores them on purpose — a value sealed under this entry's PIN belongs in this entry, and
 * a writer that could be pointed at another would be a way to put it somewhere else.</p>
 */
export function sealedWriter(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
  opened: EditPrefill,
): SecretWriter {
  const seal = (value: string): Promise<string> => sealValue(value, accountId, pin);
  const [a, e] = [accountId, entityId];
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
    setAttachment: (_a, _e, v) => storage.setAttachment(a, e, v),
    setImage: (_a, _e, v) => storage.setImage(a, e, v),
  };
}

type Seal = (value: string) => Promise<string>;

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
