/**
 * Which fields a payment instrument shows — three forms of ONE kind.
 *
 * <p>A bank card, a set of bank details and a hidden phrase differ only in their fields. The
 * tree, the folder types, the sharing, the backup and the trash treat them identically, so
 * making them three kinds would triple the per-kind seams (nine of them today) to buy nothing.
 * The form is a field of the record, the same way `dbType` is a field of a database.</p>
 *
 * <p>Free of `vscode`, and the home the per-form field rules will be written into — so what
 * belongs to a card and what belongs to bank details stays a unit test rather than something
 * discovered by switching a saved entry from one to the other.</p>
 *
 * <p><b>Nothing here is a value.</b> The card number, the CVV, the PIN, the IBAN and the woven
 * phrase are ONE JSON secret under one keychain key (`paymentFields.ts`). This module names the
 * form only, which is plaintext metadata on purpose: someone reading it learns that you keep a
 * card, which they knew when they opened the folder called `payments`.</p>
 */

export const PAYMENT_FORMS = ['card', 'bank', 'phrase'] as const;

export type PaymentForm = (typeof PAYMENT_FORMS)[number];

/** How each form is named on screen, and the one line saying what it is for. */
export const PAYMENT_FORM_LABELS: Readonly<Record<PaymentForm, { label: string; hint: string }>> = {
  card: { label: 'Bank card', hint: 'number, expiry, holder, CVV, PIN' },
  bank: { label: 'Bank details', hint: 'what a wire transfer asks for' },
  phrase: { label: 'Hidden phrase', hint: 'stored woven together with a second phrase' },
};

/** The form a new payment instrument gets — a card, because it is what people have most of. */
export const DEFAULT_PAYMENT_FORM: PaymentForm = 'card';

export function isPaymentForm(value: unknown): value is PaymentForm {
  return typeof value === 'string' && (PAYMENT_FORMS as readonly string[]).includes(value);
}

/**
 * The payment fields of a stored record, checked together.
 *
 * <p>Its own function for the reason `hasValidConfigFields` next door is: `isEntityMetadata` is a
 * flat list of independent field checks, and the useful unit to add to it is one per FEATURE
 * rather than one per property — each `||` also counts against the complexity ceiling.</p>
 *
 * <p>Deliberately loose on an unknown form, exactly as `isEntityMetadata` is loose on an unknown
 * `kind`: a vault written by a NEWER build may carry a fourth form, and rejecting the whole
 * record would lose an entry this build can still show. `isPaymentForm` is the strict gate and
 * it is applied where the value is USED, not where it is admitted.</p>
 */
export function hasValidPaymentFields(v: Record<string, unknown>): boolean {
  return optionalBoolean(v.isPayment) && optionalString(v.paymentForm);
}

// Two one-line predicates rather than two inline `x === undefined || …` pairs — the same split
// `configFormat.ts` and `typeGuards.ts` make, and for the same complexity-ceiling reason.
function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
