import { PaymentFields } from './paymentFields';
import { luhn } from './cardBrand';
import { ibanConverges } from './decoyDigits';

/**
 * Checked before saving, because saving a mixed field destroys the original.
 *
 * <p>This is a real hole rather than a formality. A field marked <b>mix</b> is stored woven with a
 * decoy under a code kept nowhere, so after the save there is no original to compare against: a typo
 * in a mixed field can never be noticed — not in the viewer, not in a backup, not next year.</p>
 *
 * <p>Hence the split this module exists for:</p>
 *
 * <ul>
 *   <li>a <b>plain</b> field with a failing checksum is a <b>hint</b> — said, and saved. People hold
 *       cards and accounts this build has never heard of, and a vault that refuses a real value is a
 *       vault they keep a photo of instead;</li>
 *   <li>a <b>mixed</b> field with a failing checksum is a <b>confirm</b> — the last moment anybody can
 *       catch it.</li>
 * </ul>
 *
 * <p><b>Nothing here refuses a save.</b> It returns warnings; the form decides what a `confirm` means.
 * Pure, and free of `vscode`.</p>
 */
export type WarningSeverity = 'hint' | 'confirm';

export interface Warning {
  /** The record field this is about — the form uses it to put the message beside the right box. */
  readonly field: string;
  readonly text: string;
  readonly severity: WarningSeverity;
}

/**
 * The fields with something checkable about them, and how to check it.
 *
 * <p>A table for the reason every list in this feature is a table: a tenth field is a row. What is NOT
 * here is as deliberate as what is — an internal account number, a CVV and a PIN have no structure, and
 * inventing a rule for them would reject real values. That is §3a's point, not an omission.</p>
 */
const CHECKS: ReadonlyArray<{
  field: keyof PaymentFields;
  label: string;
  minimum: number;
  converges: (value: string) => boolean;
}> = [
  { field: 'number', label: 'card number', minimum: 12, converges: luhn },
  { field: 'iban', label: 'IBAN', minimum: 15, converges: ibanConverges },
];

/**
 * Every warning this record earns, in the order the checks are listed.
 *
 * <p>`mixed` is the list of fields the person marked to be woven — `shuffledFields` in the record.
 * It is the only thing that turns a hint into a confirmation.</p>
 */
export function validatePayment(fields: PaymentFields, mixed: readonly string[]): readonly Warning[] {
  const marked = new Set(mixed);
  return CHECKS.flatMap((check) => warningFor(check, textOf(fields[check.field]), marked.has(check.field)));
}

/** Zero or one warning, so the caller gets a flat list rather than a list of maybes. */
function warningFor(
  check: (typeof CHECKS)[number],
  value: string,
  isMixed: boolean,
): readonly Warning[] {
  if (!worthChecking(value, check.minimum) || check.converges(value)) {
    return [];
  }
  return [{ field: check.field, text: textFor(check.label, isMixed), severity: isMixed ? 'confirm' : 'hint' }];
}

/**
 * An empty box is not a mistake, and neither is a half-typed one.
 *
 * <p>A checksum on four digits is meaningless, and a warning there is how people learn to ignore
 * warnings — which costs more than the one it would have caught.</p>
 */
function worthChecking(value: string, minimum: number): boolean {
  return value.replace(/[\s-]/g, '').length >= minimum;
}

/**
 * The sentence, which never contains the value it is about.
 *
 * <p>The rule every message in this feature follows: quoting the number puts it on screen, in a log,
 * and in whatever screenshot the person sends when they ask what the message means.</p>
 */
function textFor(label: string, isMixed: boolean): string {
  return isMixed
    ? `This ${label} does not add up, and it is marked to be woven with a decoy — after saving there `
      + 'is no original to compare it against, so a mistake here cannot be found later. Check it now.'
    : `This ${label} does not add up. Worth checking — it will be saved either way.`;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
