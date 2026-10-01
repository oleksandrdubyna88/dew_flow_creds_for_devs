import { lockedSlotCount } from './entityPin';
import { firstLockedStored } from './pinAdmission';
import { PinGate, PinOpen, openStored, pinRefusalFor } from './pinGate';
import type { CreatePin, SettledPin } from './pinOnCreate';
import { grantedPin } from './pinSession';
import type { StorageManager } from './storageManager';

/**
 * Rule R3 at WRITE time: an interactive writer decides whether it seals — and with which PIN — at the
 * moment of its first write, never from what it saw before it waited for the person.
 *
 * <p>Edit chose its writer from the protection the entry had when the form OPENED, and *Restore This
 * Version…* took the PIN before its confirmation. A form or a modal can stay open for minutes, and in
 * that time another window or a sync can protect the entry, or take the PIN off. Protected meanwhile,
 * Edit wrote the typed value in the clear into a protected entry and rebuilt its details from the
 * stale copy, without the mark (review of 2026-09-30). So the writer re-reads, right before it writes:</p>
 *
 * <ul>
 *   <li><b>Opened sealed:</b> the PIN is fetched now (`pinAtWrite`) — the grant when it still opens the
 *       entry, a fresh question when it does not; an entry that holds no sealed value any more is
 *       refused (sealing would re-protect it without a decision, writing it plain would drop the mark
 *       in silence).</li>
 *   <li><b>Opened plain:</b> an entry that now holds a sealed value, or has gained the mark, or is
 *       now marked and holds nothing at all, is refused — the mirror of the sentence above. Sealing
 *       under the now-required PIN was considered and not taken: the person typed into a form that said
 *       the entry was unprotected, and what they typed may be the very value the other window meant to
 *       keep sealed; the conservative answer loses a moment's typing, never a decision.</li>
 *   <li><b>Opened protected while EMPTY</b> — marked, no value in any slot (*Protect with a PIN…* on an
 *       empty entry writes the mark alone; review of 2026-09-30): a write that stores a value seals it
 *       under the entry's FIRST PIN, chosen by the person through `FirstSeal.choose` (typed twice, or
 *       checked against the protected entries of its folder), before the first write; a write that
 *       stores nothing secret needs no PIN. Re-read now like the rest: a value sealed meanwhile is
 *       sealed again under ITS PIN (`pinAtWrite`), and a mark gone meanwhile is refused.</li>
 * </ul>
 *
 * <p><b>A `Sealing` is a proof, and only this module can make one</b> (`PLAN_typed_stored_secrets.md`
 * §2.4, T4). `plain` and `sealed` carry an unexported brand, so a writer can be had only from
 * `entryWriter.writerFor`, and `writerFor` only from a `Sealing` made here — by the interactive re-read
 * above (`sealingAtWrite`), by a brand-new entry's PIN (`sealingForNew`), by a share's update
 * (`sealingForUpdate`) or by an unattended write (`unattendedSealing`). `{ kind: 'plain' }` written
 * anywhere else does not compile (`test/fixtures/typed/sealing_is_a_proof.ts`).</p>
 *
 * <p>Pure of `vscode`: the gate, the storage, the doors and the reporter arrive as arguments.</p>
 */

/** The brand. Unexported, so a `plain` or `sealed` value exists only where this module made it. */
const PROOF: unique symbol = Symbol('a Sealing made by sealingAtWrite.ts');

/**
 * Whether a write seals, and with what — or that it must not happen at all.
 *
 * <ul>
 *   <li>`plain` carries what its decision SAW of the mark (`marked`), so the writer can re-check under
 *       the cross-window lease that nothing was protected since (`entryWriter.ts`), and `fresh` when the
 *       entry is brand new — an id nobody else can know, so there is nothing to re-check;</li>
 *   <li>`stopped.reason` is what the CALLER still has to say: `''` when the person declined or was told
 *       already (the interactive constructors), the PIN sentence for an unattended write — the
 *       `OpenedSecret.stopped` contract (`secretOpener.ts`).</li>
 * </ul>
 */
export type Sealing =
  | { readonly kind: 'plain'; readonly marked: boolean; readonly fresh: boolean; readonly [PROOF]: true }
  | { readonly kind: 'sealed'; readonly pin: string; readonly [PROOF]: true }
  | { readonly kind: 'stopped'; readonly reason: string };

/** A sealing a writer can be had for — `stopped` has none: its caller returns. */
export type WritableSealing = Exclude<Sealing, { readonly kind: 'stopped' }>;

/** One writer's words: what was open while the protection could change, and what the person does next. */
export interface WriterWords {
  /** What waited for the person — *"this form"*, *"this confirmation"*. */
  readonly waited: string;
  /** *"Nothing was saved."* */
  readonly nothing: string;
  /** *"Close the form and open Edit again."* */
  readonly again: string;
  /** The PIN box's purpose when the grant is gone — *"save it"*. */
  readonly purpose: string;
}

