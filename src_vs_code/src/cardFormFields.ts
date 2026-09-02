import { PaymentFields, pickPaymentFields } from './paymentFields';
import { brandOf, luhn } from './cardBrand';
import { PAYMENT_BRAND_LABELS } from './cardBrandIcons';

/**
 * Where the card form's input ids meet the record's field names — the one place they touch.
 *
 * <p>`cardNumber` in the DOM is `number` in the record, `cardCvv` is `cvv`, and so on for all seven.
 * Keeping the mapping in one table means a rename on either side breaks exactly here, rather than
 * silently writing a field nothing reads: the record is a JSON blob, so a wrong key does not fail to
 * compile and does not fail to save. It just quietly stores nothing anybody can find.</p>
 *
 * <p>Its own module because `entityFormPanel.ts` is at the repository's 800-line ceiling, and the rule
 * there is to extract rather than suppress. This leaves cleanly — it is a pure mapping with no view of
 * the panel, the webview, or `vscode`.</p>
 */
type FormTextField =
  | 'number' | 'expiry' | 'holder' | 'cvv' | 'pin' | 'address' | 'phone' | 'country'
  | 'beneficiary' | 'bank' | 'iban' | 'accountNumber' | 'swift' | 'intermediary' | 'bankAddress';

/**
 * Both forms in ONE table, because the record is one record.
 *
 * <p>A card's boxes and a bank's boxes are never on screen together — the `condition` in
 * `formSections.ts` sees to that — so reading all of them is reading the visible ones plus a row of
 * empties, and `pickPaymentFields` drops empties. Two tables would need a rule for which one to read,
 * and that rule would be the third place the current form is decided.</p>
 */
const CARD_INPUTS: ReadonlyArray<readonly [inputId: string, field: FormTextField]> = [
  ['cardNumber', 'number'],
  ['cardExpiry', 'expiry'],
  ['cardHolder', 'holder'],
  ['cardCvv', 'cvv'],
  ['cardPin', 'pin'],
  ['cardAddress', 'address'],
  ['cardPhone', 'phone'],
  ['cardCountry', 'country'],
  ['bankBeneficiary', 'beneficiary'],
  ['bankName', 'bank'],
  ['bankIban', 'iban'],
  ['bankAccountNumber', 'accountNumber'],
  ['bankSwift', 'swift'],
  ['bankIntermediary', 'intermediary'],
  ['bankAddress', 'bankAddress'],
];

/**
 * The card boxes off a save payload, as a record — empty boxes dropped by `pickPaymentFields`.
 *
 * <p>An all-empty form therefore yields an empty record, which `setPayment` stores as nothing at all
 * (S1.2's rule: an empty record deletes, so a payment instrument stripped bare holds no key).</p>
 */
export function cardFieldsFrom(data: Record<string, unknown>): PaymentFields {
  return pickPaymentFields(
    Object.fromEntries(CARD_INPUTS.map(([inputId, field]) => [field, textOf(data[inputId])])),
  );
}

/** The ids the webview is asked to fill when a stored card is delivered by message. */
export const CARD_INPUT_IDS: readonly string[] = CARD_INPUTS.map(([inputId]) => inputId);

/** A payload crosses `postMessage`, so anything can arrive; only a string is a value. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The record's values back under the form's ids — the other direction, for delivering a stored card. */
export function cardInputsFrom(fields: PaymentFields): Record<string, string> {
  return Object.fromEntries(CARD_INPUTS.map(([inputId, field]) => [inputId, fields[field] ?? '']));
}

/**
 * `brand` is DERIVED, never typed — which is why it is not in the table above.
 *
 * <p>It is stored with the record so an export or another machine can show the mark without re-running
 * the prefix table, and it is recomputed on every save so a corrected number corrects the mark.</p>
 */
export function withBrand(fields: PaymentFields, brand: string): PaymentFields {
  return brand === '' ? fields : { ...fields, brand };
}

/**
 * What to say under the card number: which system it is, and whether the digits look mistyped.
 *
 * <p>Luhn is a HINT in the strongest sense — the sentence says "worth checking", never "fix this",
 * and nothing refuses the save. A card the checksum rejects is stored exactly as typed, because
 * people hold cards this table has never heard of and a vault that will not take one is a vault they
 * keep a photo of instead.</p>
 *
 * <p>Host-side rather than in the page, for the reason the highlighter's own comment gives: the page
 * is a template string, and nothing inside one can be unit tested.</p>
 */
export function brandHint(number: string): string {
  if (binOfDigits(number).length === 0) {
    return '';
  }
  const brand = brandOf(number);
  const named = brand === '' ? 'Not a system this build recognises' : PAYMENT_BRAND_LABELS[brand];
  return `${named}${luhn(number) ? '' : MISTYPED}`;
}

const MISTYPED = ' · the digits do not add up — worth checking, but it will still save';

function binOfDigits(number: string): string {
  return number.replace(/\D/g, '');
}
