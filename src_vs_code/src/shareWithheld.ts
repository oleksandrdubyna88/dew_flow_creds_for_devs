import { SECOND_KEYS, SECOND_LABELS, SecondValues } from './secondValues';
import { withheldFromShare } from './paymentRedaction';

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
 */
export function withheldSentence(names: Iterable<string>): string {
  const unique = [...new Set(names)].sort();
  return unique.length === 0 ? '' : ` Not sent, and they cannot be: ${unique.join(', ')}.`;
}

/** Just the two reads this needs, so a test does not have to build a StorageManager. */
export interface WithheldReader {
  getPaymentRaw(accountId: string, entityId: string): Thenable<string | undefined>;
  getSecond(accountId: string, entityId: string): Thenable<SecondValues>;
}

/**
 * The sentence for a whole share — one entry or a folder subtree.
 *
 * <p>Computed from the PAYLOADS rather than from the selection, so one implementation covers both: a
 * payload keeps the SENDER's node id, which is what reads the sender's own record. Every payload is
 * read, because a second value can belong to any kind — a folder of passwords costs one keychain read
 * each, which is the price of the notice being true.</p>
 */
export async function withheldNoteFor(
  read: WithheldReader,
  accountId: string,
  payloads: readonly { node: { id: string; details?: { isPayment?: boolean } } }[],
): Promise<string> {
  const names: string[] = [];
  for (const payload of payloads) {
    const paymentRaw = payload.node.details?.isPayment === true
      ? await read.getPaymentRaw(accountId, payload.node.id)
      : undefined;
    names.push(...withheldNamesOf(paymentRaw, await read.getSecond(accountId, payload.node.id)));
  }
  return withheldSentence(names);
}
