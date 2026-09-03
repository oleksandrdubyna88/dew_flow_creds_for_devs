import { DEFAULT_PAYMENT_FORM, PaymentForm, isPaymentForm } from './paymentForm';
import { PaymentFields, clearForForm } from './paymentFields';
import { cardFieldsFrom, cardInputsFrom, withBrand } from './cardFormFields';
import { switchWarning } from './paymentFormSwitch';
import { validatePayment } from './paymentValidation';
import { brandOf } from './cardBrand';
import { ShuffleCode, isShuffleCode } from './shuffle';
import { weavePaymentFields } from './paymentWeaving';
import { confirmDestructive, refuse } from './dialogs';
import { PhraseInput, phraseInputFrom, phraseRecordFor, phraseRefusalFor } from './phraseSaveGate';
import { phraseSaveWarning } from './phraseLayout';
import { describeError } from './describeError';

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
  const warning = switchNoticeFor(chosen, context);
  return warning === '' || confirmDestructive(warning, 'Switch and delete');
}

/**
 * What switching to `chosen` would destroy, as a sentence, or `''` when nothing is at stake.
 *
 * <p>No old form, no new form, or nothing stored to lose — all three mean nothing to say.</p>
 *
 * <p>Exported because the form's own selector now shows it the moment the choice is made, and the
 * save gate asks with it at the end. ONE function, so the notice and the confirmation cannot name
 * different fields — which they would, eventually, as two copies.</p>
 */
export function switchNoticeFor(chosen: string, context: PaymentSaveContext): string {
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
 * A checksum that does not hold, on a field about to become unrecoverable — asked before the save.
 *
 * <p>This is the third time in this feature a safety net shipped with <b>no caller</b>
 * (`clearForForm`, `withheldFromShare`, and now this), and a code review caught it again. The module
 * was written, tested and documented as "checked before saving, because saving a mixed field destroys
 * the original" — and nothing ever called it. A person could transpose two digits of an IBAN, tick
 * *store woven with a decoy*, and save: no warning, the value woven immediately with a plausible
 * decoy, and no way ever to notice or recover. The one moment the plan calls "the last moment anybody
 * can catch it" simply never happened.</p>
 *
 * <p>Only `confirm` warnings stop a save. A `hint` is said elsewhere and never blocks: a plain field
 * with a bad checksum is still stored, because people hold cards this build has never heard of.</p>
 */
export async function confirmChecksums(data: Record<string, unknown>, chosen: string): Promise<boolean> {
  const marked = markedFields(data);
  const confirms = validatePayment(clearForForm(cardFieldsFrom(data), formOf(chosen)), marked).filter(
    (warning) => warning.severity === 'confirm',
  );
  if (confirms.length === 0) {
    return true;
  }
  return confirmDestructive(
    `${confirms.map((warning) => warning.text).join('\n\n')}\n\nWeave and save anyway?`,
    'Weave and save',
  );
}

/**
 * The record a save writes: the boxes, the derived brand, and NOTHING the chosen form does not own.
 *
 * <p>`clearForForm` is what S1.2 shipped with no caller, and this is the caller. Without it a card
 * retyped as bank details keeps its number, CVV and PIN inside the record — gone from the form, and
 * present in every sync, backup and export. The person believes they replaced the contents.</p>
 */
export function paymentRecordFor(data: Record<string, unknown>, chosen: string): PaymentFields {
  // A phrase is woven whole rather than field by field: its two columns ARE the pair, so there is
  // nothing here for `weavePaymentFields` (which permutes the characters of one value) to do.
  if (formOf(chosen) === 'phrase') {
    return phraseRecordFor(phraseInputFrom(data), Math.random);
  }
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

/**
 * The payment kind's two save gates, in the order they must be asked.
 *
 * <p>The destructive switch first — it is about to delete something, so nothing else should be asked
 * before it. Then the checksums, which have to come BEFORE the weaving: afterwards there is no
 * original left to check against, and that is the whole reason this gate exists.</p>
 */
export async function paymentGates(
  data: Record<string, unknown>,
  context: PaymentSaveContext,
): Promise<boolean> {
  const chosen = textOf(data.paymentForm);
  return (
    (await confirmFormSwitch(chosen, context))
    && (await confirmChecksums(data, chosen))
    && (await confirmPhrase(data, chosen))
  );
}

/**
 * The phrase's own gate: what cannot be woven, and the bargain for what can.
 *
 * <p>Last of the three, and that order is the same argument the other two settled: the switch asks
 * before anything is destroyed, the checksums ask before an original is gone, and this asks about the
 * thing that is about to become unreadable to everybody including us.</p>
 *
 * <p>A refusal here costs the person nothing. The form panel keeps its state deliberately
 * (`retainContextWhenHidden`), so every typed word is exactly where it was, and no decoy has been
 * drawn — `phraseRecordFor` is the only thing that draws one, and it runs on a save that is going
 * through.</p>
 */
export async function confirmPhrase(data: Record<string, unknown>, chosen: string): Promise<boolean> {
  const input = phraseSaveFor(data, chosen);
  if (input === undefined) {
    return true;
  }
  const refusal = phraseRefusalFor(input) || buildFailure(input);
  if (refusal !== '') {
    refuse(refusal);
    return false;
  }
  return confirmDestructive(phraseSaveWarning(input.words.length, input.layout), 'Weave and save');
}

/** A phrase save with something in it, or nothing to ask about. */
function phraseSaveFor(data: Record<string, unknown>, chosen: string): PhraseInput | undefined {
  if (formOf(chosen) !== 'phrase') {
    return undefined;
  }
  const input = phraseInputFrom(data);
  return input.words.length === 0 ? undefined : input;
}

/**
 * A build, thrown away, so that the one impossible case is a sentence rather than a crash.
 *
 * <p>`generateDecoyPhrase` refuses loudly after sixty-four draws — deliberately, because an unbounded
 * search in a save path is a hung window. The odds of reaching it are not worth writing down; the
 * cost of a save that throws instead of refusing is, so it is caught here where there is still a
 * person to tell.</p>
 */
function buildFailure(input: PhraseInput): string {
  try {
    phraseRecordFor(input, Math.random);
    return '';
  } catch (error) {
    return describeError(error);
  }
}
