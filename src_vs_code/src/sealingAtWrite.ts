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
 *   <li><b>Opened plain:</b> an entry that now holds a sealed value, or has gained the mark, is refused
 *       — the mirror of the sentence above. Sealing under the now-required PIN was considered and not
 *       taken: the person typed into a form that said the entry was unprotected, and what they typed
 *       may be the very value the other window meant to keep sealed; the conservative answer loses a
 *       moment's typing, never a decision.</li>
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

/** What the writer saw when it opened: a sealed value, and the mark. */
export interface OpenedAs {
  readonly locked: boolean;
  readonly marked: boolean;
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
): Promise<Sealing> {
  if (opened.locked) {
    const pin = await pinAtWrite(storage, gate, words, report);
    return pin === undefined ? STOPPED : { kind: 'sealed', pin };
  }
  if (await becameProtected(storage, gate, opened.marked)) {
    report(protectedMeanwhile(gate.entryName, words));
    return STOPPED;
  }
  return PLAIN;
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

/** What to say about an open that did not produce a value — nothing for a decline. */
export function refusalOf(opened: PinOpen): string {
  return opened.kind === 'wrong' || opened.kind === 'cooling' || opened.kind === 'corrupt' ? opened.reason : '';
}

/** A sealed value now, or a mark the entry did not carry when the writer opened — the envelopes first, as the door reads them. */
async function becameProtected(storage: StorageManager, gate: PinGate, markedAtOpen: boolean): Promise<boolean> {
  return (await firstLockedStored(storage, gate.accountId, gate.entityId)) !== undefined || (!markedAtOpen && markedNow(storage, gate));
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