/** What the writer saw when it opened: a sealed value, the mark, and whether any slot held anything. */
export interface OpenedAs {
  readonly locked: boolean;
  readonly marked: boolean;
  /** Any slot held a value — sealed, plain or damaged. Marked with nothing held is protected while empty. */
  readonly held: boolean;
}

/**
 * What a write into an entry protected while empty needs: whether it stores a value at all, and how
 * the person chooses the entry's first PIN — `undefined` for a decline. Required of every writer, so
 * none can reach an entry like that without having said what it adds.
 */
export interface FirstSeal {
  readonly adds: boolean;
  readonly choose: () => Promise<string | undefined>;
}

/** Declined, or said already: the caller has nothing left to say. */
const STOPPED: Sealing = { kind: 'stopped', reason: '' };

/** A plain proof for an entry that exists, carrying what the decision saw of its mark. */
function plainOver(marked: boolean): Sealing {
  return { kind: 'plain', marked, fresh: false, [PROOF]: true };
}

/** The sealing a write uses, decided NOW — immediately before its first write. */
export async function sealingAtWrite(
  storage: StorageManager,
  gate: PinGate,
  opened: OpenedAs,
  words: WriterWords,
  report: (reason: string) => void,
  first: FirstSeal,
): Promise<Sealing> {
  if (opened.locked) {
    return sealedWith(await pinAtWrite(storage, gate, words, report));
  }
  if (emptyAtOpen(opened)) {
    return firstSealing(storage, gate, words, report, first);
  }
  if (await becameProtected(storage, gate, opened.marked)) {
    report(protectedMeanwhile(gate.entryName, words));
    return STOPPED;
  }
  return plainOver(markedNow(storage, gate));
}

/** Protected while empty when the writer opened: marked, and holding nothing in any slot. */
function emptyAtOpen(opened: OpenedAs): boolean {
  return opened.marked && !opened.held;
}

function sealedWith(pin: string | undefined): Sealing {
  return pin === undefined ? STOPPED : { kind: 'sealed', pin, [PROOF]: true };
}

/**
 * A BRAND-NEW entry's sealing (§2.4): `plain` when its folder asks for no PIN, `sealed` with the
 * folder's PIN when it does (`pinOnCreate.CreatePin`), `stopped` when the PIN was not settled — a caller
 * that returned on `cancelled` before writing gets a writable proof by its type. `fresh`: the id is new,
 * nobody else can protect it, so the writer re-checks nothing. The person's Add and an agent's create
 * take it; so do an accepted share and an import, which write NEW ids and ask no folder PIN (§2.7 — the
 * typed writer makes their `plain` proof visible rather than silent).
 */
export function sealingForNew(settled: SettledPin): WritableSealing;
export function sealingForNew(settled: CreatePin): Sealing;
export function sealingForNew(settled: CreatePin): Sealing {
  if (settled.kind === 'cancelled') {
    return STOPPED;
  }
  return settled.kind === 'pin' ? sealedWith(settled.pin) : { kind: 'plain', marked: false, fresh: true, [PROOF]: true };
}

/** How a share's *Update it* reaches a PIN: the live door, and the entry's FIRST PIN — `undefined` for a stop. */
export interface UpdateDoors {
  /** The live door (purpose "update it"), and the PIN it granted; `undefined` when it stopped (said by the door). */
  readonly door: () => Promise<string | undefined>;
  /** The entry's first PIN, chosen by the person (`pinOnCreate.firstPinFor`); `undefined` for a decline. */
  readonly firstPin: () => Promise<string | undefined>;
}

/**
 * A share's *Update it* into an entry that already exists (§2.4, gate 2026-09-30 finding 2; the
 * decision `shareUpdateSeal.writerFor` made since the hotfix of 2026-10-01, branded and moved here):
 *
 * <ul>
 *   <li><b>a sealed slot:</b> `sealed` with the PIN the live door took, or `stopped`;</li>
 *   <li><b>the mark over nothing at all — protected while empty:</b> a payload that `carries` a value takes
 *       the first-PIN road and is `sealed` under it (or `stopped` for a decline); one that carries none is
 *       `plain`, with nothing secret to write;</li>
 *   <li><b>no sealed slot and no mark</b> — or a mark over values in the CLEAR, the 0.99.0 false mark the
 *       door clears at the next open — `plain`, with no door.</li>
 * </ul>
 *
 * <p>A share's writer opens and writes in one step, so this is `sealingAtWrite`'s decision without the
 * wait in between; what can still change between it and the first write is re-checked by the writer.</p>
 */
export async function sealingForUpdate(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  carries: boolean,
  doors: UpdateDoors,
): Promise<Sealing> {
  if ((await firstLockedStored(storage, accountId, entityId)) !== undefined) {
    return sealedWith(await doors.door());
  }
  const marked = isMarked(storage, accountId, entityId);
  if (carries && (await protectedWhileEmpty(storage, accountId, entityId, marked))) {
    return sealedWith(await doors.firstPin());
  }
  return plainOver(marked);
}

