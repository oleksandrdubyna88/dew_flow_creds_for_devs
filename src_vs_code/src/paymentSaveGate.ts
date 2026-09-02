import { DEFAULT_PAYMENT_FORM, PaymentForm, isPaymentForm } from './paymentForm';
import { PaymentFields, clearForForm } from './paymentFields';
import { cardFieldsFrom, cardInputsFrom, withBrand } from './cardFormFields';
import { switchWarning } from './paymentFormSwitch';
import { brandOf } from './cardBrand';
import { ShuffleCode, isShuffleCode } from './shuffle';
import { weavePaymentFields } from './paymentWeaving';
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
  const kept = clearForForm(typed, formOf(chosen));
  // Woven LAST, and after the form switch has already dropped what the chosen form does not own —
  // weaving a field that is about to be discarded would burn a decoy for nothing, and worse, would
  // mark the record as having a woven field it no longer holds.
  //
  // The brand is derived above, from the number BEFORE it is woven. That is the whole reason it is a
  // stored field: after weaving there is no number to read it from (§3a).
  return weavePaymentFields(kept, markedFields(data), codesFor(data), Math.random);
}

/** Which boxes the person ticked. Anything the record cannot weave is ignored by the weaver itself. */
function markedFields(data: Record<string, unknown>): readonly string[] {
  const marked = data.mixFields;
  return Array.isArray(marked) ? marked.filter((one): one is string => typeof one === 'string') : [];
}

/**
 * The method per field: the one picked for all of them, unless a field was given its own.
 *
 * <p>The argument against per-field codes stays on the record — four codes on one card is four
 * chances to forget, and a forgotten code is lost data. It is answered by the interface rather than by
 * removing the choice: the careful person remembers one, the paranoid four, and neither pays for the
 * other's decision.</p>
 */
function codesFor(data: Record<string, unknown>): Record<string, ShuffleCode> {
  const shared = textOf(data.mixMethod);
  const perField = data.mixMethods;
  const own = perField !== null && typeof perField === 'object' ? (perField as Record<string, unknown>) : {};
  return Object.fromEntries(
    markedFields(data).flatMap((field) => {
      const code = textOf(own[field]) || shared;
      return isShuffleCode(code) ? [[field, code] as const] : [];
    }),
  );
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
