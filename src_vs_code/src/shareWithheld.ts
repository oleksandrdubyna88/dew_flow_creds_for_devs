import { SECOND_KEYS, SECOND_LABELS, SecondValues, parseSecondValues } from './secondValues';
import { withheldFromShare } from './paymentRedaction';
import { openedText } from './pinAdmission';
import { silentPinGate } from './pinGate';
import type { StoredSecret } from './storedSecret';

/**
 * What a share leaves behind, as names a person recognises — the whole answer, in one place.
 *
 * <p>Two withholdings today and they have different reasons, which is exactly why they are computed
 * together rather than separately at two call sites. A payment record is stripped to an allowlist
 * because a CVV and a PIN are only ever proof the holder is present (`paymentRedaction.ts`); a second
 * value is withheld for a different reason — a share names ONE credential for a colleague, and a
 * second value is something the person added for themselves. A sender should learn both from the same
 * sentence rather than one of them from a recipient who asks.</p>
 *
 * <p><b>Names, never values.</b> This reaches a notification, and several UI layers log those.</p>
 *
 * <p><b>Derived from what is HELD</b>, so a notice never mentions something the entry does not have —
 * which would read as a warning about a value that does not exist.</p>
 *
 * <p>Pure: no `vscode`, no storage. It is handed what was read.</p>
 */

/** One entry's withheld names. `paymentRaw` is `undefined` for an entry that is not a payment. */
export function withheldNamesOf(
  paymentRaw: string | undefined,
  seconds: SecondValues,
): readonly string[] {
  return [...withheldFromShare(paymentRaw), ...secondNamesOf(seconds)];
}

/** A second value the entry holds, by the label a person sees rather than by its record key. */
function secondNamesOf(held: SecondValues): readonly string[] {
  return SECOND_KEYS.filter((key) => held[key] !== undefined).map((key) => SECOND_LABELS[key]);
}

/**
 * The sentence, or '' when a share left nothing behind.
 *
 * <p>Sorted and de-duplicated, because a folder share reads many entries and "cvv, cvv, pin" would be
 * a list about the number of entries rather than about what was withheld.</p>
 *
 * <p><b>Sorted as a person reads</b>, not by UTF-16 code unit. A default `.sort()` puts every capital
 * before every lower-case letter, so these six names come out as "Second CVV, Second IBAN, Second
 * PIN, Second account number, …" — one list arranged as two, which somebody has to read twice to be
 * sure nothing is missing. These are labels shown to a person; the static analyser raised it and it
 * is right.</p>
 */
export function withheldSentence(names: Iterable<string>): string {
  const unique = [...new Set(names)].sort((one, other) => one.localeCompare(other));
  return unique.length === 0 ? '' : ` Not sent, and they cannot be: ${unique.join(', ')}.`;
}

/**
 * Just the two reads this needs, so a test does not have to build a StorageManager — both RAW, so a
 * protected entry's records are opened here rather than parsed as `{}` by a typed getter.
 */
export interface WithheldReader {
  getPaymentRaw(accountId: string, entityId: string): Thenable<StoredSecret | undefined>;
  getSecondRaw(accountId: string, entityId: string): Thenable<string | undefined>;
}

/** What the notice reads of one payload: the sender's node, and whether it is a payment. */
interface WithheldPayload {
  readonly node: { readonly id: string; readonly name?: string; readonly details?: { readonly isPayment?: boolean } };
}

/**
 * The sentence for a whole share — one entry or a folder subtree.
 *
 * <p>Computed from the PAYLOADS rather than from the selection, so one implementation covers both: a
 * payload keeps the SENDER's node id, which is what reads the sender's own record. Every payload is
 * read, because a second value can belong to any kind — a folder of passwords costs one keychain read
 * each, which is the price of the notice being true.</p>
 *
 * <p>Both records are OPENED with the grant the share's door left (entry-PIN plan, D9), through a
 * silent gate: a protected card read as `{}` here, and its sender was told nothing was withheld while
 * its CVV was. A value the grant does not open counts as nothing held — never an envelope, never a
 * second box.</p>
 */
export async function withheldNoteFor(
  read: WithheldReader,
  accountId: string,
  payloads: readonly WithheldPayload[],
): Promise<string> {
  const names: string[] = [];
  for (const payload of payloads) {
    names.push(...(await withheldOfOne(read, accountId, payload.node)));
  }
  return withheldSentence(names);
}

async function withheldOfOne(read: WithheldReader, accountId: string, node: WithheldPayload['node']): Promise<readonly string[]> {
  const gate = silentPinGate(accountId, node.id, node.name ?? node.id);
  const paymentRaw = node.details?.isPayment === true ? await openedText(await read.getPaymentRaw(accountId, node.id), gate) : undefined;
  const secondRaw = await openedText(await read.getSecondRaw(accountId, node.id), gate);
  return withheldNamesOf(paymentRaw, parseSecondValues(secondRaw));
}
