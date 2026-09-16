import { SECOND_KEYS, SecondKey, SecondValues, WeavePoint, secondKeyOf } from './secondValues';
import { SecondInput } from './secondSave';
import { secondModeOf } from './secondModeMarkup';

/**
 * The page's message, read into the one shape the save rule takes.
 *
 * <p>Defensive in the way every reader of a webview payload here is: the boxes arrive as a record
 * from a page, so they are walked by the KEY LIST rather than by the incoming object, and a key a
 * newer build — or a crafted message — put there does not enter the save. `pickSecondValues` does
 * the same thing one module away, for the same reason.</p>
 *
 * <h3>Two modes on one page</h3>
 *
 * <p>A page carries the password's control and the payment section's, and they govern different
 * fields. Each is read for ITS OWN fields: `weaveSecondMode` decides the password, `mixSecondMode`
 * the five payment fields. Neither can answer for the other, which is why the rule downstream is
 * handed a list of fields rather than a mode.</p>
 *
 * <p>Pure: no `vscode`.</p>
 */

/** Which weave points a form governs, and the control that says whose half they get. */
export interface SecondForm {
  readonly modeField: string;
  readonly points: readonly WeavePoint[];
}

/** The password's control governs the password; the payment section's governs the other five. */
export const PASSWORD_FORM: SecondForm = { modeField: 'weaveSecondMode', points: ['password'] };
export const PAYMENT_FORM: SecondForm = {
  modeField: 'mixSecondMode',
  points: ['number', 'cvv', 'pin', 'iban', 'accountNumber'],
};

/**
 * Everything the save needs about second values, from the page and from what is stored.
 *
 * <p>`weaving` is what each form reports it is ABOUT TO weave — the password when `wovenSave` says it
 * wove one, the marked payment fields that were not already woven. Only those of them whose form is
 * on `own` become `ownWoven`, because only those consume something the person typed.</p>
 */
export function secondInputFrom(
  data: Record<string, unknown>,
  stored: SecondValues,
  weaving: readonly WeavePoint[],
  forms: readonly SecondForm[] = [PASSWORD_FORM, PAYMENT_FORM],
): SecondInput {
  const own = forms.filter((form) => secondModeOf(data[form.modeField]) === 'own');
  const ownPoints = new Set<string>(own.flatMap((form) => [...form.points]));
  return {
    typed: secondTyped(data),
    cleared: clearedFrom(data),
    ownWoven: weaving.filter((point) => ownPoints.has(point)),
    stored,
  };
}

/** The boxes, by the key list. A value that is not a string is not a value. */
export function secondTyped(data: Record<string, unknown>): SecondValues {
  const source = record(data.secondValues);
  return Object.fromEntries(
    SECOND_KEYS.flatMap((key) => (typeof source[key] === 'string' ? [[key, source[key]]] : [])),
  ) as SecondValues;
}

/** The clear ticks, by the key list, so an unknown name cannot delete anything. */
function clearedFrom(data: Record<string, unknown>): readonly SecondKey[] {
  const source = record(data.clearSecond);
  return SECOND_KEYS.filter((key) => source[key] === true);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** The typed halves for the weave itself, keyed by FIELD — what `weavePaymentFields` takes. */
export function secondsForWeave(input: SecondInput): Record<string, string> {
  return Object.fromEntries(
    input.ownWoven.flatMap((point) => {
      const typed = input.typed[secondKeyOf(point)] ?? '';
      return typed.length === 0 ? [] : [[point, typed] as const];
    }),
  );
}
