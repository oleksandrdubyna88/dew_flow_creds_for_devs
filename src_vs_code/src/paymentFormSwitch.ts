import { PaymentForm } from './paymentForm';
import { PAYMENT_FIELD_LABELS, PaymentFieldKey, PaymentFields, keysForForm, pickPaymentFields } from './paymentFields';

/**
 * Retyping a payment instrument erases the form it left — and says so first.
 *
 * <p>Three forms in one JSON record is the deliberate design (parent plan §2.1), and this is the
 * price of it. A card re-typed as bank details leaves `number`, `cvv` and `pin` inside the record:
 * gone from the form, and very much present in a sync, a backup and an export. The person believes
 * they replaced the contents. The vault disagrees, silently, forever.</p>
 *
 * <p>So the switch is <b>destructive and asks first</b>. What it asks with is the point of the whole
 * module: <b>field names, never values</b>. A confirmation that quotes the card number back at
 * somebody puts it on screen, in a modal, and into whatever screenshot follows — in order to tell
 * them it is about to be deleted.</p>
 *
 * <p>Pure: no `vscode`. The dialog belongs to the caller, the sentence belongs here, and the erasure
 * itself is `clearForForm`, which S1.2 shipped with no caller at all.</p>
 */

/**
 * The keys a switch from one form to another would erase.
 *
 * <p>DERIVED from the two forms' own field lists rather than written out per pair. Nine ordered pairs
 * hand-maintained is nine chances for `bank → phrase` to be the one nobody pictured — and the field
 * lists are what actually decide it, so asking them is both shorter and correct by construction.</p>
 */
export function keysClearedBy(from: PaymentForm, to: PaymentForm): readonly PaymentFieldKey[] {
  const kept = new Set<string>(keysForForm(to));
  return keysForForm(from).filter((key) => !kept.has(key));
}

/**
 * What to put in front of the person before their old form is erased, or `''` when nothing is lost.
 *
 * <p>Only fields that are actually STORED are named. Listing the whole form's vocabulary would tell
 * somebody they are about to lose a PIN they never set, which is how a warning teaches people that it
 * is noise.</p>
 */
export function switchWarning(from: PaymentForm, to: PaymentForm, fields: PaymentFields): string {
  const losing = storedKeysLost(from, to, fields);
  if (losing.length === 0) {
    return '';
  }
  return `Switching this entry to a different form will delete what is stored for the old one: ${listOf(
    losing.map((key) => PAYMENT_FIELD_LABELS[key].toLowerCase()),
  )}. This cannot be undone.`;
}

/** The intersection of "this form loses it" and "there is something there to lose". */
export function storedKeysLost(
  from: PaymentForm,
  to: PaymentForm,
  fields: PaymentFields,
): readonly PaymentFieldKey[] {
  const stored = pickPaymentFields(fields) as Record<string, unknown>;
  return keysClearedBy(from, to).filter((key) => stored[key] !== undefined);
}

/** "a, b and c" — an Oxford-less list, because this is a sentence and not a bullet list. */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