/** Marked, and holding nothing in any slot — the test `emptyAtOpen` and Edit's `protectedWhileEmpty` make. */
async function protectedWhileEmpty(storage: StorageManager, accountId: string, entityId: string, marked: boolean): Promise<boolean> {
  return marked && (await lockedSlotCount(storage, accountId, entityId)).total === 0;
}

/**
 * An UNATTENDED write's sealing (§2.4, the first plan gate's finding 0): `plain` only for an entry with
 * no sealed slot and no mark; `stopped` with the PIN sentence otherwise. Never `sealed` — nothing
 * automatic holds a PIN. Its one caller is the rotation's store (`entryWriter.writeUnattended`), where
 * `rotateAction.protectedSlot` refused before the action ran; this is what turns "refused before" into
 * "cannot be written without".
 */
export async function unattendedSealing(
  storage: StorageManager,
  accountId: string,
  owner: { readonly id: string; readonly name: string },
): Promise<Sealing> {
  const protectedNow = isMarked(storage, accountId, owner.id) || (await lockedSlotCount(storage, accountId, owner.id)).locked > 0;
  return protectedNow ? { kind: 'stopped', reason: pinRefusalFor(owner.name) } : plainOver(false);
}

/** Whether the entry carries the PIN mark, read from the node where it lives. */
export function isMarked(storage: StorageManager, accountId: string, entityId: string): boolean {
  return storage.getNode(accountId, entityId)?.details?.pinProtected === true;
}

/**
 * An entry that was protected while EMPTY when the writer opened, decided now: sealed meanwhile → its
 * PIN, as any sealed entry's; unmarked meanwhile → refused, the mirror of `unprotectedMeanwhile`; still
 * marked → the first PIN when the write stores a value, and plain when it stores nothing secret.
 */
async function firstSealing(
  storage: StorageManager,
  gate: PinGate,
  words: WriterWords,
  report: (reason: string) => void,
  first: FirstSeal,
): Promise<Sealing> {
  if ((await firstLockedStored(storage, gate.accountId, gate.entityId)) !== undefined) {
    return sealedWith(await pinAtWrite(storage, gate, words, report));
  }
  if (!markedNow(storage, gate)) {
    report(unprotectedMeanwhile(gate.entryName, words));
    return STOPPED;
  }
  return first.adds ? sealedWith(await first.choose()) : plainOver(true);
}

/**
 * The PIN a protected entry's write seals with, verified NOW — or nothing, and the person is told why
 * unless they declined. A grant taken early and spent late can be gone (the vault locked, the window
 * reloaded); read late, its absence is simply another question, asked with `words.purpose`.
 */
export async function pinAtWrite(
  storage: StorageManager,
  gate: PinGate,
  words: WriterWords,
  report: (reason: string) => void,
): Promise<string | undefined> {
  const locked = await firstLockedStored(storage, gate.accountId, gate.entityId);
  if (locked === undefined) {
    report(unprotectedMeanwhile(gate.entryName, words));
    return undefined;
  }
  const opened = await openStored(locked, { ...gate, purpose: words.purpose });
  if (opened.kind === 'value') {
    return grantedPin(gate.accountId, gate.entityId);
  }
  const reason = refusalOf(opened);
  if (reason !== '') {
    report(reason);
  }
  return undefined;
}

/**
 * A chooser asked at most until it answers — a decline can be asked again, an answer is kept. Edit's
 * Save gate asks for an empty-protected entry's first PIN, and the write a moment later seals with the
 * same answer rather than raising the two boxes a second time.
 */
export function chosenOnce(choose: () => Promise<string | undefined>): () => Promise<string | undefined> {
  let chosen: string | undefined;
  return async () => {
    chosen ??= await choose();
    return chosen;
  };
}

/** What to say about an open that did not produce a value — nothing for a decline. */
export function refusalOf(opened: PinOpen): string {
  return opened.kind === 'wrong' || opened.kind === 'cooling' || opened.kind === 'corrupt' ? opened.reason : '';
}

/**
 * A sealed value now, a mark the entry did not carry when the writer opened, or the mark over an entry
 * that now holds nothing — protected while empty, whose first value must be sealed — the envelopes
 * first, as the door reads them.
 */
async function becameProtected(storage: StorageManager, gate: PinGate, markedAtOpen: boolean): Promise<boolean> {
  const now = await lockedSlotCount(storage, gate.accountId, gate.entityId);
  return now.locked > 0 || (markedNow(storage, gate) && (!markedAtOpen || now.total === 0));
}

function markedNow(storage: StorageManager, gate: PinGate): boolean {
  return isMarked(storage, gate.accountId, gate.entityId);
}

function protectedMeanwhile(name: string, words: WriterWords): string {
  return `"${name}" was protected with a PIN while ${words.waited} was open. ${words.nothing} ${words.again}`;
}

function unprotectedMeanwhile(name: string, words: WriterWords): string {
  return `"${name}" stopped being protected with a PIN while ${words.waited} was open — the protection was removed `
    + `in another window or by a sync. ${words.nothing} ${words.again}`;
}
