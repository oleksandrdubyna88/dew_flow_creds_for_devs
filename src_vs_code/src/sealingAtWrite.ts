import { lockedSlotCount } from './entityPin';
import { firstLockedStored } from './pinAdmission';
import { PinGate, PinOpen, openStored } from './pinGate';
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
 * <p>Pure of `vscode`: the gate, the storage and the reporter arrive as arguments.</p>
 */

/** Whether a write seals, and with what — or that it must not happen at all (the person was told why). */
export type Sealing = { readonly kind: 'plain' } | { readonly kind: 'sealed'; readonly pin: string } | { readonly kind: 'stopped' };

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

const PLAIN: Sealing = { kind: 'plain' };
const STOPPED: Sealing = { kind: 'stopped' };

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
  return PLAIN;
}

/** Protected while empty when the writer opened: marked, and holding nothing in any slot. */
function emptyAtOpen(opened: OpenedAs): boolean {
  return opened.marked && !opened.held;
}

function sealedWith(pin: string | undefined): Sealing {
  return pin === undefined ? STOPPED : { kind: 'sealed', pin };
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
  return first.adds ? sealedWith(await first.choose()) : PLAIN;
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
  return storage.getNode(gate.accountId, gate.entityId)?.details?.pinProtected === true;
}

function protectedMeanwhile(name: string, words: WriterWords): string {
  return `"${name}" was protected with a PIN while ${words.waited} was open. ${words.nothing} ${words.again}`;
}

function unprotectedMeanwhile(name: string, words: WriterWords): string {
  return `"${name}" stopped being protected with a PIN while ${words.waited} was open — the protection was removed `
    + `in another window or by a sync. ${words.nothing} ${words.again}`;
}
