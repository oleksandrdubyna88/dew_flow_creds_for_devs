import { DEFAULT_PAYMENT_FORM, PaymentForm, isPaymentForm } from './paymentForm';
import { PaymentFields, clearForForm } from './paymentFields';
import { cardFieldsFrom, cardInputsFrom, withBrand } from './cardFormFields';
import { switchWarning } from './paymentFormSwitch';
import { brandOf } from './cardBrand';
import { confirmDestructive } from './dialogs';

/**
 * The payment kind's host-side half of a save: ask before a form switch destroys the old form, and
 * build the record that replaces it.
 *
 * <p>Its own module from the start rather than as a later extraction — `entityFormPanel.ts` sits at
 * the repository's 800-line ceiling, so new code for a ninth entry kind cannot live there. The panel
 * keeps only the dispatch lines that call these.</p>
 *
 * <p>(An earlier attempt did put this in the panel and then carved room out of it afterwards, slicing
 * a function mid-signature. The lesson is cheap to write down: when a file is AT its ceiling, the new
 * code goes somewhere else first, and nothing existing is touched at all.)</p>
 */

/** Just enough of the form's options to decide a switch — the panel's own interface, narrowed. */
export interface PaymentSaveContext {
  initial?: { paymentForm?: string };
  initialPayment?: PaymentFields;
}

/**
 * Retyping a payment instrument erases the form it left — so it is asked about, once, before the save.
 *
 * <p>The confirmation names FIELDS and never values (`paymentFormSwitch.ts`), and it fires only when
 * something is actually stored under the old form: a modal for an empty record is the modal people
 * learn to dismiss without reading. Declining returns `false` and the save does not happen, which
 * leaves the entry — and its old record — exactly as it was.</p>
 */
export async function confirmFormSwitch(chosen: string, context: PaymentSaveContext): Promise<boolean> {
  const warning = warningFor(chosen, context);
  return warning === '' || confirmDestructive(warning, 'Switch and delete');
}

/** No old form, no new form, or nothing stored to lose — all three mean nothing to ask about. */
function warningFor(chosen: string, context: PaymentSaveContext): string {
  const pair = switchPair(context.initial?.paymentForm, chosen);
  return pair === undefined ? '' : switchWarning(pair.from, pair.to, context.initialPayment ?? {});
}

/**
 * The two forms of a real switch, or nothing.
 *
 * <p>A switch needs two forms this build knows and they must actually differ — an entry saved without
 * touching the selector is not a switch, and neither is one whose stored form predates a build that
 * knew the name.</p>
 */
function switchPair(from: string | undefined, to: string): { from: PaymentForm; to: PaymentForm } | undefined {
  if (!isPaymentForm(from) || !isPaymentForm(to) || from === to) {
    return undefined;
  }
  return { from, to };
}

/**
 * The record a save writes: the boxes, the derived brand, and NOTHING the chosen form does not own.
 *
 * <p>`clearForForm` is what S1.2 shipped with no caller, and this is the caller. Without it a card
 * retyped as bank details keeps its number, CVV and PIN inside the record — gone from the form, and
 * present in every sync, backup and export. The person believes they replaced the contents.</p>
 */
export function paymentRecordFor(data: Record<string, unknown>, chosen: string): PaymentFields {
  const typed = withBrand(cardFieldsFrom(data), brandOf(textOf(data.cardNumber)));
  return clearForForm(typed, formOf(chosen));
}

/** The chosen form, defaulted — the same fallback the metadata field gets. */
export function formOf(chosen: string): PaymentForm {
  return isPaymentForm(chosen) ? chosen : DEFAULT_PAYMENT_FORM;
}

/**
 * Hand a stored record to the webview, in reply to its own request.
 *
 * <p>Answered on REQUEST rather than pushed on mount: the page asks once its listener is attached, so
 * there is no window in which the values are posted at nobody. And never rendered into the page's
 * HTML — that is the rule this kind adds, because the HTML is a string that gets built, concatenated
 * and, the moment anything goes wrong, logged.</p>
 */
export function answerCardValues(post: (message: unknown) => void, context: PaymentSaveContext): void {
  post({ type: 'paymentValues', fields: cardInputsFrom(context.initialPayment ?? {}) });
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
